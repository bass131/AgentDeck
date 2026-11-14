import type { AgentEvent } from '../../../../shared/agentEvents'
import type { AppState } from './types'

type ApiRetryEvent = Extract<AgentEvent, { type: 'api_retry' }>
type CompactEvent = Extract<AgentEvent, { type: 'compact' }>
type SessionStateEvent = Extract<AgentEvent, { type: 'session_state' }>

export function handleApiRetry(state: AppState, event: ApiRetryEvent): AppState {
  return {
    ...state,
    apiRetry: {
      attempt: event.attempt,
      maxRetries: event.maxRetries,
      retryDelayMs: event.retryDelayMs,
    },
  }
}

export function handleCompact(state: AppState, event: CompactEvent, time?: string): AppState {
  if (event.kind === 'boundary') {
    const nextSeq = state.seq + 1
    const markerId = `cb${nextSeq}`
    return {
      ...state,
      thread: [
        ...state.thread,
        {
          kind: 'compact-boundary' as const,
          id: markerId,
          trigger: event.trigger,
          preTokens: event.preTokens,
          postTokens: event.postTokens,
          ...(time !== undefined ? { time } : {}),
        },
      ],
      seq: nextSeq,
    }
  }

  return {
    ...state,
    compacting: event.status ?? null,
  }
}

export function handleSessionState(state: AppState, event: SessionStateEvent): AppState {
  return {
    ...state,
    sdkSessionState: event.state,
  }
}
