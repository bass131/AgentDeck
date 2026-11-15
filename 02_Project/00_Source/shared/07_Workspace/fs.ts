import type { DiffLine } from '../02_Common/diffTypes'
import type { FileTreeNode } from './workspace'

export const FS_CHANNELS = {
  FS_DIFF: 'fs.diff',
  FS_READ: 'fs.read',
  LIST_FILES: 'fs.listFiles',
  FS_LIST_DIR: 'fs.listDir',
  // M05 G10 재분류: image.saveData·dialog.pickFolder → workspace.* (구현과 preload 묶음이 workspace다)
  SAVE_IMAGE_DATA: 'workspace.saveImage',
  DIALOG_PICK_FOLDER: 'workspace.pickFolder',
} as const

export interface FsDiffRequest {
  filePath: string
}

export interface FsDiffResponse {
  filePath: string
  lines: DiffLine[]
}

export interface FsReadRequest {
  path: string
  root?: string
  asBinary?: boolean
}

export type FsReadResponse =
  | { kind: 'text'; content: string; language: string }
  | { kind: 'binary'; dataUrl: string; mime: string }
  | { kind: 'too-large' }
  | { kind: 'binary-skipped' }
  | { kind: 'not-found' }

export type ListFilesRequest = Record<string, never>

export interface ListFilesResponse {
  files: string[]
}

export interface FsListDirRequest {
  rootId?: string
  relDir: string
}

export interface FsListDirResponse {
  entries: FileTreeNode[]
}

export interface SaveImageDataRequest {
  bytes: ArrayBuffer
  ext: string
}

export interface SaveImageDataResponse {
  path: string
}

export interface PickFolderResponse {
  path: string | null
}
