import { ipcMain, dialog, app } from 'electron'
import type { BrowserWindow } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { IPC_CHANNELS, WORKSPACE_ROOT_ID } from '../../../shared/ipcContract'
import type {
  FsDiffRequest,
  FsDiffResponse,
  FsReadRequest,
  FsReadResponse,
  ListFilesResponse,
  FsListDirRequest,
  FsListDirResponse,
  SaveImageDataRequest,
  SaveImageDataResponse,
  PickFolderResponse,
} from '../../../shared/ipcContract'
import { resolveSafe, listDir } from '../../02_fs/workspace'
import { listProjectFiles } from '../../02_fs/listFiles'
import { saveImageBytes } from '../../02_fs/attachments'
import { resolveFsDiffLines } from '../../02_fs/diff'
import { readFileSafe } from '../../02_fs/read'
import type { RootRegistry } from '../../02_fs/roots'

export interface FsHandlerDeps {
  state: {
    win: BrowserWindow | null
    currentWorkspaceRoot: string | null
  }
  roots: RootRegistry
}

export function registerFsHandlers(deps: FsHandlerDeps): void {
  const { state, roots } = deps

  ipcMain.handle(IPC_CHANNELS.FS_DIFF, async (_e, req: FsDiffRequest): Promise<FsDiffResponse> => {
    if (!req?.filePath || typeof req.filePath !== 'string') {
      return { filePath: '', lines: [] }
    }

    if (!state.currentWorkspaceRoot) {
      return { filePath: req.filePath, lines: [] }
    }
    const root = state.currentWorkspaceRoot

    const safePath = resolveSafe(root, req.filePath)
    if (!safePath) {
      return { filePath: req.filePath, lines: [] }
    }

    try {
      const lines = await resolveFsDiffLines(root, req.filePath)
      return { filePath: req.filePath, lines }
    } catch {
      return { filePath: req.filePath, lines: [] }
    }
  })

  ipcMain.handle(IPC_CHANNELS.FS_READ, (_e, req: FsReadRequest): FsReadResponse => {
    if (!req?.path || typeof req.path !== 'string') {
      return { kind: 'not-found' }
    }

    const rootId = (typeof req.root === 'string' && req.root) ? req.root : WORKSPACE_ROOT_ID

    const rootEntry = roots.get(rootId)
    if (!rootEntry) {
      return { kind: 'not-found' }
    }

    return readFileSafe(rootEntry.path, req.path, { asBinary: req.asBinary === true })
  })

  ipcMain.handle(IPC_CHANNELS.LIST_FILES, async (): Promise<ListFilesResponse> => {
    if (!state.currentWorkspaceRoot) return { files: [] }
    try {
      return { files: await listProjectFiles(state.currentWorkspaceRoot) }
    } catch {
      return { files: [] }
    }
  })

  ipcMain.handle(IPC_CHANNELS.FS_LIST_DIR, async (_e, req: FsListDirRequest): Promise<FsListDirResponse> => {
    if (!req || typeof req.relDir !== 'string') {
      return { entries: [] }
    }

    let rootPath: string | null = null
    if (typeof req.rootId === 'string' && req.rootId) {
      const rootEntry = roots.get(req.rootId)
      if (!rootEntry) {
        return { entries: [] }
      }
      rootPath = rootEntry.path
    } else {
      rootPath = state.currentWorkspaceRoot
    }

    if (!rootPath) {
      return { entries: [] }
    }

    try {
      const entries = await listDir(rootPath, req.relDir)
      return { entries }
    } catch {
      return { entries: [] }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SAVE_IMAGE_DATA, async (_e, req: SaveImageDataRequest): Promise<SaveImageDataResponse> => {
    if (!req || !(req.bytes instanceof ArrayBuffer) || req.bytes.byteLength === 0) {
      return { path: '' }
    }
    try {
      const dir = join(app.getPath('userData'), 'attachments')
      const path = await saveImageBytes(dir, req.bytes, typeof req.ext === 'string' ? req.ext : 'png')
      return { path }
    } catch {
      return { path: '' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.DIALOG_PICK_FOLDER, async (): Promise<PickFolderResponse> => {
    let folderPath: string | null = null

    if (process.env.AGENTDECK_E2E_PICK_FOLDER) {
      folderPath = process.env.AGENTDECK_E2E_PICK_FOLDER.replace(/\\/g, '/')
    } else {
      const result = state.win
        ? await dialog.showOpenDialog(state.win, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] })
      if (result.canceled || result.filePaths.length === 0) return { path: null }
      folderPath = result.filePaths[0].replace(/\\/g, '/')
    }

    try {
      if (!existsSync(folderPath) || !statSync(folderPath).isDirectory()) return { path: null }
    } catch {
      return { path: null }
    }

    return { path: folderPath }
  })
}
