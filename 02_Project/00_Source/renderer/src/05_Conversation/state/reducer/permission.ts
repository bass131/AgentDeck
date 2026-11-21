import type { AgentEvent } from '@shared/agentEvents'
import type { AppState, PendingPermission } from './types'

type PermissionRequestEvent = Extract<AgentEvent, { type: 'permission_request' }>
type QuestionRequestEvent = Extract<AgentEvent, { type: 'question_request' }>

export function handlePermissionRequest(state: AppState, event: PermissionRequestEvent, runId: string): AppState {
  const next: PendingPermission = {
    runId,
    requestId: event.requestId,
    toolName: event.toolName,
    summary: event.summary,
    planReview: event.planReview,
    ...(event.escalated === true ? { escalated: true as const } : {}),
    ...(event.askReason !== undefined ? { askReason: event.askReason } : {}),
  }
  const shown = state.pendingPermission
  // 보이는 카드가 있으면 덮지 않고 줄을 세운다 — 같은 요청이 다시 오면 그대로 둔다
  if (shown === null || shown.requestId === event.requestId) {
    return { ...state, pendingPermission: shown === null ? next : { ...next, behind: shown.behind } }
  }
  if (shown.behind?.some((p) => p.requestId === event.requestId)) return state
  return { ...state, pendingPermission: { ...shown, behind: [...(shown.behind ?? []), next] } }
}

// 보이는 카드를 지우고 줄의 맨 앞을 올린다
export function popPendingPermission<S extends Pick<AppState, 'pendingPermission'>>(state: S): S {
  const [first, ...rest] = state.pendingPermission?.behind ?? []
  return { ...state, pendingPermission: first === undefined ? null : { ...first, ...(rest.length > 0 ? { behind: rest } : {}) } }
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
