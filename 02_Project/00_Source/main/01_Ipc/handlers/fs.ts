import type { BrowserWindow } from 'electron'
import { pickDirectory } from '@main/07_Workspace/pickFolder'
import { getUserDataDir } from '@main/02_Common/userData'
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
import { resolveSafe, listDir } from '@main/07_Workspace/workspace'
import { listProjectFiles } from '@main/07_Workspace/listFiles'
import { saveImageBytes } from '@main/07_Workspace/attachments'
import { resolveFsDiffLines } from '@main/08_Git/fsDiff'
import { readFileSafe } from '@main/07_Workspace/read'
import { getWorkspaceRootPath } from '@main/07_Workspace/roots'
import type { RootRegistry } from '@main/07_Workspace/roots'
import { handle } from '../handle'

export interface FsHandlerDeps {
  state: {
    win: BrowserWindow | null
  }
  roots: RootRegistry
}

export function registerFsHandlers(deps: FsHandlerDeps): void {
  const { state, roots } = deps

  handle(IPC_CHANNELS.FS_DIFF, async (_e, req: FsDiffRequest): Promise<FsDiffResponse> => {
    if (!req?.filePath || typeof req.filePath !== 'string') {
      return { filePath: '', lines: [] }
    }

    const root = getWorkspaceRootPath(roots)
    if (!root) {
      return { filePath: req.filePath, lines: [] }
    }

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

  handle(IPC_CHANNELS.FS_READ, (_e, req: FsReadRequest): FsReadResponse => {
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

  handle(IPC_CHANNELS.LIST_FILES, async (): Promise<ListFilesResponse> => {
    const root = getWorkspaceRootPath(roots)
    if (!root) return { files: [] }
    try {
      return { files: await listProjectFiles(root) }
    } catch {
      return { files: [] }
    }
  })

  handle(IPC_CHANNELS.FS_LIST_DIR, async (_e, req: FsListDirRequest): Promise<FsListDirResponse> => {
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
      rootPath = getWorkspaceRootPath(roots)
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

  handle(IPC_CHANNELS.SAVE_IMAGE_DATA, async (_e, req: SaveImageDataRequest): Promise<SaveImageDataResponse> => {
    if (!req || !(req.bytes instanceof ArrayBuffer) || req.bytes.byteLength === 0) {
      return { path: '' }
    }
    try {
      const dir = join(getUserDataDir(), 'attachments')
      const path = await saveImageBytes(dir, req.bytes, typeof req.ext === 'string' ? req.ext : 'png')
      return { path }
    } catch {
      return { path: '' }
    }
  })

  handle(IPC_CHANNELS.DIALOG_PICK_FOLDER, async (): Promise<PickFolderResponse> => {
    const folderPath = await pickDirectory(state.win, 'AGENTDECK_E2E_PICK_FOLDER')
    if (folderPath === null) return { path: null }

    try {
      if (!existsSync(folderPath) || !statSync(folderPath).isDirectory()) return { path: null }
    } catch {
      return { path: null }
    }

    return { path: folderPath }
  })
}
