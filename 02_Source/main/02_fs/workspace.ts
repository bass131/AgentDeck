import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { FileTreeNode } from '../../shared/ipcContract'

function isWithin(root: string, candidate: string): boolean {
  let r = resolve(root).replace(/\\/g, '/')
  let c = resolve(candidate).replace(/\\/g, '/')
  if (process.platform === 'win32') {
    r = r.toLowerCase()
    c = c.toLowerCase()
  }
  const rootWithSep = r.endsWith('/') ? r : r + '/'
  return c === r || c === rootWithSep.slice(0, -1) || c.startsWith(rootWithSep)
}

function realOfExistingAncestor(p: string): string | null {
  let current = resolve(p)
  for (let i = 0; i < 4096; i++) {
    if (existsSync(current)) {
      try {
        return realpathSync.native(current)
      } catch {
        return current
      }
    }
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
  return null
}

export function validateWorkspaceRoot(candidate: string | null | undefined): string | null {
  if (typeof candidate !== 'string' || candidate.trim().length === 0) return null
  if (!isAbsolute(candidate)) return null
  try {
    if (!existsSync(candidate) || !statSync(candidate).isDirectory()) return null
  } catch {
    return null
  }
  return candidate
}

export function resolveSafe(root: string, p: string): string | null {
  const normalizedRoot = resolve(root)
  const candidate = resolve(normalizedRoot, p)

  if (!isWithin(normalizedRoot, candidate)) return null

  const realRoot = realOfExistingAncestor(normalizedRoot)
  const realCandidate = realOfExistingAncestor(candidate)
  if (realRoot && realCandidate && !isWithin(realRoot, realCandidate)) return null

  return candidate.replace(/\\/g, '/')
}

export async function listDir(root: string, rel: string): Promise<FileTreeNode[]> {
  if (!root) return []

  const safeAbs = resolveSafe(root, rel || '.')
  if (!safeAbs) return []

  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(safeAbs, { withFileTypes: true })
  } catch {
    return []
  }

  const out: FileTreeNode[] = entries.map((e) => {
    const name = e.name
    const nodePath = rel ? rel + '/' + name : name
    const kind: 'file' | 'directory' = e.isDirectory() ? 'directory' : 'file'
    return { name, path: nodePath, kind }
  })

  out.sort((a, b) =>
    a.kind === b.kind
      ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      : a.kind === 'directory'
        ? -1
        : 1
  )

  return out
}

export async function buildTree(root: string): Promise<FileTreeNode> {
  const absRoot = resolve(root).replace(/\\/g, '/')
  const name = absRoot.split('/').pop() || absRoot

  const stat = statSync(root)

  if (!stat.isDirectory()) {
    return { name, path: '', kind: 'file' }
  }

  const rawEntries = readdirSync(root)
  const children: FileTreeNode[] = []

  for (const entry of rawEntries) {
    const childRel = entry
    const childAbs = join(root, entry)
    try {
      const childStat = statSync(childAbs)
      children.push({
        name: entry,
        path: childRel,
        kind: childStat.isDirectory() ? 'directory' : 'file'
      })
    } catch {
    }
  }

  children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return {
    name,
    path: '',
    kind: 'directory',
    children
  }
}
