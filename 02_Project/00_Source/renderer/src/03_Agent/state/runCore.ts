import type {
  AgentEventPayload,
  AgentRunRequest,
  ConversationMessage,
  PermissionResponse,
} from '@shared/ipcContract'
import type { ThreadItem } from '@renderer/05_Conversation/state/threadTypes'
import type { AttachedImage } from '@renderer/00_App/state/types'
import { nextMsgId } from '@renderer/00_App/state/ids'
import { buildEnginePrompt } from '@renderer/05_Conversation/composerNotes'
import { extractMentions } from '@renderer/05_Conversation/mentions'
import { commandOf, goalDetailOf } from '../cmdCards'
import { nowTimeKo } from '../time'
import { createStaleTimer, isStaleNow, remainingStaleMs } from './staleWatchdog'
import type { StaleTimerHandle } from './staleWatchdog'
import type { RunAction, RunCoreState } from './runReducer'

// 단일·멀티 공용 실행 코어 — 전송·중단·interrupt·권한 응답·질문 응답·stale 감시를 한 구현으로 둔다.
// 상태의 거처는 모른다. 어댑터(runtime.ts, panelSession.ts)가 readState·dispatch 포트와 부수효과 콜백을 넘긴다.

export interface SendOptions {
  picker?: { model: string; effort: string; mode: string }
  workspaceRoot?: string
  sysPrompt?: string
  orchestration?: boolean
  images?: AttachedImage[]
  resumeSessionId?: string
  persistent?: boolean
  sessionKey?: string
}

export function buildAgentRunArgs(
  history: ConversationMessage[],
  opts?: SendOptions
): AgentRunRequest {
  return {
    messages: history,
    workspaceRoot: opts?.workspaceRoot,
    model: opts?.picker?.model,
    effort: opts?.picker?.effort,
    mode: opts?.picker?.mode,
    systemPrompt: opts?.sysPrompt,
    orchestration: opts?.orchestration,
    resumeSessionId: opts?.resumeSessionId,
    ...(opts?.persistent ? { persistent: true } : {}),
    ...(opts?.sessionKey !== undefined ? { sessionKey: opts.sessionKey } : {}),
  }
}

// 엔진에 보낼 사용자 메시지(E4, 단일 규칙) — /로 시작하면 원문, 아니면 @멘션과 첨부 이미지 노트를 붙인다.
// 단일 입력창(Conversation.tsx)은 같은 규칙을 아직 자기 쪽에서 계산해 promptForEngine으로 넘긴다(입력창 통합은 G9b).
export function enginePromptFor(text: string, imagePaths: string[]): string {
  if (text.startsWith('/')) return text
  return buildEnginePrompt(text, {
    mentions: extractMentions(text),
    images: imagePaths.length > 0 ? imagePaths : undefined,
  })
}

// agentRun 직전에 어댑터가 정하는 실행 대상 — 작업 폴더, 이어갈 SDK 세션, REPL 세션키.
export interface RunTarget {
  workspaceRoot?: string
  resumeSessionId?: string
  persistent?: boolean
  sessionKey?: string
}

export interface RunSendInput {
  text: string
  // 엔진에 보낼 마지막 사용자 메시지. 비면 text를 그대로 보낸다.
  engineText?: string
  displayImages?: string[]
  options?: SendOptions
}

export interface InterruptTarget {
  runId: string
  runGeneration: string | null
  owner: string | null
}

export interface RunCorePorts<S extends RunCoreState> {
  readState: () => S
  dispatch: (action: RunAction) => void
  refreshStale: () => void
  resolveRunTarget: (before: S, options: SendOptions | undefined) => RunTarget | Promise<RunTarget>
  // interrupt 응답이 왔을 때 같은 실행인지 가르는 소유자 식별(단일은 대화 id). 없으면 runId·세대만 본다.
  owner?: () => string | null
  onRunStarted?: (runId: string) => void
  onInterruptRejected?: (target: InterruptTarget, foregroundClosed: boolean) => void
  onPermissionMode?: (mode: string) => void
  onEvent?: (payload: AgentEventPayload) => void
}

