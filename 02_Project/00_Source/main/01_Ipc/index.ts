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
} from '@main/00_App/context'
import { registerWorkspaceHandlers } from '@main/00_ipc/handlers/workspace'
import { registerAgentHandlers } from './handlers/agent'
import { registerFsHandlers } from '@main/00_ipc/handlers/fs'
import { registerConversationHandlers } from '@main/00_ipc/handlers/conversation'
import { registerReferenceHandlers } from '@main/00_ipc/handlers/reference'
import { registerGitHandlers } from '@main/00_ipc/handlers/git'
import { registerLspHandlers } from '@main/00_ipc/handlers/lsp'
import { registerEngineHandlers } from './handlers/engine'
import { registerSettingsHandlers } from '@main/00_ipc/handlers/settings'
import { registerPersonalizationHandlers } from '@main/00_ipc/handlers/personalization'
import { registerMultiHandlers } from '@main/00_ipc/handlers/multi'

export { setStore, disposeAllRuns, initMultiStore, getPrefsStore } from '@main/00_App/context'

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
