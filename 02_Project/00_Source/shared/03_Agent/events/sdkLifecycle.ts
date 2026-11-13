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
  kind: 'boundary' | 'status'
  trigger?: 'manual' | 'auto'
  preTokens?: number
  postTokens?: number
  status?: 'compacting' | 'requesting' | null
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

export interface AgentEventSearchResult {
  type: 'search_result'
  toolUseId?: string
  mode?: 'content' | 'files_with_matches' | 'count' | 'glob'
  files?: string[]
  matches?: SearchResultMatch[]
  total?: number
  truncated?: boolean
}
