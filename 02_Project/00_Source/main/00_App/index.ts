import type { BrowserWindow } from 'electron'
import { registerWindowControls } from '../06_window/controls'
import {
  ipcState,
  roots,
  runManager,
  initStores,
  initLsp,
  getStore,
  getPrefsStore,
  getProfileStore,
  getSkillsStore,
  getMcpStore,
  getCommandsStore,
} from './context'
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

export { setStore, disposeAllRuns, initMultiStore, getPrefsStore } from './context'

let _registered = false

export function registerIpc(win: BrowserWindow): void {
  ipcState.win = win
  if (_registered) return
  _registered = true

  initStores()
  initLsp()

  registerWindowControls()

  registerWorkspaceHandlers({ state: ipcState, roots })
  registerAgentHandlers({ state: ipcState, runManager })
  registerFsHandlers({ state: ipcState, roots })
  registerConversationHandlers({ getStore })
  registerReferenceHandlers({ state: ipcState, roots })
  registerGitHandlers()
  registerLspHandlers()
  registerEngineHandlers()
  registerSettingsHandlers({
    getCurrentWorkspaceRoot: () => ipcState.currentWorkspaceRoot,
    getSkillsStore,
    getMcpStore,
    getCommandsStore,
  })
  registerPersonalizationHandlers({
    getPrefsStore,
    getProfileStore,
  })
  registerMultiHandlers({
    getMultiStorePath: () => ipcState.multiStorePath,
  })
}
