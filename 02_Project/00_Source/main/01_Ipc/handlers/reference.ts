import { ipcMain, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { isAbsolute, basename } from 'node:path'
import { IPC_CHANNELS } from '../../../shared/ipcContract'
import type {
  ReferenceAddRequest,
  ReferenceAddResponse,
  ReferenceListResponse,
  ReferenceTreeRequest,
  ReferenceTreeResponse,
} from '../../../shared/ipcContract'
import { buildTree } from '../../02_fs/workspace'
import type { RootRegistry } from '../../02_fs/roots'

export interface ReferenceHandlerDeps {
  state: { win: BrowserWindow | null }
  roots: RootRegistry
}

export function registerReferenceHandlers(deps: ReferenceHandlerDeps): void {
  const { state, roots } = deps

  ipcMain.handle(IPC_CHANNELS.REFERENCE_ADD, async (_e, req: ReferenceAddRequest): Promise<ReferenceAddResponse> => {
    let folderPath: string | null = null

    if (req?.folderPath) {
      if (!isAbsolute(req.folderPath)) {
        return { reference: null }
      }
      folderPath = req.folderPath.replace(/\\/g, '/')
    } else if (process.env.AGENTDECK_E2E_REFERENCE) {
      folderPath = process.env.AGENTDECK_E2E_REFERENCE.replace(/\\/g, '/')
    } else {
      const result = state.win
        ? await dialog.showOpenDialog(state.win, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] })
      if (result.canceled || result.filePaths.length === 0) {
        return { reference: null }
      }
      folderPath = result.filePaths[0].replace(/\\/g, '/')
    }

    try {
      if (!existsSync(folderPath) || !statSync(folderPath).isDirectory()) {
        return { reference: null }
      }
    } catch {
      return { reference: null }
    }

    const name = basename(folderPath)
    const reference = roots.addReference(folderPath, name)
    return { reference }
  })

  ipcMain.handle(IPC_CHANNELS.REFERENCE_LIST, (): ReferenceListResponse => {
    return { references: roots.listReferences() }
  })

  ipcMain.handle(IPC_CHANNELS.REFERENCE_TREE, async (_e, req: ReferenceTreeRequest): Promise<ReferenceTreeResponse> => {
    if (!req?.id || typeof req.id !== 'string') {
      return { tree: null }
    }
    const rootEntry = roots.get(req.id)
    if (!rootEntry) {
      return { tree: null }
    }
    try {
      const tree = await buildTree(rootEntry.path)
      return { tree }
    } catch {
      return { tree: null }
    }
  })
}
