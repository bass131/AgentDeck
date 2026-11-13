import type { FileTreeNode } from './workspace'

export const REFERENCE_CHANNELS = {
  REFERENCE_ADD: 'reference.add',
  REFERENCE_LIST: 'reference.list',
  REFERENCE_TREE: 'reference.tree',
} as const

export interface ReferenceFolder {
  id: string
  name: string
  rootPath: string
  readOnly: true
}

export interface ReferenceAddRequest {
  folderPath?: string
}

export interface ReferenceAddResponse {
  reference: ReferenceFolder | null
}

export type ReferenceListRequest = Record<string, never>

export interface ReferenceListResponse {
  references: ReferenceFolder[]
}

export interface ReferenceTreeRequest {
  id: string
}

export interface ReferenceTreeResponse {
  tree: FileTreeNode | null
}
