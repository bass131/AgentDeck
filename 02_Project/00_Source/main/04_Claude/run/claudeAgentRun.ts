import { RunEventNormalizer, nextRunTag } from '../stream/eventNormalizer'
import { PermissionCoordinator } from '../permission/permissionCoordinator'
import { buildClaudeSdkOptions, makeRefusalFallbackHandler } from '../sdkOptions'
import { getUserDataDir } from '@main/02_Common/userData'
import { PERMISSION_NODES } from '../permission/controlNodes'
import { controlsForRun, type ControlsForRun } from '../permission/controlsStore'
import { getDefaultQueryFn, captureSupportedCommands } from '../queryFn'
import { normalizeRunModel } from '../runArgs'
import { LIVE_MODE_TO_SDK } from '../permissionModes'
import { buildModelContextPrompt } from '../buildPrompt'
import { BgTaskObserver } from './bgTaskObserver'
import { SendTokenLedger } from './sendTokenLedger'
import { IdleCloseGovernor } from './idleCloseGovernor'
import type { QueryFn, PersistentQueryFn } from '../queryFn'
import type { AgentRun, AgentRunInput, RunResponse } from '@main/03_Agent/AgentBackend'
import type { AgentEvent, AgentEventDone } from '@shared/agentEvents'
import { contextFallbackBudget } from '../buildPrompt'
import type { SlashCommandInfo } from '@shared/ipcContract'

export { IDLE_CLOSE_GRACE_MS } from './idleCloseGovernor'

export const MAX_CONSECUTIVE_AUTONOMOUS_TURNS = 100

// 엔진 경로 잠금에 넘길 userData 경로 (M07 G3). 실행마다 다시 읽는다 — 임시 --user-data-dir도 그 경로가 잠긴다.
// Electron 밖(단위 테스트)에서는 app이 없어 던진다. 그때는 잠금 없이 열고 main 로그에 남긴다.
function userDataForLock(): { userDataDir?: string } {
  try {
    return { userDataDir: getUserDataDir() }
  } catch (err) {
    console.error('[controls] 엔진 경로 잠금 — userData 경로를 얻지 못해 잠금 없이 연다:', err instanceof Error ? err.message : err)
    return {}
  }
}

// 컨트롤 설정 (M07 G5). 실행을 열 때 한 번 읽어 그 실행에 고정한다 — 토글은 다음 실행부터다.
// 이어지는(persistent) 실행은 세션을 다시 열 때 반영된다. 봉인이 맞지 않으면 실행을 열지 않는다(controlsStore.ts).
// userData 경로를 못 얻으면(Electron 밖 단위 테스트) 기본 등록부로 연다 — 에이전트가 만들 수 있는 상태가 아니다.
function controlsAtRunStart(): ControlsForRun {
  let userData: string
  try {
    userData = getUserDataDir()
  } catch {
    return { ok: true, nodes: PERMISSION_NODES }
  }
  return controlsForRun(userData)
}

export class ClaudeAgentRun implements AgentRun {
  readonly events: AsyncIterable<AgentEvent>

  private _aborted = false
  private _abortController = new AbortController()
  private _queryHandle: {
    interrupt?: () => Promise<void>
    stopTask?: (taskId: string) => unknown
    setPermissionMode?: (mode: string) => unknown
    setModel?: (model: string) => unknown
  } | null = null
  private _interrupted = false

  private _queue: AgentEvent[] = []
  private _resolveNext: (() => void) | null = null
  private _closed = false
  private _pumpStarted = false

  private readonly _perm: PermissionCoordinator

  private readonly _normalizer: RunEventNormalizer

  private _inputQueue: string[] = []

  private _resolveInput: (() => void) | null = null

  private _idleClosing = false

  private readonly _idleGovernor: IdleCloseGovernor

  private _consecutiveAutonomousTurns = 0

  private _onSessionClosing: (() => void) | null = null

  private readonly _sendTokens = new SendTokenLedger()

  private get _queuedSendSeqs(): number[] {
    return this._sendTokens.queuedSeqs
  }

