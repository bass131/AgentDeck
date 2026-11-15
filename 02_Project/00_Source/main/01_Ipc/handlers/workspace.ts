import { handle } from '../handle'
import type { BrowserWindow } from 'electron'
import { isAbsolute } from 'node:path'
import { IPC_CHANNELS } from '../../../shared/ipcContract'
import type {
  WorkspaceOpenRequest,
  WorkspaceOpenResponse,
  WorkspaceTreeResponse,
} from '../../../shared/ipcContract'
import { buildTree, validateWorkspaceRoot } from '@main/07_Workspace/workspace'
import { pickDirectory } from '@main/07_Workspace/pickFolder'
import { getWorkspaceRootPath } from '@main/07_Workspace/roots'
import type { RootRegistry } from '@main/07_Workspace/roots'

export interface WorkspaceHandlerDeps {
  state: {
    win: BrowserWindow | null
  }
  roots: RootRegistry
}

export function registerWorkspaceHandlers(deps: WorkspaceHandlerDeps): void {
  const { state, roots } = deps

  handle(IPC_CHANNELS.WORKSPACE_OPEN, async (_e, req: WorkspaceOpenRequest): Promise<WorkspaceOpenResponse> => {
    let rootPath: string | null = null

    if (req?.folderPath) {
      if (!isAbsolute(req.folderPath)) {
        return { rootPath: null, tree: null }
      }
      rootPath = req.folderPath.replace(/\\/g, '/')
    } else {
      const picked = await pickDirectory(state.win, 'AGENTDECK_E2E_WORKSPACE')
      if (picked === null) {
        return { rootPath: null, tree: null }
      }
      rootPath = picked
    }

    try {
      if (!validateWorkspaceRoot(rootPath)) {
        return { rootPath: null, tree: null }
      }
      const tree = await buildTree(rootPath)
      roots.setWorkspace(rootPath)
      return { rootPath, tree }
    } catch {
      return { rootPath: null, tree: null }
    }
  })

  handle(IPC_CHANNELS.WORKSPACE_TREE, async (): Promise<WorkspaceTreeResponse> => {
    const root = getWorkspaceRootPath(roots)
    if (!root) {
      return { tree: null }
    }
    const tree = await buildTree(root)
    return { tree }
  })
}
