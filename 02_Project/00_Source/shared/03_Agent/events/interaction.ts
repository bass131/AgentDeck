export interface PlanReviewAllowedPrompt {
  tool: 'Bash'
  prompt: string
}

export interface PlanReviewPayload {
  plan?: string
  planFilePath?: string
  allowedPrompts?: PlanReviewAllowedPrompt[]
}

export interface AgentEventPermissionRequest {
  type: 'permission_request'
  requestId: string
  toolName: string
  summary: string
  planReview?: PlanReviewPayload
  // M06 G3 — 가드가 물은 호출(사유가 있고 규칙 제안이 없는 질의)의 사유 원문. 있으면 모드와 관계없이 카드가 뜨고,
  // 카드는 명령 전문과 이 사유를 보이며 「항상 허용」을 내지 않는다. 판별 근거는 permissionCoordinator.escalatedAskReason.
  askReason?: string
}

export interface QuestionOption {
  label: string
  description?: string
}

export interface AgentQuestion {
  header?: string
  question: string
  options: QuestionOption[]
  multiSelect?: boolean
}

export interface AgentEventQuestionRequest {
  type: 'question_request'
  requestId: string
  questions: AgentQuestion[]
}

export interface AgentEventModelFallback {
  type: 'model-fallback'
  runId?: string
  fromModel: string
  toModel: string
  text: string
  retractMessageId?: string | null
}

export interface AgentEventPermissionMode {
  type: 'permission_mode'
  mode: string
}