  private readonly _bgTaskObserver: BgTaskObserver

  private _currentOrchestration: boolean

  private _currentModeId: string | null = null

  private _currentModel: string | null

  private readonly _req: AgentRunInput
  private readonly _queryFn: QueryFn | null
  private readonly _skillOverridesProvider: () => Record<string, 'off'> | null
  private readonly _mcpDeniedProvider: () => { serverName: string }[] | null
  private readonly _onCommandsCaptured: ((cmds: SlashCommandInfo[]) => void) | null
  private readonly _controlsAtRunStart: () => ControlsForRun

  constructor(
    req: AgentRunInput,
    queryFn: QueryFn | null,
    skillOverridesProvider: () => Record<string, 'off'> | null,
    mcpDeniedProvider: () => { serverName: string }[] | null,
    onCommandsCaptured: ((cmds: SlashCommandInfo[]) => void) | null = null,
    controlsProvider: () => ControlsForRun = controlsAtRunStart,
  ) {
    this._req = req
    this._controlsAtRunStart = controlsProvider
    this._queryFn = queryFn
    this._skillOverridesProvider = skillOverridesProvider
    this._mcpDeniedProvider = mcpDeniedProvider
    this._onCommandsCaptured = onCommandsCaptured
    this._currentOrchestration = req.orchestration === true
    this._currentModel = normalizeRunModel(req.model) ?? null
    this._perm = new PermissionCoordinator((e) => this._push(e))
    this._bgTaskObserver = new BgTaskObserver((e) => this._push(e))
    this._idleGovernor = new IdleCloseGovernor({
      emit: (e) => this._push(e),
      isRunActive: () => !this._aborted && !this._closed,
      externalGatesOpen: () => this._idleGateOpen() && this._inputQueue.length === 0,
      onGraceCommit: () => {
        this._idleClosing = true
        if (this._resolveInput) {
          const r = this._resolveInput
          this._resolveInput = null
          r()
        }
      },
    })
    this._normalizer = new RunEventNormalizer(nextRunTag(), req.workspaceRoot ?? undefined)
    this.events = this._createEventStream()
  }

  abort(): void {
    if (this._aborted) return
    this._aborted = true

    this._abortController.abort()

    if (this._queryHandle?.interrupt) {
      try {
        void Promise.resolve(this._queryHandle.interrupt()).catch(() => {})
      } catch {
      }
    }

    this._perm.cancelAll()

    const abortEvents = this._normalizer.abortCleanup()
    for (const e of abortEvents) this._push(e)

    if (this._resolveInput) {
      const r = this._resolveInput
      this._resolveInput = null
      r()
    }

    this._idleGovernor.cancelGrace()

    this._bgTaskObserver.stopAll()

    this._close()
  }

  stopTask(taskId: string): void {
    const handle = this._queryHandle
    if (!handle || typeof handle.stopTask !== 'function') return
    try {
      void Promise.resolve(handle.stopTask(taskId)).catch(() => {})
    } catch {
    }
  }

  setPermissionMode(modeId: string): void {
    if (this._req.persistent !== true) return
    const sdkMode = LIVE_MODE_TO_SDK[modeId]
    if (sdkMode === undefined) return
    this._currentModeId = modeId
    const handle = this._queryHandle
    if (!handle || typeof handle.setPermissionMode !== 'function') return
    try {
      void Promise.resolve(handle.setPermissionMode(sdkMode)).catch(() => {})
    } catch {
    }
  }

  setModel(modelId: string): void {
    if (this._req.persistent !== true) return
    const resolved = normalizeRunModel(modelId)
    if (resolved === undefined) return
    if (resolved === this._currentModel) return
    const handle = this._queryHandle
    if (!handle || typeof handle.setModel !== 'function') return
    const prev = this._currentModel
    this._currentModel = resolved
    // 계기가 다음 턴 결과에서 새 주 모델의 창을 고르게 한다 (M06 G4). 전환이 거절되면 되돌린다.
    this._normalizer.setMainModel(resolved)
    const rollback = (): void => {
      if (this._currentModel !== resolved) return
      this._currentModel = prev
      if (prev !== null) this._normalizer.setMainModel(prev)
    }
    try {
      void Promise.resolve(handle.setModel(resolved)).catch(rollback)
    } catch {
      rollback()
    }
  }

