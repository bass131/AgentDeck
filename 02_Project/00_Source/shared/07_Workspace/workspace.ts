export const WORKSPACE_CHANNELS = {
  WORKSPACE_OPEN: 'workspace.open',
  WORKSPACE_TREE: 'workspace.tree',
} as const

export interface FileTreeNode {
  name: string
  path: string
  kind: 'file' | 'directory'
  children?: FileTreeNode[]
}

export interface WorkspaceOpenRequest {
  folderPath?: string
}

export interface WorkspaceOpenResponse {
  rootPath: string | null
  tree: FileTreeNode | null
}

export type WorkspaceTreeRequest = Record<string, never>

export interface WorkspaceTreeResponse {
  tree: FileTreeNode | null
}
