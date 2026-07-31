import { readFileSync, existsSync } from 'node:fs'
import type { DiffLine } from '../../shared/ipcContract'
import { gitHeadContent } from '../git'
import { resolveSafe } from './workspace'

function lcs(a: string[], b: string[]): string[] {
  const m = a.length
  const n = b.length

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const result: string[] = []
  let i = m
  let j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1])
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  return result
}

export function computeDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent === '' ? [] : oldContent.split('\n')
  const newLines = newContent === '' ? [] : newContent.split('\n')

  if (oldLines.length === 0 && newLines.length === 0) return []

  const common = lcs(oldLines, newLines)

  const result: DiffLine[] = []
  let oi = 0
  let ni = 0
  let ci = 0
  let lineOld = 1
  let lineNew = 1

  while (ci < common.length) {
    while (oi < oldLines.length && oldLines[oi] !== common[ci]) {
      result.push({
        kind: 'remove',
        content: oldLines[oi],
        lineOld: lineOld++
      })
      oi++
    }
    while (ni < newLines.length && newLines[ni] !== common[ci]) {
      result.push({
        kind: 'add',
        content: newLines[ni],
        lineNew: lineNew++
      })
      ni++
    }

    result.push({
      kind: 'context',
      content: common[ci],
      lineOld: lineOld++,
      lineNew: lineNew++
    })
    oi++
    ni++
    ci++
  }

  while (oi < oldLines.length) {
    result.push({
      kind: 'remove',
      content: oldLines[oi],
      lineOld: lineOld++
    })
    oi++
  }
  while (ni < newLines.length) {
    result.push({
      kind: 'add',
      content: newLines[ni],
      lineNew: lineNew++
    })
    ni++
  }

  return result
}

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
