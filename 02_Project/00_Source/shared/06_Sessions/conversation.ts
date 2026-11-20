import type { TokenUsage, SubAgentInfo } from '../agentEvents'
import type { BackendId } from '../02_Common/common'
import type { ConversationMessage } from '../03_Agent/agent'

export const CONVERSATION_CHANNELS = {
  CONVERSATION_LOAD: 'sessions.load',
  CONVERSATION_SAVE: 'sessions.save',
  CONVERSATION_DELETE: 'sessions.delete',
  CONVERSATION_RENAME: 'sessions.rename',
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
  // 권한 모드 picker id(normal·plan·acceptEdits·auto·bypass) — 대화마다 기억한다(M06 Backlog 1)
  mode?: string
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