  interrupt(): void {
    if (this._aborted) return
    if (this._queryHandle?.interrupt) {
      this._interrupted = true
      try {
        void Promise.resolve(this._queryHandle.interrupt()).catch(() => {})
      } catch {
      }
    }
  }

  respond(requestId: string, response: RunResponse): void {
    this._perm.respond(requestId, response)
  }

  onSessionClosing(cb: () => void): void {
    this._onSessionClosing = cb
  }

  setOrchestration(value: boolean): void {
    this._currentOrchestration = value
  }

  push(content: string): void {
    this._inputQueue.push(content)
    this._sendTokens.issue()
    if (this._idleClosing && !this._closed) {
      this._idleClosing = false
    }
    this._idleGovernor.cancelGrace()
    if (!this._closed && !this._aborted) {
      this._idleGovernor.scheduleGrace()
    }
    this._consecutiveAutonomousTurns = 0
    if (this._resolveInput) {
      const r = this._resolveInput
      this._resolveInput = null
      r()
    }
  }

  private _push(event: AgentEvent): void {
    if (this._closed) return
    this._queue.push(event)
    this._wake()
  }

  private _close(): void {
    if (this._closed) return
    this._closed = true
    this._wake()
  }

  private _wake(): void {
    if (this._resolveNext) {
      const r = this._resolveNext
      this._resolveNext = null
      r()
    }
  }

  private _idleGateOpen(): boolean {
    return (
      this._sendTokens.outstandingCount() === 0 &&
      !this._normalizer.hasLoopActivity() &&
      this._bgTaskObserver.gateOpen()
    )
  }

  private async *_createEventStream(): AsyncGenerator<AgentEvent> {
    if (!this._pumpStarted) {
      this._pumpStarted = true
      if (!this._aborted) {
        if (this._req.persistent === true) {
          void this._runPersistentPump()
        } else {
          void this._runPump()
        }
      } else {
        this._close()
      }
    }

    for (;;) {
      while (this._queue.length > 0) {
        yield this._queue.shift()!
      }
      if (this._closed) return
      await new Promise<void>((resolve) => {
        this._resolveNext = resolve
      })
    }
  }

  private async _prepareQuery(): Promise<{ resolvedQueryFn: QueryFn; sdkOptions: Record<string, unknown> } | null> {
    const controls = this._controlsAtRunStart()
    if (!controls.ok) {
      console.error(`[controls] controls.json 봉인 ${controls.status} — 실행을 열지 않는다`)
      this._push({ type: 'error', message: controls.message })
      this._push({ type: 'done' })
      return null
    }

    let resolvedQueryFn: QueryFn
    try {
      resolvedQueryFn = this._queryFn !== null ? this._queryFn : await getDefaultQueryFn()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this._push({ type: 'error', message: `Failed to load Agent SDK: ${msg}` })
      this._push({ type: 'done' })
      return null
    }

    if (this._aborted) return null

    const canUseTool = this._perm.makeCanUseTool(
      () => this._currentModeId ?? this._req.mode,
      () => this._currentOrchestration,
      controls.nodes
    )
    const sdkOptions = buildClaudeSdkOptions({
      req: this._req,
      abortController: this._abortController,
      canUseTool,
      skillOverrides: this._skillOverridesProvider(),
      mcpDenied: this._mcpDeniedProvider(),
      onUserDialog: makeRefusalFallbackHandler(this._normalizer, (e) => this._push(e)),
      ...userDataForLock(),
    })
    return { resolvedQueryFn, sdkOptions }
  }

