import nodeFsDefault from 'node:fs'
import nodePath from 'node:path'

export interface GuardDirent {
  name: string
  isDirectory: boolean
  isFile: boolean
}

export interface GuardFs {
  existsSync(p: string): boolean
  readdirSync(p: string): GuardDirent[]
  statSync(p: string): { size: number; mtimeMs: number }
}

export const nodeGuardFs: GuardFs = {
  existsSync: (p) => nodeFsDefault.existsSync(p),
  readdirSync: (p) =>
    nodeFsDefault.readdirSync(p, { withFileTypes: true }).map((d) => ({
      name: d.name,
      isDirectory: d.isDirectory(),
      isFile: d.isFile(),
    })),
  statSync: (p) => {
    const st = nodeFsDefault.statSync(p)
    return { size: st.size, mtimeMs: st.mtimeMs }
  },
}

export type SnapshotEntry = { kind: 'file'; size: number; mtimeMs: number } | { kind: 'dir' }

export interface DirSnapshot {
  dir: string
  exists: boolean
  entries: Record<string, SnapshotEntry>
}

export function snapshotDir(dir: string, fs: GuardFs = nodeGuardFs): DirSnapshot {
  const snap: DirSnapshot = { dir, exists: false, entries: {} }
  if (!fs.existsSync(dir)) return snap
  snap.exists = true
  walk(dir, '', fs, snap.entries)
  return snap
}

function walk(
  absDir: string,
  relPrefix: string,
  fs: GuardFs,
  out: Record<string, SnapshotEntry>
): void {
  let dirents: GuardDirent[]
  try {
    dirents = fs.readdirSync(absDir)
  } catch {
    return
  }
  for (const d of dirents) {
    const abs = nodePath.join(absDir, d.name)
    const rel = relPrefix ? `${relPrefix}/${d.name}` : d.name
    if (d.isDirectory) {
      out[rel] = { kind: 'dir' }
      walk(abs, rel, fs, out)
      continue
    }
    try {
      const st = fs.statSync(abs)
      out[rel] = { kind: 'file', size: st.size, mtimeMs: st.mtimeMs }
    } catch {
    }
  }
}

export interface DiffEntry {
  kind: 'added' | 'modified' | 'removed'
  path: string
  detail: string
}

export function diffSnapshot(before: DirSnapshot, after: DirSnapshot): DiffEntry[] {
  const out: DiffEntry[] = []

  if (!before.exists && after.exists) {
    out.push({ kind: 'added', path: '.', detail: '감시 대상 디렉토리가 새로 생성됨' })
  } else if (before.exists && !after.exists) {
    out.push({ kind: 'removed', path: '.', detail: '감시 대상 디렉토리가 삭제됨' })
    return out
  }

  const paths = new Set([...Object.keys(before.entries), ...Object.keys(after.entries)])
  const children: DiffEntry[] = []

  for (const p of paths) {
    const b = before.entries[p]
    const a = after.entries[p]

    if (!b && a) {
      children.push({ kind: 'added', path: p, detail: describe(a) + ' 생성됨' })
      continue
    }
    if (b && !a) {
      children.push({ kind: 'removed', path: p, detail: describe(b) + ' 삭제됨' })
      continue
    }
    if (!b || !a) continue

    if (b.kind !== a.kind) {
      children.push({ kind: 'modified', path: p, detail: `종류 변경: ${b.kind} → ${a.kind}` })
      continue
    }
    if (b.kind === 'file' && a.kind === 'file') {
      const notes: string[] = []
      if (b.size !== a.size) notes.push(`size ${b.size} → ${a.size}`)
      if (b.mtimeMs !== a.mtimeMs) notes.push(`mtime ${b.mtimeMs} → ${a.mtimeMs}`)
      if (notes.length > 0) {
        children.push({ kind: 'modified', path: p, detail: notes.join(', ') })
      }
    }
  }

  children.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0))
  return [...out, ...children]
}

function describe(e: SnapshotEntry): string {
  return e.kind === 'dir' ? '디렉토리가' : `파일(size ${e.size})이`
}

export function formatDiff(dir: string, diff: DiffEntry[]): string {
  const lines = diff.map((d) => `  - [${d.kind}] ${d.path} — ${d.detail}`)
  return [`감시 대상: ${dir}`, `변화 ${diff.length}건:`, ...lines].join('\n')
}
