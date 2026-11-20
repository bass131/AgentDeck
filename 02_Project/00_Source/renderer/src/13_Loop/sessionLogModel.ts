import type { AgentEvent, SubAgentInfo, TodoItem } from '@shared/agentEvents'
import type { LoopSessionEventPayload, LoopSessionLog, LoopSessionRecord, LoopSessionRow } from '@shared/ipcContract'
import { MAX_SESSION_EVENTS, appendSessionEvent } from '@shared/13_Loop/sessionMerge'
import { applyAgentEvent, makeInitialState, type AppState } from '@renderer/05_Conversation/state/reducer'
import type { ThreadViewState } from '@renderer/05_Conversation/ThreadView'

export type SessionMap = ReadonlyMap<string, LoopSessionRecord>

// 화면은 push를 먼저 구독하고 스냅숏을 읽는다. next보다 작은 seq는 스냅숏에 이미 있다
export function applyPush(map: SessionMap, p: LoopSessionEventPayload): SessionMap {
  const rec = map.get(p.session.key)
  if (rec && p.seq < rec.next) return map
  const { events, truncated } = appendSessionEvent(rec?.events ?? [], p.event, MAX_SESSION_EVENTS)
  const next = new Map(map)
  next.set(p.session.key, {
    session: p.session,
    events,
    next: p.seq + 1,
    truncated: truncated || (rec ? rec.truncated : p.seq > 0),
    live: true,
  })
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

// 메인 대화 한 턴(M11 G4) — 도는 턴만 실행 중·사고 표시를 싣는다. 턴의 오류는 대화 기록의 알림 줄이 이미 보인다
export function foldMainTurn(events: readonly AgentEvent[], running: boolean): ThreadViewState {
  return { ...foldSession(events, running), isRunning: running, errorMessage: undefined }
}

// 글·사고 조각은 할 일과 서브에이전트의 이름·상태를 바꾸지 않는다
export function panelKeyOf(rec: LoopSessionRecord | undefined): AgentEvent | undefined {
  const events = rec?.events ?? []
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type !== 'text' && events[i].type !== 'thinking_delta') return events[i]
  }
  return undefined
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