  private async _runPump(): Promise<void> {
    try {
      const prompt = buildModelContextPrompt(this._req.messages, {
        resumeSessionId: this._req.resumeSessionId,
        contextBudgetTokens: contextFallbackBudget(this._req.contextWindow),
      })

      if (!prompt) {
        this._push({ type: 'error', message: 'No user message found in AgentRunInput.messages' })
        this._push({ type: 'done' })
        return
      }

      if (this._aborted) return

      const prep = await this._prepareQuery()
      if (!prep) return
      const { resolvedQueryFn, sdkOptions } = prep

      let queryIterable: AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
      try {
        queryIterable = resolvedQueryFn({ prompt, options: sdkOptions })
        this._queryHandle = queryIterable
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this._push({ type: 'error', message: `Failed to start agent query: ${msg}` })
        this._push({ type: 'done' })
        return
      }

      captureSupportedCommands(queryIterable, this._onCommandsCaptured)

      this._normalizer.resetStreaming()

      try {
        let lastDone: AgentEvent | null = null
        for await (const msg of queryIterable) {
          if (this._aborted || this._abortController.signal.aborted) {
            return
          }
          const { events: normEvents, done } = this._normalizer.process(msg)
          this._bgTaskObserver.maybeStartTail(msg)
          for (const e of normEvents) {
            this._bgTaskObserver.observeEvent(e)
            if (e.type === 'permission_mode') {
              this._currentModeId = e.mode
            }
            this._push(e)
          }
          if (done !== null) {
            lastDone = done
          }
        }

        if (!this._aborted && !this._abortController.signal.aborted) {
          this._push(lastDone ?? { type: 'done' })
        }
      } catch (err) {
        if (this._aborted || this._abortController.signal.aborted) {
          return
        }
        if (this._interrupted) {
          console.warn(
            '[agents] interrupt 중 단발 펌프 throw 억제(문구 순화) — 원문:',
            err instanceof Error ? err.message : String(err)
          )
          this._push({ type: 'done' })
          return
        }
        const msg = err instanceof Error ? err.message : String(err)
        this._push({ type: 'error', message: `Agent execution error: ${msg}` })
        this._push({ type: 'done' })
      }
    } finally {
      this._normalizer.singlePumpCleanup()
      this._bgTaskObserver.stopAll()
      this._close()
    }
  }

  private async *_inputGen(): AsyncGenerator<unknown> {
    while (true) {
      if (this._aborted || this._abortController.signal.aborted) {
        return
      }

      if (this._idleClosing) {
        if (this._inputQueue.length > 0 || this._sendTokens.outstandingCount() > 0) {
          this._idleClosing = false
        } else {
          this._onSessionClosing?.()
          this._onSessionClosing = null
          return
        }
      }

      if (this._inputQueue.length > 0) {
        const content = this._inputQueue.shift()!
        const desync = this._queuedSendSeqs.length === 0
        this._sendTokens.deliverNext()
        if (desync) {
          console.warn(
            '[agents] send-token 회계 desync — _inputQueue에 content가 있는데 _queuedSendSeqs가 비어 있음(1:1 불변식 위반). token-less로 폴백 전달합니다.'
          )
        }
        yield {
          type: 'user' as const,
          message: {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: content }],
          },
          parent_tool_use_id: null,
        }
        continue
      }

