import { readFileSync, existsSync } from 'node:fs'
import type { DiffLine } from '../../shared/ipcContract'
import { computeDiff } from './diff'
import { gitHeadContent } from './git'
import { resolveSafe } from '@main/07_Workspace/workspace'

export async function resolveFsDiffLines(root: string, relPath: string): Promise<DiffLine[]> {
  if (resolveSafe(root, relPath) === null) return []

  const absPath = root.replace(/\\/g, '/').replace(/\/$/, '') + '/' + relPath
  if (!existsSync(absPath)) {
    return []
  }

  let currentContent: string
  try {
    const buf = readFileSync(absPath)
    const sample = buf.slice(0, 8192)
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) return []
    }
    currentContent = buf.toString('utf-8')
  } catch {
    return []
  }

  const headContent = await gitHeadContent(root, relPath)
  const snapshotContent = headContent ?? ''

  return computeDiff(snapshotContent, currentContent)
}
