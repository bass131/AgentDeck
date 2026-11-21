import type { DiffLine } from '../../shared/ipcContract'

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

// (m+1)×(n+1) 표가 main 프로세스를 멎게 하지 않도록, 넘으면 표를 만들지 않는다
const MAX_LCS_CELLS = 4_000_000

function trimmedDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  let head = 0
  while (head < oldLines.length && head < newLines.length && oldLines[head] === newLines[head]) head++
  let tail = 0
  while (
    tail < oldLines.length - head &&
    tail < newLines.length - head &&
    oldLines[oldLines.length - 1 - tail] === newLines[newLines.length - 1 - tail]
  ) tail++

  const out: DiffLine[] = []
  for (let i = 0; i < head; i++) out.push({ kind: 'context', content: oldLines[i], lineOld: i + 1, lineNew: i + 1 })
  for (let i = head; i < oldLines.length - tail; i++) out.push({ kind: 'remove', content: oldLines[i], lineOld: i + 1 })
  for (let i = head; i < newLines.length - tail; i++) out.push({ kind: 'add', content: newLines[i], lineNew: i + 1 })
  for (let t = tail; t > 0; t--) {
    const oi = oldLines.length - t
    out.push({ kind: 'context', content: oldLines[oi], lineOld: oi + 1, lineNew: newLines.length - t + 1 })
  }
  return out
}

export function computeDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent === '' ? [] : oldContent.split('\n')
  const newLines = newContent === '' ? [] : newContent.split('\n')

  if (oldLines.length === 0 && newLines.length === 0) return []
  if (oldLines.length * newLines.length > MAX_LCS_CELLS) return trimmedDiff(oldLines, newLines)

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
