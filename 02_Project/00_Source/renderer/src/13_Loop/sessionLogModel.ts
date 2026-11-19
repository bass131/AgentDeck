import type { AgentEvent, SubAgentInfo, TodoItem } from '@shared/agentEvents'
import type { LoopSessionEventPayload, LoopSessionLog, LoopSessionRecord, LoopSessionRow } from '@shared/ipcContract'
import { applyAgentEvent, makeInitialState, type AppState } from '@renderer/05_Conversation/state/reducer'
import type { ThreadViewState } from '@renderer/05_Conversation/ThreadView'

export type SessionMap = ReadonlyMap<string, LoopSessionRecord>

// 화면은 push를 먼저 구독하고 스냅숏을 읽는다. next보다 작은 seq는 스냅숏에 이미 있다
export function applyPush(map: SessionMap, p: LoopSessionEventPayload): SessionMap {
  const rec = map.get(p.session.key)
  if (rec && p.seq < rec.next) return map
  const next = new Map(map)
  next.set(p.session.key, rec
    ? { ...rec, session: p.session, events: [...rec.events, p.event], next: p.seq + 1, live: true }
    : { session: p.session, events: [p.event], next: p.seq + 1, truncated: p.seq > 0, live: true })
  return next
}

export function fromSnapshot(snap: LoopSessionLog, early: readonly LoopSessionEventPayload[]): SessionMap {
  let map: SessionMap = new Map(snap.sessions.map((s) => [s.session.key, s] as const))
  for (const p of early) map = applyPush(map, p)
  return map
}

const RUN_ID = 'loop-session'

function fold(events: readonly AgentEvent[]): AppState {
  let state = makeInitialState()
  for (const event of events) state = applyAgentEvent(state, { runId: RUN_ID, event })
  return state
}

// isRunning을 켜면 늦게 연 탭이 마지막 글을 처음부터 다시 흘린다. 답하는 곳은 메인 대화와 현황판이라 대기 상태는 싣지 않는다
export function foldSession(events: readonly AgentEvent[], live: boolean): ThreadViewState {
  const s = fold(events)
  return {
    thread: s.thread,
    isRunning: false,
    errorMessage: s.errorMessage,
    subagents: s.subagents,
    fileDiffs: s.fileDiffs,
    currentRunId: s.currentRunId,
    thinkingText: live ? s.thinkingText : null,
    thinkingStartedAt: live ? s.thinkingStartedAt : null,
    sdkSessionState: s.sdkSessionState,
    pendingQuestion: null,
    pendingPermission: null,
  }
}

export function mainPanelOf(rec: LoopSessionRecord | undefined): { todos: TodoItem[]; subagents: SubAgentInfo[] } {
  if (!rec) return { todos: [], subagents: [] }
  const s = fold(rec.events)
  return { todos: s.todos, subagents: s.subagents }
}

const KIND_LABEL: Record<LoopSessionRow['kind'], string> = { work: '작업', review: '검수' }

export function rowLabel(r: Pick<LoopSessionRow, 'kind' | 'node' | 'goal'>): string {
  const where = [r.goal, r.node].filter((x): x is string => x !== null && x !== '').join(' ')
  return `${where === '' ? '세션' : where} · ${KIND_LABEL[r.kind]}`
}
