import { mapClaudeStreamLine, mapUsage } from './claudeStream'
import { fallbackNotice } from './modelFallback'
import { FileChangeTracker } from './fileChangeTracker'
import { TaskTracker, CronTracker } from './progressTrackers'
import { sanitizeSubagentToolResult } from './subagentMeta'
import type { AgentEvent, AgentEventDone, TokenUsage } from '@shared/agentEvents'

export { modelDisplay, REFUSAL_CATEGORY_LABEL, fallbackNotice } from './modelFallback'

let _runTagSeq = 0

export function nextRunTag(): string {
  return 'r' + (++_runTagSeq)
}

export interface NormResult {
  events: AgentEvent[]
  done: AgentEventDone | null
}

export class RunEventNormalizer {

  private readonly _fileTracker: FileChangeTracker
  private readonly _taskTracker = new TaskTracker()
  private readonly _cronTracker = new CronTracker()

  private _orchestrationToolIds = new Set<string>()

  private _subagentToolIds = new Set<string>()

  private _subagentMetaById = new Map<string, { name: string; role: string; status: 'queued' | 'running' | 'done' }>()

  private _subagentModelById = new Map<string, string>()

  private readonly _launchTag: string
  private _blockSeq = 0
  private _curTextId: string | null = null

  private _streamedThisMsg = false

  private _pendingFallbackNotices = 0

  constructor(launchTag: string, workspaceRoot?: string) {
    this._launchTag = launchTag
    this._fileTracker = new FileChangeTracker(workspaceRoot)
  }

  hasLoopActivity(): boolean {
    return this._cronTracker.hasActivity()
  }

  get curTextId(): string | null { return this._curTextId }

  resetCurTextId(): void { this._curTextId = null }

  incrementPendingFallback(): void { this._pendingFallbackNotices++ }

  resetStreaming(): void { this._streamedThisMsg = false }

  // 계기가 턴 결과 modelUsage에서 고를 주 모델 (M06 G4) — init의 model, 거절 폴백, 실행 중 전환이 바꾼다.
  private _mainModel: string | undefined
  private _lastMainUsage: TokenUsage | undefined

  setMainModel(model: string): void { this._mainModel = model }

