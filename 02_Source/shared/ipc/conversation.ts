import type { TokenUsage, SubAgentInfo } from '../agentEvents'
import type { BackendId } from './common'
import type { ConversationMessage } from './agent'

export const CONVERSATION_CHANNELS = {
  CONVERSATION_LOAD: 'conversation.load',
  CONVERSATION_SAVE: 'conversation.save',
  CONVERSATION_DELETE: 'conversation.delete',
  CONVERSATION_RENAME: 'conversation.rename',
} as const

export interface PersistedSubAgent extends SubAgentInfo {
  afterMessageIndex: number
}

export const SUBAGENT_PERSIST_LIMITS = {
  maxSubagents: 30,
  maxTranscriptItems: 100,
  maxTextChars: 4096,
  maxTools: 200,
} as const

export interface ConversationRecord {
  id: string
  title: string
  messages: ConversationMessage[]
  backendId: BackendId
  createdAt: string
  updatedAt: string
  cwd?: string
  sessionId?: string
  lastContextWindow?: number
  lastUsage?: TokenUsage
  subagents?: PersistedSubAgent[]
  replMode?: boolean
  model?: string
}

export interface ConversationLoadRequest {
  id?: string
  limit?: number
}

export interface ConversationLoadResponse {
  conversations: ConversationRecord[]
}

export interface ConversationSaveRequest {
  conversation: Omit<ConversationRecord, 'createdAt' | 'updatedAt'> & {
    id?: string
  }
}

export interface ConversationSaveResponse {
  id: string
}

export interface ConversationDeleteRequest {
  id: string
}

export interface ConversationDeleteResponse {
  ok: boolean
}

export interface ConversationRenameRequest {
  id: string
  title: string
}

export interface ConversationRenameResponse {
  ok: boolean
}
