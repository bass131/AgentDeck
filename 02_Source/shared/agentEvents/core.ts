import type { DiffLine } from '../diffTypes'
export type { DiffLine }

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens?: number
  cacheReadTokens?: number
}

export interface AgentEventText {
  type: 'text'
  delta: string
  messageId?: string
  parentToolId?: string
}

export interface AgentEventToolCall {
  type: 'tool_call'
  id: string
  name: string
  input: unknown
  parentToolId?: string
  background?: boolean
}

export interface AgentEventToolResult {
  type: 'tool_result'
  id: string
  ok: boolean
  output: unknown
}

export interface AgentEventFileChanged {
  type: 'file_changed'
  path: string
  change: 'add' | 'modify' | 'delete'
  toolId?: string
  add?: number
  del?: number
  diff?: DiffLine[]
}

export interface AgentEventThinking {
  type: 'thinking'
  text: string
  parentToolId?: string
}

export interface AgentEventThinkingClear {
  type: 'thinking_clear'
}

export interface AgentEventDone {
  type: 'done'
  usage?: TokenUsage
  contextWindow?: number
  origin?: 'user' | 'cron'
}

export interface AgentEventError {
  type: 'error'
  message: string
}
