import type { AgentEvent } from '../../../../shared/agentEvents'
import type { ThreadItem } from '../threadTypes'
import type { AppState } from './types'

type OrchestrationEvent = Extract<AgentEvent, { type: 'orchestration' }>
type OrchestrationProgressEvent = Extract<AgentEvent, { type: 'orchestration_progress' }>

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
    openMsgId: null,
    openGroupId: null,
    isRunning: true,
  }
}

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