      await new Promise<void>((resolve) => {
        this._resolveInput = resolve
      })
    }
  }

  private async _runPersistentPump(): Promise<void> {
    let streamThrew = false
    try {
      const initialPrompt = buildModelContextPrompt(this._req.messages, {
        resumeSessionId: this._req.resumeSessionId,
        contextBudgetTokens: contextFallbackBudget(this._req.contextWindow),
      })

      if (!initialPrompt) {
        this._push({ type: 'error', message: 'No user message found in AgentRunInput.messages' })
        this._push({ type: 'done' })
        return
      }

      this._inputQueue.push(initialPrompt)
      this._sendTokens.issue()

      if (this._aborted) return

      const prep = await this._prepareQuery()
      if (!prep) return
      const { resolvedQueryFn, sdkOptions } = prep

      let queryIterable: AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
      try {
        queryIterable = (resolvedQueryFn as unknown as PersistentQueryFn)({ prompt: this._inputGen(), options: sdkOptions })
        this._queryHandle = queryIterable
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this._push({ type: 'error', message: `Failed to start agent query: ${msg}` })
        this._push({ type: 'done' })
        return
      }

      captureSupportedCommands(queryIterable, this._onCommandsCaptured)

      this._normalizer.resetStreaming()

      try {
        for await (const msg of queryIterable) {
          if (this._aborted || this._abortController.signal.aborted) {
            return
          }

          this._sendTokens.anchorIfEligible(msg)

          const turnOrigin: 'user' | 'cron' = this._sendTokens.hasOwnedToken() ? 'user' : 'cron'

          this._idleGovernor.absorbActivity(turnOrigin)

          const { events: normEvents, done } = this._normalizer.process(msg, turnOrigin)

          this._bgTaskObserver.maybeStartTail(msg)

          for (const e of normEvents) this._handleNormalizedEvent(e)

          if (done !== null) this._handleTurnBoundary(done, turnOrigin)
        }
      } catch (err) {
        streamThrew = true
        if (this._aborted || this._abortController.signal.aborted) {
          return
        }
        if (this._interrupted) {
          console.warn(
            '[agents] interrupt 중 지속세션 펌프 throw 억제(문구 순화) — 원문:',
            err instanceof Error ? err.message : String(err)
          )
          this._interrupted = false
          this._push({ type: 'done' })
          return
        }
        const errMsg = err instanceof Error ? err.message : String(err)
        this._push({ type: 'error', message: `Agent execution error: ${errMsg}` })
        this._push({ type: 'done' })
      }
    } finally {
      const gracePendingAtExit = this._idleGovernor.isGracePending()
      this._idleGovernor.cancelGrace()
      this._bgTaskObserver.stopAll()
      if (gracePendingAtExit && !this._aborted && !streamThrew) {
        this._push({ type: 'autonomy_status', status: 'ended', reason: 'grace-expired' })
      }
      const loopEvents = this._normalizer.persistentPumpCleanup()
      for (const e of loopEvents) this._push(e)
      if (this._resolveInput) {
        const r = this._resolveInput
        this._resolveInput = null
        r()
      }
      this._close()
    }
  }

  private _handleNormalizedEvent(e: AgentEvent): void {
    if (e.type === 'bg_task') {
      this._bgTaskObserver.observeEvent(e)
      if (
        e.kind === 'notification' &&
        this._idleGateOpen() &&
        !this._idleClosing &&
        !this._aborted &&
        this._idleGovernor.sessionStateGateOpen()
      ) {
        this._idleGovernor.scheduleGrace()
      }
    }
    if (e.type === 'session_state') {
      this._idleGovernor.observeSessionState(e.state)

      if (e.state === 'idle') {
        if (this._idleGateOpen() && !this._idleClosing && !this._aborted) {
          this._idleGovernor.scheduleGrace()
        }
      } else {
        this._idleGovernor.cancelGrace()
      }
    }
    if (e.type === 'permission_mode') {
      this._currentModeId = e.mode
    }
    if (this._interrupted && e.type === 'error') return
    this._push(e)
  }

  private _handleTurnBoundary(done: AgentEventDone, turnOrigin: 'user' | 'cron'): void {
    this._sendTokens.completeTurn()
    this._push({ ...done, origin: turnOrigin })
    if (this._interrupted) this._interrupted = false

    if (turnOrigin === 'user') {
      this._consecutiveAutonomousTurns = 0
    } else {
      this._consecutiveAutonomousTurns++
    }

    if (turnOrigin === 'cron' && this._consecutiveAutonomousTurns >= MAX_CONSECUTIVE_AUTONOMOUS_TURNS) {
      this._push({ type: 'autonomy_status', status: 'ended', reason: 'cap-reached' })
      this._idleGovernor.cancelGrace()
      this._idleClosing = true
      if (this._resolveInput) {
        const r = this._resolveInput
        this._resolveInput = null
        r()
      }
    } else if (this._idleGateOpen() && this._idleGovernor.sessionStateGateOpen()) {
      this._idleGovernor.scheduleGrace()
    } else {
      this._idleGovernor.cancelGrace()
    }
  }
}
