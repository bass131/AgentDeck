import type { FileTreeNode } from '../../../shared/ipcContract'

export interface FlatFile {
  name: string
  path: string
}

export function filterFiles(
  tree: FileTreeNode | null,
  query: string,
  limit = 100
): FlatFile[] {
  const q = query.trim().toLowerCase()
  if (!q || !tree) return []

  const out: FlatFile[] = []
  const walk = (node: FileTreeNode): void => {
    if (node.kind === 'file') {
      if (node.name.toLowerCase().includes(q)) out.push({ name: node.name, path: node.path })
    } else {
      node.children?.forEach(walk)
    }
  }
  tree.children?.forEach(walk)

  out.sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1
    const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1
    if (aStarts !== bStarts) return aStarts - bStarts
    return a.path.localeCompare(b.path)
  })

  return out.slice(0, limit)
}
