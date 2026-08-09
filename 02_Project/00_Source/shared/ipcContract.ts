import type { AgentEvent, TokenUsage } from './agentEvents'
import type { DiffLine } from './diffTypes'

export type { DiffLine }

export type { AgentEvent, TokenUsage }

export { BACKEND_LABELS, WORKSPACE_ROOT_ID } from './ipc/common'
export type { BackendId } from './ipc/common'

import { WORKSPACE_CHANNELS } from './ipc/workspace'
import { AGENT_CHANNELS } from './ipc/agent'
import { FS_CHANNELS } from './ipc/fs'
import { CONVERSATION_CHANNELS } from './ipc/conversation'
import { REFERENCE_CHANNELS } from './ipc/reference'
import { GIT_CHANNELS } from './ipc/git'
import { LSP_CHANNELS } from './ipc/lsp'
import { ENGINE_CHANNELS } from './ipc/engine'
import { SETTINGS_CHANNELS } from './ipc/settings'
import { WINDOW_CHANNELS } from './ipc/window'
import { MULTI_CHANNELS } from './ipc/multi'
import { PERSONALIZATION_CHANNELS } from './ipc/personalization'

export * from './ipc/workspace'
export * from './ipc/agent'
export * from './ipc/fs'
export * from './ipc/conversation'
export * from './ipc/reference'
export * from './ipc/git'
export * from './ipc/lsp'
export * from './ipc/engine'
export * from './ipc/settings'
export * from './ipc/window'
export * from './ipc/multi'
export * from './ipc/personalization'

export const IPC_CHANNELS = {
  ...WORKSPACE_CHANNELS,
  ...AGENT_CHANNELS,
  ...FS_CHANNELS,
  ...CONVERSATION_CHANNELS,
  ...REFERENCE_CHANNELS,
  ...GIT_CHANNELS,
  ...LSP_CHANNELS,
  ...ENGINE_CHANNELS,
  ...SETTINGS_CHANNELS,
  ...WINDOW_CHANNELS,
  ...MULTI_CHANNELS,
  ...PERSONALIZATION_CHANNELS,
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