  process(msg: unknown, turnOrigin: 'user' | 'cron' = 'cron'): NormResult {
    const events: AgentEvent[] = []
    let foundDone: AgentEventDone | null = null

    if (
      msg !== null && typeof msg === 'object' &&
      (msg as Record<string, unknown>)['type'] === 'system' &&
      (msg as Record<string, unknown>)['subtype'] === 'init' &&
      typeof (msg as Record<string, unknown>)['model'] === 'string'
    ) {
      this._mainModel = (msg as Record<string, unknown>)['model'] as string
    }

    if (
      msg !== null && typeof msg === 'object' &&
      (msg as Record<string, unknown>)['type'] === 'system' &&
      (msg as Record<string, unknown>)['subtype'] === 'model_refusal_fallback'
    ) {
      const raw = msg as Record<string, unknown>
      // scope 'local'(서브에이전트 등)은 그 응답만 폴백했고 세션 모델은 그대로다 — 공개 타입 SDKModelRefusalFallbackMessage.
      const sessionScope = raw['scope'] !== 'local'
      if (sessionScope && typeof raw['fallback_model'] === 'string' && raw['fallback_model'].length > 0) {
        this._mainModel = raw['fallback_model']
      }
      if (this._pendingFallbackNotices > 0) {
        this._pendingFallbackNotices--
      } else {
        events.push({
          type: 'model-fallback',
          fromModel: typeof raw['original_model'] === 'string' ? raw['original_model'] : '',
          toModel: typeof raw['fallback_model'] === 'string' ? raw['fallback_model'] : '',
          text: fallbackNotice(raw['original_model'], raw['fallback_model'], raw['api_refusal_category']),
          retractMessageId: null,
        })
      }
      return { events, done: null }
    }

    const isStreamEvent = (
      msg !== null && typeof msg === 'object' &&
      (msg as Record<string, unknown>)['type'] === 'stream_event'
    )
    if (isStreamEvent) {
      const rawMsg = msg as Record<string, unknown>
      const ev = rawMsg['event']
      if (
        ev !== null && typeof ev === 'object' &&
        (ev as Record<string, unknown>)['type'] === 'content_block_start'
      ) {
        this._curTextId = null
      }
    }

    if (
      msg !== null && typeof msg === 'object' &&
      (msg as Record<string, unknown>)['type'] === 'assistant'
    ) {
      const rawMsg = msg as Record<string, unknown>
      const rawParentId = rawMsg['parent_tool_use_id']
      if (typeof rawParentId !== 'string' || rawParentId.length === 0) {
        const message = rawMsg['message']
        const usage = message !== null && typeof message === 'object' ? mapUsage((message as Record<string, unknown>)['usage']) : undefined
        if (usage) this._lastMainUsage = usage
      }
      if (typeof rawParentId === 'string' && rawParentId.length > 0) {
        const message = rawMsg['message']
        const rawModel =
          message !== null && typeof message === 'object'
            ? (message as Record<string, unknown>)['model']
            : undefined
        if (typeof rawModel === 'string' && rawModel.length > 0) {
          const prevModel = this._subagentModelById.get(rawParentId)
          if (prevModel !== rawModel) {
            this._subagentModelById.set(rawParentId, rawModel)
            const meta = this._subagentMetaById.get(rawParentId)
            if (meta) {
              events.push({
                type: 'subagent',
                subagent: {
                  id: rawParentId,
                  name: meta.name,
                  role: meta.role,
                  status: meta.status,
                  tools: [],
                  model: rawModel,
                },
              })
            }
          }
        }
      }
    }

    for (const event of mapClaudeStreamLine(msg, { mainModel: this._mainModel })) {

      if (event.type === 'done') {
        // 계기는 턴 합계(result.usage)가 아니라 마지막 최상위 호출의 크기를 본다(M06 Backlog 2·26)
        foundDone = this._lastMainUsage ? { ...event, usage: this._lastMainUsage } : event
        this._lastMainUsage = undefined
        for (const e of this._cronTracker.onTurnEnd(turnOrigin)) events.push(e)
        continue
      }

      if (event.type === 'session') {
        events.push(event)
        continue
      }

      if (event.type === 'tool_call' && this._taskTracker.isTaskTool(event.name)) {
        for (const e of this._taskTracker.handle(event.id, event.name, event.input)) events.push(e)
        continue
      }
      if (event.type === 'tool_result' && this._taskTracker.isTaskResult(event.id)) {
        continue
      }

      if (event.type === 'orchestration') {
        this._orchestrationToolIds.add(event.id)
      }
      if (event.type === 'tool_result' && this._orchestrationToolIds.has(event.id)) {
        continue
      }

      if (event.type === 'subagent') {
        this._subagentToolIds.add(event.subagent.id)
        this._subagentMetaById.set(event.subagent.id, {
          name: event.subagent.name,
          role: event.subagent.role,
          status: event.subagent.status,
        })
        if (event.subagent.model) {
          this._subagentModelById.set(event.subagent.id, event.subagent.model)
        }
      }
      if (event.type === 'tool_result' && this._subagentToolIds.has(event.id)) {
        event.output = sanitizeSubagentToolResult(event.output)

        const meta = this._subagentMetaById.get(event.id)
        if (meta) {
          this._subagentMetaById.set(event.id, { ...meta, status: 'done' })
        }
      }

      if (event.type === 'tool_call') {
        this._fileTracker.record(event.id, event.name, event.input)
      } else if (event.type === 'tool_result') {
        for (const e of this._fileTracker.resolve(event.id, event.ok)) events.push(e)
      }

      if (event.type === 'tool_call' && this._cronTracker.isCronCreate(event.name)) {
        this._cronTracker.recordPending(event.id, event.input)
      } else if (event.type === 'tool_call' && this._cronTracker.isCronDelete(event.name)) {
        for (const e of this._cronTracker.handleDelete(event.input)) events.push(e)
      } else if (event.type === 'tool_call' && this._cronTracker.isWakeupCall(event.name)) {
        this._cronTracker.recordWakeupPending(event.id, event.input)
      } else if (event.type === 'tool_result' && this._cronTracker.hasPending(event.id)) {
        for (const e of this._cronTracker.resolvePending(event.id, event.output, event.ok)) events.push(e)
      } else if (event.type === 'tool_result' && this._cronTracker.hasWakeupPending(event.id)) {
        for (const e of this._cronTracker.resolveWakeupPending(event.id, event.ok)) events.push(e)
      }

      if (
        (event.type === 'text' || event.type === 'thinking') &&
        (event as { parentToolId?: string }).parentToolId
      ) {
        events.push(event)
        continue
      }

      if (event.type === 'text') {
        if (isStreamEvent) {
          if (this._curTextId === null) {
            this._curTextId = this._nextBlockId()
          }
          event.messageId = this._curTextId
          this._streamedThisMsg = true
        } else {
          if (this._streamedThisMsg) {
            continue
          }
          if (this._curTextId === null) {
            this._curTextId = this._nextBlockId()
          }
          event.messageId = this._curTextId
        }
      } else if (event.type === 'thinking') {
        if (!isStreamEvent && this._streamedThisMsg) {
          continue
        }
      } else if (event.type === 'tool_call') {
        this._curTextId = null
      }

      events.push(event)
    }

    if (
      msg !== null && typeof msg === 'object' &&
      (msg as Record<string, unknown>)['type'] === 'assistant'
    ) {
      const rawParentId = (msg as Record<string, unknown>)['parent_tool_use_id']
      const isSubAgentMsg = typeof rawParentId === 'string' && rawParentId.length > 0
      if (!isSubAgentMsg) {
        this._curTextId = null
        this._streamedThisMsg = false
      }
    }

    return { events, done: foundDone }
  }

