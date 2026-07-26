/**
 * reducer/orchestration.ts — 오케스트레이션 계열 이벤트 핸들러 (P12 분해).
 *
 * orchestration · orchestration_progress. applyAgentEvent 디스패처가 호출.
 * CRITICAL: 순수 함수 — window.api/Node/fs 0. time은 받은 값만 사용.
 * CRITICAL(ADR-003): 엔진중립 — 'Workflow' 리터럴 0.
 */
import type { AgentEvent } from '../../../../shared/agent-events'
import type { ThreadItem } from '../threadTypes'
import type { AppState } from './types'

type OrchestrationEvent = Extract<AgentEvent, { type: 'orchestration' }>
type OrchestrationProgressEvent = Extract<AgentEvent, { type: 'orchestration_progress' }>

/**
 * orchestration 이벤트 → 오케스트레이션 카드 push (cmdresult begin 미러).
 * B-1: push 시 openMsgId=null, openGroupId=null (인터리브 포인터 정합).
 */
export function handleOrchestration(state: AppState, event: OrchestrationEvent, time?: string): AppState {
  const orchItem: Extract<ThreadItem, { kind: 'orchestration' }> = {
    kind: 'orchestration',
    id: event.id,
    name: event.name,
    running: true,
    ...(event.description !== undefined ? { description: event.description } : {}),
    ...(event.phases !== undefined ? { phases: event.phases } : {}),
    ...(event.script !== undefined ? { script: event.script } : {}),
    ...(time !== undefined ? { time } : {}),
  }
  return {
    ...state,
    thread: [...state.thread, orchItem],
    // B-1: 인터리브 포인터 닫기 (cmdresult begin reducer.ts:259-261 미러)
    openMsgId: null,
    openGroupId: null,
    isRunning: true,
  }
}

/**
 * orchestration_progress 이벤트 → orchestration 카드 라이브 갱신 (id 매칭, in-place). 포인터 불변.
 * 제공된 필드만 병합 — phases/agents가 없는 후속 progress는 이전 값 유지(task_progress가
 * 단계는 첫 메시지에만, 완료(notification)는 진행배열 없이 옴 → 누적 유지가 옳다).
 * status: running→진행, completed→완료, failed→실패. 카드 없으면 무시(graceful).
 */
export function handleOrchestrationProgress(state: AppState, event: OrchestrationProgressEvent): AppState {
  const pid = event.id
  const hasCard = state.thread.some((item) => item.kind === 'orchestration' && item.id === pid)
  if (!hasCard) return state
  const done = event.status === 'completed'
  const failed = event.status === 'failed'
  const nextThread = state.thread.map((item) => {
    if (item.kind === 'orchestration' && item.id === pid) {
      return {
        ...item,
        running: !(done || failed),
        ...(failed ? { failed: true } : {}),
        liveStatus: event.status,
        ...(event.summary !== undefined ? { liveSummary: event.summary } : {}),
        ...(event.phases !== undefined ? { livePhases: event.phases } : {}),
        ...(event.agents !== undefined ? { agents: event.agents } : {}),
      }
    }
    return item
  })
  return { ...state, thread: nextThread }
}
