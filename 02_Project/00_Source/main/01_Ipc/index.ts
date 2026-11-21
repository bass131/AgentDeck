import type { BrowserWindow } from 'electron'
import type { RootRegistry } from '@main/07_Workspace/roots'
import type { RunManager } from '@main/03_Agent/agentRuns'
import type { ConversationStore } from '@main/06_Sessions/store'
import type { PrefsStore } from '@main/11_Settings/prefs'
import type { ProfileStore } from '@main/11_Settings/profile'
import type { SkillsStore } from '@main/11_Settings/skills'
import type { McpStore } from '@main/11_Settings/mcp'
import type { CommandsStore } from '@main/11_Settings/commands'
import type { LoopAlert, ModelListResponse } from '@shared/ipcContract'
import { registerWorkspaceHandlers } from './handlers/workspace'
import { registerAgentHandlers } from './handlers/agent'
import { registerFsHandlers } from './handlers/fs'
import { registerConversationHandlers } from './handlers/conversation'
import { registerReferenceHandlers } from './handlers/reference'
import { registerGitHandlers } from './handlers/git'
import { registerLspHandlers } from './handlers/lsp'
import { registerEngineHandlers } from './handlers/engine'
import { registerSettingsHandlers } from './handlers/settings'
import { registerControlsHandlers } from './handlers/controls'
import { registerPersonalizationHandlers } from './handlers/personalization'
import { registerWindowHandlers } from './handlers/window'
import { registerLoopHandlers, type LoopDriverApi } from './handlers/loop'
import { registerTasteHandlers } from './handlers/taste'
import { registerGithubHandlers } from './handlers/github'
import type { GithubAuth } from '@main/14_GitHub/githubAuth'

// 등록만 한다. 한 번만 등록하는 가드와 store 초기화는 조립 지점(00_App/bootstrap)이 쥔다.
interface IpcDeps {
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
  getModelList?: () => Promise<ModelListResponse>
  // 없으면 루프 채널을 등록하지 않는다
  loopDriver?: LoopDriverApi
  loopAlerts?: { list(): LoopAlert[] }
  // 없으면 GitHub 연결 채널을 등록하지 않는다
  githubAuth?: GithubAuth
}

export function registerIpc(deps: IpcDeps): void {
  const { state, roots, runManager } = deps

  registerWindowHandlers()

  registerWorkspaceHandlers({ state, roots })
  registerAgentHandlers({ state, runManager, getModelList: deps.getModelList })
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
  registerControlsHandlers()
  registerPersonalizationHandlers({
    getPrefsStore: deps.getPrefsStore,
    getProfileStore: deps.getProfileStore,
  })
  registerTasteHandlers()
  if (deps.githubAuth) registerGithubHandlers({ auth: deps.githubAuth })
  if (deps.loopDriver) registerLoopHandlers({ driver: deps.loopDriver, ...(deps.loopAlerts ? { alerts: deps.loopAlerts } : {}) })
}
