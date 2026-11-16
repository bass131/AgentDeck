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
  // M06 G3 — 규칙 제안 없이 온 호출(가드 질의 포함)을 모드와 관계없이 사람에게 올렸다는 표지. 사유가 없어도 붙는다.
  // 이 표지가 있으면 카드는 명령 전문을 보이고 「항상 허용」을 내지 않는다. 판별 근거는 permissionCoordinator.escalationOf.
  escalated?: true
  // 그 호출에 SDK가 붙여 보낸 decisionReason 원문. 가드 사유일 수도, 다른 안전 검사 사유일 수도, 없을 수도 있다.
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
