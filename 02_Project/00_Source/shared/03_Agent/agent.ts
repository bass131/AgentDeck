import type { AgentEvent } from '../agentEvents'
import type { KnownModel } from '../knownModels'
import type { BackendId } from './common'

export const AGENT_CHANNELS = {
  AGENT_RUN: 'agent.run',
  AGENT_ABORT: 'agent.abort',
  AGENT_INTERRUPT: 'agent.interrupt',
  AGENT_TASK_STOP: 'agent.taskStop',
  AGENT_SET_MODE: 'agent.setMode',
  AGENT_SET_MODEL: 'agent.setModel',
  AGENT_EVENT: 'agent.event',
  PERMISSION_RESPOND: 'agent.permissionRespond',
  QUESTION_RESPOND: 'agent.questionRespond',
} as const

export type MessageRole = 'user' | 'assistant'

export interface ConversationMessage {
  role: MessageRole
  content: string
}

export interface AgentRunRequest {
  messages: ConversationMessage[]
  backendId?: BackendId
  workspaceRoot?: string
  model?: string
  effort?: string
  mode?: string
  systemPrompt?: string
  orchestration?: boolean
  resumeSessionId?: string
  persistent?: boolean
  sessionKey?: string
}

export const MODEL_CONTEXT_WINDOW: Record<KnownModel, number> = {
  'claude-opus-5': 1_000_000,
  'claude-opus-4-8': 1_000_000,
  'claude-fable-5': 1_000_000,
  'claude-sonnet-5': 1_000_000,
  'claude-haiku-4-5': 200_000
}

export const DEFAULT_CONTEXT_WINDOW = 1_000_000

export interface AgentRunResponse {
  runId: string
}

export interface AgentAbortRequest {
  runId: string
}

export interface AgentAbortResponse {
  accepted: boolean
}

export interface AgentInterruptRequest {
  runId: string
}

export interface AgentInterruptResponse {
  accepted: boolean
}

export interface TaskStopRequest {
  runId: string
  taskId: string
}

export interface TaskStopResponse {
  accepted: boolean
}

export interface SetModeRequest {
  runId: string
  mode: string
}

export interface SetModeResponse {
  accepted: boolean
}

export interface SetModelRequest {
  runId: string
  model: string
}

export interface SetModelResponse {
  accepted: boolean
}

export interface PermissionResponse {
  runId: string
  requestId: string
  behavior: 'allow' | 'allow_always' | 'deny'
}

export interface QuestionResponse {
  runId: string
  requestId: string
  answers: string[][] | null
}

export interface AgentEventPayload {
  runId: string
  event: AgentEvent
}
