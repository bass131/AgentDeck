import type { DiffLine } from '../diffTypes'
import type { FileTreeNode } from './workspace'

export const FS_CHANNELS = {
  FS_DIFF: 'fs.diff',
  FS_READ: 'fs.read',
  LIST_FILES: 'fs.listFiles',
  FS_LIST_DIR: 'fs.listDir',
  SAVE_IMAGE_DATA: 'image.saveData',
  DIALOG_PICK_FOLDER: 'dialog.pickFolder',
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
