import type { BrowserWindow } from 'electron'
import type { RootRegistry } from '@main/07_Workspace/roots'
import type { RunManager } from '@main/03_Agent/agentRuns'
import type { ConversationStore } from '@main/06_Sessions/store'
import type { PrefsStore } from '@main/11_Settings/prefs'
import type { ProfileStore } from '@main/11_Settings/profile'
import type { SkillsStore } from '@main/11_Settings/skills'
import type { McpStore } from '@main/11_Settings/mcp'
import type { CommandsStore } from '@main/11_Settings/commands'
import { registerWorkspaceHandlers } from './handlers/workspace'
import { registerAgentHandlers } from './handlers/agent'
import { registerFsHandlers } from './handlers/fs'
import { registerConversationHandlers } from './handlers/conversation'
import { registerReferenceHandlers } from './handlers/reference'
import { registerGitHandlers } from './handlers/git'
import { registerLspHandlers } from './handlers/lsp'
import { registerEngineHandlers } from './handlers/engine'
import { registerSettingsHandlers } from './handlers/settings'
import { registerPersonalizationHandlers } from './handlers/personalization'
import { registerMultiHandlers } from './handlers/multi'
import { registerWindowHandlers } from './handlers/window'

// IPC 등록부 — 조립 지점(00_App/bootstrap)이 만든 객체를 deps로 받아 핸들러를 등록만 한다 (M05 G11).
// 한 번만 등록하는 가드와 store 초기화는 조립 지점이 쥔다.
export interface IpcDeps {
  state: { win: BrowserWindow | null }
  roots: RootRegistry
  runManager: RunManager
  getStore: () => ConversationStore | null
  getCurrentWorkspaceRoot: () => string | null
  getSkillsStore: () => SkillsStore | null
  getMcpStore: () => McpStore | null
  getCommandsStore: () => CommandsStore | null
  getPrefsStore: () => PrefsStore | null
  getProfileStore: () => ProfileStore | null
  getMultiStorePath: () => string | null
}

export function registerIpc(deps: IpcDeps): void {
  const { state, roots, runManager } = deps

  registerWindowHandlers()

  registerWorkspaceHandlers({ state, roots })
  registerAgentHandlers({ state, runManager })
  registerFsHandlers({ state, roots })
  registerConversationHandlers({ getStore: deps.getStore })
  registerReferenceHandlers({ state, roots })
  registerGitHandlers()
  registerLspHandlers()
  registerEngineHandlers()
  registerSettingsHandlers({
    getCurrentWorkspaceRoot: deps.getCurrentWorkspaceRoot,
    getSkillsStore: deps.getSkillsStore,
    getMcpStore: deps.getMcpStore,
    getCommandsStore: deps.getCommandsStore,
  })
  registerPersonalizationHandlers({
    getPrefsStore: deps.getPrefsStore,
    getProfileStore: deps.getProfileStore,
  })
  registerMultiHandlers({
    getMultiStorePath: deps.getMultiStorePath,
  })
}