  abortCleanup(): AgentEvent[] {
    const cleanupEvents: AgentEvent[] = []

    this._pendingFallbackNotices = 0
    this._lastMainUsage = undefined
    this._fileTracker.clear()
    this._taskTracker.clear()
    this._orchestrationToolIds.clear()
    this._subagentToolIds.clear()
    this._subagentMetaById.clear()
    this._subagentModelById.clear()

    if (this._cronTracker.hasActivity()) {
      cleanupEvents.push({ type: 'loops', loops: [] })
    }
    this._cronTracker.clear()

    return cleanupEvents
  }

  singlePumpCleanup(): void {
    this._pendingFallbackNotices = 0
    this._lastMainUsage = undefined
    this._streamedThisMsg = false
    this._fileTracker.clear()
    this._taskTracker.clear()
    this._orchestrationToolIds.clear()
    this._subagentToolIds.clear()
    this._subagentMetaById.clear()
    this._subagentModelById.clear()
    this._cronTracker.clear()
  }

  persistentPumpCleanup(): AgentEvent[] {
    const cleanupEvents: AgentEvent[] = []

    this._pendingFallbackNotices = 0
    this._lastMainUsage = undefined
    this._streamedThisMsg = false
    this._fileTracker.clear()
    this._taskTracker.clear()
    this._orchestrationToolIds.clear()
    this._subagentToolIds.clear()
    this._subagentMetaById.clear()
    this._subagentModelById.clear()

    if (this._cronTracker.hasActiveLoops()) {
      cleanupEvents.push({ type: 'loops', loops: [] })
    }
    this._cronTracker.clear()

    return cleanupEvents
  }

  private _nextBlockId(): string {
    return 'a' + this._launchTag + '-' + (++this._blockSeq)
  }
}
