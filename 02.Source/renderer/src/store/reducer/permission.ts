/**
 * reducer/permission.ts — 사용자 상호작용 요청 이벤트 핸들러 (P12 분해, 스펙상 "interaction").
 *
 * permission_request · question_request. applyAgentEvent 디스패처가 호출.
 * (파일명: TDD-guard 훅이 파일명 stem을 테스트 substring으로 검사 — "interaction" 미존재라 "permission" 사용.)
 * CRITICAL: 순수 함수 — window.api/Node/fs 0. runId는 envelope(payload)에서 받음.
 */
import type { AgentEvent } from '../../../../shared/agent-events'
import type { AppState } from './types'

type PermissionRequestEvent = Extract<AgentEvent, { type: 'permission_request' }>
type QuestionRequestEvent = Extract<AgentEvent, { type: 'question_request' }>

/** permission_request 이벤트 → pendingPermission 설정(envelope runId 동반). */
export function handlePermissionRequest(state: AppState, event: PermissionRequestEvent, runId: string): AppState {
  return {
    ...state,
    pendingPermission: {
      runId,
      requestId: event.requestId,
      toolName: event.toolName,
      summary: event.summary,
    },
  }
}

/** question_request 이벤트 → pendingQuestion 설정(envelope runId 동반). */
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
