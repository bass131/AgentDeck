import type { AgentEvent } from '../../../../shared/agentEvents'
import type { AppState } from './types'

type PermissionRequestEvent = Extract<AgentEvent, { type: 'permission_request' }>
type QuestionRequestEvent = Extract<AgentEvent, { type: 'question_request' }>

export function handlePermissionRequest(state: AppState, event: PermissionRequestEvent, runId: string): AppState {
  return {
    ...state,
    pendingPermission: {
      runId,
      requestId: event.requestId,
      toolName: event.toolName,
      summary: event.summary,
      planReview: event.planReview,
    },
  }
}

export function handleQuestionRequest(state: AppState, event: QuestionRequestEvent, runId: string): AppState {
  return {
    ...state,
    pendingQuestion: {
      runId,
      requestId: event.requestId,
      questions: event.questions,
    },
  }
}