export interface RunCore {
  send: (input: RunSendInput) => Promise<void>
  abort: () => Promise<void>
  interrupt: () => Promise<void>
  respondPermission: (behavior: PermissionResponse['behavior']) => Promise<void>
  respondQuestion: (answers: string[][] | null) => Promise<void>
  // 현재 run의 이벤트면 적용하고 true. 아니면 건드리지 않고 false.
  handleEvent: (payload: AgentEventPayload) => boolean
}

const pendingRunGenerations = new Set<string>()

function isPendingGeneration(runGeneration: string | null | undefined): boolean {
  return runGeneration !== null && runGeneration !== undefined && pendingRunGenerations.has(runGeneration)
}

function msgHistory(thread: ThreadItem[]): ConversationMessage[] {
  return thread
    .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
    .map((m) => ({ role: m.role, content: m.text }))
}

export function createRunCore<S extends RunCoreState>(ports: RunCorePorts<S>): RunCore {
  const ownerNow = (): string | null => (ports.owner ? ports.owner() : null)

  const send = async (input: RunSendInput): Promise<void> => {
    const before = ports.readState()
    // E1: 실행 중 재전송은 무시한다. E2: 전송마다 새 실행 세대를 단다. E3: 지난 오류를 지운다.
    if (before.isRunning) return
    const runGeneration = crypto.randomUUID()
    const startFields = { runGeneration, clearError: true }

    const cmdName = commandOf(input.text)
    if (cmdName) {
      const cardId = `cmd-${nextMsgId()}`
      const cmdDetail = goalDetailOf(cmdName, input.text)
      ports.dispatch({
        type: 'ADD_COMMAND_CARD',
        name: cmdName,
        cardId,
        time: nowTimeKo(),
        nowMs: Date.now(),
        ...(cmdDetail ? { detail: cmdDetail } : {}),
        ...startFields,
      })
    } else {
      const displayImages = input.displayImages ?? []
      ports.dispatch({
        type: 'ADD_USER_MESSAGE',
        id: nextMsgId(),
        content: input.text,
        time: nowTimeKo(),
        ...(displayImages.length > 0 ? { images: displayImages } : {}),
        ...startFields,
      })
    }

    const history: ConversationMessage[] = [
      ...msgHistory(before.thread),
      { role: 'user', content: input.engineText || input.text },
    ]

    pendingRunGenerations.add(runGeneration)
    let res: Awaited<ReturnType<typeof window.api.agentRun>>
    try {
      // 동기로 정해지면 기다리지 않는다 — agentRun이 같은 tick에 나가야 pending 창 판정이 맞는다.
      const resolved = ports.resolveRunTarget(before, input.options)
      const target = resolved instanceof Promise ? await resolved : resolved
      res = await window.api.agentRun(buildAgentRunArgs(history, { ...input.options, ...target }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      ports.dispatch({
        type: 'RUN_FAILED',
        message,
        runGeneration,
        restoreGeneration: before.runGeneration ?? null,
      })
      return
    } finally {
      pendingRunGenerations.delete(runGeneration)
    }

    ports.dispatch({ type: 'SET_RUN_ID', runId: res.runId })
    ports.onRunStarted?.(res.runId)
  }

  const abort = async (): Promise<void> => {
    const { currentRunId, runGeneration } = ports.readState()
    if (!currentRunId || isPendingGeneration(runGeneration)) return
    // E8: 중단은 열린 응답 메시지에 「중단됨」을 단다(CLEAR_LOOPS가 처리).
    ports.dispatch({ type: 'CLEAR_LOOPS' })
    ports.refreshStale()
    await window.api.agentAbort({ runId: currentRunId })
  }

  const interrupt = async (): Promise<void> => {
    const start = ports.readState()
    const runId = start.currentRunId
    const runGeneration = start.runGeneration ?? null
    if (!runId || isPendingGeneration(runGeneration)) return
    const target: InterruptTarget = { runId, runGeneration, owner: ownerNow() }
    const isSameRun = (s: S): boolean =>
      ownerNow() === target.owner
      && s.currentRunId === target.runId
      && (s.runGeneration ?? null) === target.runGeneration

    const { accepted } = await window.api.agentInterrupt({ runId })
    if (accepted) {
      if (isSameRun(ports.readState())) ports.dispatch({ type: 'MARK_INTERRUPTED' })
      return
    }

    const foregroundClosed = isSameRun(ports.readState())
    if (foregroundClosed) ports.dispatch({ type: 'CLOSE_DEAD_RUN' })
    ports.onInterruptRejected?.(target, foregroundClosed)
    ports.refreshStale()
  }

  const respondPermission = async (behavior: PermissionResponse['behavior']): Promise<void> => {
    const { pendingPermission } = ports.readState()
    if (!pendingPermission) return
    ports.dispatch({ type: 'CLEAR_PENDING_PERMISSION' })
    try {
      await window.api.permissionRespond({
        runId: pendingPermission.runId,
        requestId: pendingPermission.requestId,
        behavior,
      })
    } catch {
    }
  }

  const respondQuestion = async (answers: string[][] | null): Promise<void> => {
    const { pendingQuestion } = ports.readState()
    if (!pendingQuestion) return
    ports.dispatch({ type: 'CLEAR_PENDING_QUESTION' })
    try {
      await window.api.questionRespond({
        runId: pendingQuestion.runId,
        requestId: pendingQuestion.requestId,
        answers,
      })
    } catch {
    }
  }

  const handleEvent = (payload: AgentEventPayload): boolean => {
    const s = ports.readState()
    if (s.currentRunId === null || payload.runId !== s.currentRunId) return false
    if (payload.event.type === 'permission_mode' && ports.onPermissionMode) {
      ports.onPermissionMode(payload.event.mode)
      return true
    }
    ports.dispatch({ type: 'APPLY_EVENT', payload, time: nowTimeKo(), nowMs: Date.now() })
    ports.refreshStale()
    ports.onEvent?.(payload)
    return true
  }

  return { send, abort, interrupt, respondPermission, respondQuestion, handleEvent }
}

// stale 감시 — 판정과 타이머 보관을 한 곳에 둔다. 단일은 키 하나, 멀티는 패널 키마다 쓴다.
export interface StaleWatchdogs {
  refresh: (key: string, state: RunCoreState | undefined) => void
  dispose: (key: string) => void
  disposeAll: () => void
}

export function createStaleWatchdogs(ports: {
  markStale: (key: string) => void
  onFresh?: (key: string) => void
}): StaleWatchdogs {
  const timers = new Map<string, StaleTimerHandle>()
  const timerFor = (key: string): StaleTimerHandle => {
    let t = timers.get(key)
    if (!t) {
      t = createStaleTimer(() => ports.markStale(key))
      timers.set(key, t)
    }
    return t
  }
  return {
    refresh(key, state) {
      if (!state) return
      const timer = timerFor(key)
      if (!state.goalRun || state.lastActivityAt === null) {
        timer.dispose()
        return
      }
      const now = Date.now()
      if (isStaleNow(state.lastActivityAt, now)) {
        timer.dispose()
        if (!state.bannerStale) ports.markStale(key)
        return
      }
      ports.onFresh?.(key)
      timer.arm(remainingStaleMs(state.lastActivityAt, now))
    },
    dispose(key) {
      const t = timers.get(key)
      if (t) {
        t.dispose()
        timers.delete(key)
      }
    },
    disposeAll() {
      for (const t of timers.values()) t.dispose()
      timers.clear()
    },
  }
}

// 보관 상한 — 넘친 만큼 오래된 것부터 고른다. 보호 대상은 건너뛴다.
export function pickEvictions<T>(
  entries: Iterable<[string, T]>,
  size: number,
  cap: number,
  isProtected: (key: string, value: T) => boolean,
): string[] {
  const out: string[] = []
  let remaining = size
  for (const [key, value] of entries) {
    if (remaining <= cap) break
    if (isProtected(key, value)) continue
    out.push(key)
    remaining -= 1
  }
  return out
}
