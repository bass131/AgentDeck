import type { TokenUsage } from '../agentEvents'

export const MULTI_CHANNELS = {
  MULTI_SESSION_LOAD: 'multi.load',

  MULTI_CMD_UPSERT: 'multi.cmdUpsert',
  MULTI_CMD_CREATE: 'multi.cmdCreate',
  MULTI_CMD_DELETE: 'multi.cmdDelete',
  MULTI_CMD_RENAME: 'multi.cmdRename',
  MULTI_CMD_SELECT: 'multi.cmdSelect',
} as const

export interface PersistedMsg {
  id: string
  role: 'user' | 'assistant'
  text: string
  error?: boolean
  images?: string[]
}

export interface PersistedPicker {
  model: string
  effort: string
  mode: string
}

export interface PanelThreadSnapshot {
  messages: PersistedMsg[]
  seq: number
  lastUsage?: TokenUsage
  lastContextWindow?: number
  sessionId?: string
  replMode?: boolean
}

export interface PersistedPanel {
  title: string
  cwd?: string
  picker: PersistedPicker
  sysPrompt?: string
  snapshot?: PanelThreadSnapshot
}

export interface PersistedMultiSession {
  id: string
  title?: string
  count: number
  panels: PersistedPanel[]
}

export interface PersistedMultiState {
  version: number
  activeSessionId: string
  sessions: PersistedMultiSession[]
}

export interface MultiSessionLoadResponse {
  state: PersistedMultiState | null
}

export interface MultiCmdResponse {
  ok: boolean
  state: PersistedMultiState
}

export interface MultiCmdUpsertRequest {
  session: Omit<PersistedMultiSession, 'title'>
}

export type MultiCmdUpsertResponse = MultiCmdResponse

export type MultiCmdCreateRequest = Record<string, never>

export type MultiCmdCreateResponse = MultiCmdResponse

export interface MultiCmdDeleteRequest {
  id: string
}

export type MultiCmdDeleteResponse = MultiCmdResponse

export interface MultiCmdRenameRequest {
  id: string
  title: string
}

export type MultiCmdRenameResponse = MultiCmdResponse

export interface MultiCmdSelectRequest {
  id: string
}

export type MultiCmdSelectResponse = MultiCmdResponse
