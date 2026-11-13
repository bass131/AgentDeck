import type { AgentEvent, TokenUsage } from './agentEvents'
import type { DiffLine } from './02_Common/diffTypes'

export type { DiffLine }

export type { AgentEvent, TokenUsage }

export { BACKEND_LABELS, WORKSPACE_ROOT_ID } from './02_Common/common'
export type { BackendId } from './02_Common/common'

import { WORKSPACE_CHANNELS } from './07_Workspace/workspace'
import { AGENT_CHANNELS } from './03_Agent/agent'
import { FS_CHANNELS } from './07_Workspace/fs'
import { CONVERSATION_CHANNELS } from './06_Sessions/conversation'
import { REFERENCE_CHANNELS } from './07_Workspace/reference'
import { GIT_CHANNELS } from './08_Git/git'
import { LSP_CHANNELS } from './09_Lsp/lsp'
import { ENGINE_CHANNELS } from './10_Engine/engine'
import { SETTINGS_CHANNELS } from './11_Settings/settings'
import { WINDOW_CHANNELS } from './12_Window/window'
import { MULTI_CHANNELS } from './06_Sessions/multi'
import { PERSONALIZATION_CHANNELS } from './11_Settings/personalization'

export * from './07_Workspace/workspace'
export * from './03_Agent/agent'
export * from './07_Workspace/fs'
export * from './06_Sessions/conversation'
export * from './07_Workspace/reference'
export * from './08_Git/git'
export * from './09_Lsp/lsp'
export * from './10_Engine/engine'
export * from './11_Settings/settings'
export * from './12_Window/window'
export * from './06_Sessions/multi'
export * from './11_Settings/personalization'

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
