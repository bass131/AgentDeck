export interface AgentEventHookLifecycle {
  type: 'hook_lifecycle'
  phase: 'started' | 'response' | 'progress'
  hookId: string
  hookName: string
  hookEvent: string
  exitCode?: number
  outcome?: 'success' | 'error' | 'cancelled'
  stdout?: string
  stderr?: string
  output?: string
}

export interface AgentEventInformational {
  type: 'informational'
  content: string
  level: 'info' | 'notice' | 'suggestion' | 'warning'
  toolUseId?: string
  preventContinuation?: boolean
}

export interface AgentEventPermissionDenied {
  type: 'permission_denied'
  toolName: string
  decisionReasonType?: string
  decisionReason?: string
}

export interface AgentEventApiRetry {
  type: 'api_retry'
  attempt: number
  maxRetries: number
  retryDelayMs: number
  error?: string
}

export interface AgentEventCompact {
  type: 'compact'
  // settings — SDK 자동 압축의 켜짐과 문턱(getContextUsage)
  kind: 'boundary' | 'status' | 'settings'
  trigger?: 'manual' | 'auto'
  preTokens?: number
  postTokens?: number
  status?: 'compacting' | 'requesting' | null
  autoCompactEnabled?: boolean
  thresholdTokens?: number
}

export interface AgentEventSessionState {
  type: 'session_state'
  state: 'idle' | 'running' | 'requires_action'
}

export interface AgentEventThinkingDelta {
  type: 'thinking_delta'
  text?: string
  estimatedTokens?: number
}

export interface AgentEventBgTaskPatch {
  status?: string
  endTime?: number
}

export interface AgentEventBgTask {
  type: 'bg_task'
  kind: 'started' | 'updated' | 'notification' | 'output'
  taskId: string
  toolUseId?: string
  taskType?: 'local_bash' | 'local_agent' | 'local_workflow'
  description?: string
  status?: string
  patch?: AgentEventBgTaskPatch
  outputFile?: string
  summary?: string
  outputChunk?: string
  outputTruncated?: boolean
}

export interface SearchResultMatch {
  path: string
  line?: number
  text?: string
}

// SDK rate_limit_event의 공개 칸 가운데 판단에 쓰는 것만 옮긴다. resetsAt은 유닉스 초다.
export interface AgentEventRateLimit {
  type: 'rate_limit'
  status: 'allowed' | 'allowed_warning' | 'rejected'
  resetsAt?: number
  rateLimitType?: string
  utilization?: number
  isUsingOverage?: boolean
  overageInUse?: boolean
}

// assistant 메시지의 error가 'rate_limit'이다(사건 없이 올 수 있다)
export interface AgentEventRateLimitError {
  type: 'rate_limit_error'
}

export interface AgentEventSearchResult {
  type: 'search_result'
  toolUseId?: string
  mode?: 'content' | 'files_with_matches' | 'count' | 'glob'
  files?: string[]
  matches?: SearchResultMatch[]
  total?: number
  truncated?: boolean
}
