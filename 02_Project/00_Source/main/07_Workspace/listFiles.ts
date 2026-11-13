import fs from 'node:fs'
import path from 'node:path'
import { SKIP_DIRS, KEEP_DOT_DIRS, MAX_FILES } from './skipDirs'

export async function listProjectFiles(root: string): Promise<string[]> {
  if (!root) return []
  const out: string[] = []
  const queue: string[] = ['']
  while (queue.length && out.length < MAX_FILES) {
    const rel = queue.shift() as string
    const abs = rel ? path.join(root, rel) : root
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(abs, { withFileTypes: true })
    } catch {
      continue
    }
    const dirs: string[] = []
    for (const e of entries) {
      const name = e.name
      const childRel = rel ? rel + '/' + name : name
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue
        if (name.startsWith('.') && !KEEP_DOT_DIRS.has(name)) continue
        dirs.push(childRel)
      } else if (e.isFile()) {
        out.push(childRel)
        if (out.length >= MAX_FILES) break
      }
    }
    for (const d of dirs) queue.push(d)
  }
  return out
}
