import { ipcMain, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import { isAbsolute } from 'node:path'
import { IPC_CHANNELS } from '../../../shared/ipcContract'
import type {
  WorkspaceOpenRequest,
  WorkspaceOpenResponse,
  WorkspaceTreeResponse,
} from '../../../shared/ipcContract'
import { buildTree, validateWorkspaceRoot } from '../../02_fs/workspace'
import type { RootRegistry } from '../../02_fs/roots'

export interface WorkspaceHandlerDeps {
  state: {
    win: BrowserWindow | null
    currentWorkspaceRoot: string | null
  }
  roots: RootRegistry
}

export function registerWorkspaceHandlers(deps: WorkspaceHandlerDeps): void {
  const { state, roots } = deps

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_OPEN, async (_e, req: WorkspaceOpenRequest): Promise<WorkspaceOpenResponse> => {
    let rootPath: string | null = null

    if (req?.folderPath) {
      if (!isAbsolute(req.folderPath)) {
        return { rootPath: null, tree: null }
      }
      rootPath = req.folderPath.replace(/\\/g, '/')
    } else if (process.env.AGENTDECK_E2E_WORKSPACE) {
      rootPath = process.env.AGENTDECK_E2E_WORKSPACE.replace(/\\/g, '/')
    } else {
      const result = state.win
        ? await dialog.showOpenDialog(state.win, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] })
      if (result.canceled || result.filePaths.length === 0) {
        return { rootPath: null, tree: null }
      }
      rootPath = result.filePaths[0].replace(/\\/g, '/')
    }

    try {
      if (!validateWorkspaceRoot(rootPath)) {
        return { rootPath: null, tree: null }
      }
      const tree = await buildTree(rootPath)
      state.currentWorkspaceRoot = rootPath
      roots.setWorkspace(rootPath)
      return { rootPath, tree }
    } catch {
      return { rootPath: null, tree: null }
    }
  })

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_TREE, async (): Promise<WorkspaceTreeResponse> => {
    if (!state.currentWorkspaceRoot) {
      return { tree: null }
    }
    const tree = await buildTree(state.currentWorkspaceRoot)
    return { tree }
  })
}
