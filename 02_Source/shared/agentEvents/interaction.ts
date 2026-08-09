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
