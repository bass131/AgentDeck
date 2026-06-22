/**
 * diff.ts — 워크트리 vs 스냅샷 라인 diff (순수 모듈)
 *
 * CRITICAL: electron을 import하지 않는다 → vitest node 환경에서 직접 테스트 가능.
 *
 * 새 npm 의존성 추가 금지 (지시서 제약):
 *   LCS(Longest Common Subsequence, 최장 공통 부분 수열) 기반 diff를 자체 구현.
 *
 * LCS diff 알고리즘 개요:
 *   1) 두 배열의 LCS를 구한다 (DP).
 *   2) LCS에 없는 old 라인 → remove, new 라인 → add, 공통 → context.
 *
 * 트레이드오프:
 *   - O(m*n) 메모리·시간. 대형 파일(> 수만 라인)에서 느릴 수 있음.
 *   - MVP 범위(코드 파일 diff)에서는 충분.
 *   - 바이너리 파일은 호출 전 가드(ipc/index.ts)로 처리.
 */

import type { DiffLine } from '../../shared/ipc-contract'

// ── LCS 구현 ──────────────────────────────────────────────────────────────────

/**
 * 두 문자열 배열의 LCS(Longest Common Subsequence)를 DP로 구한다.
 *
 * @returns LCS 배열 (공통 원소들의 순서 유지 배열)
 */
function lcs(a: string[], b: string[]): string[] {
  const m = a.length
  const n = b.length

  // dp[i][j] = a[0..i-1], b[0..j-1] 의 LCS 길이
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

  // 역추적으로 LCS 원소 복원
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

// ── computeDiff ───────────────────────────────────────────────────────────────

/**
 * 스냅샷(oldContent)과 워크트리(newContent)를 라인 단위로 diff한다.
 *
 * @param oldContent  스냅샷(이전) 파일 내용 (빈 문자열 허용)
 * @param newContent  워크트리(현재) 파일 내용 (빈 문자열 허용)
 * @returns           DiffLine[] (contract 타입, add/remove/context)
 */
export function computeDiff(oldContent: string, newContent: string): DiffLine[] {
  // 빈 문자열 처리 — 빈 문자열은 라인 없음 (split('') 하면 [''] 되는 것 방지)
  const oldLines = oldContent === '' ? [] : oldContent.split('\n')
  const newLines = newContent === '' ? [] : newContent.split('\n')

  if (oldLines.length === 0 && newLines.length === 0) return []

  const common = lcs(oldLines, newLines)

  const result: DiffLine[] = []
  let oi = 0 // oldLines 인덱스
  let ni = 0 // newLines 인덱스
  let ci = 0 // common 인덱스
  let lineOld = 1 // 1-based 원본 라인 번호
  let lineNew = 1 // 1-based 변경 라인 번호

  while (ci < common.length) {
    // common[ci]가 나오기 전까지 old/new에서 소비되는 라인을 remove/add로 처리
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

    // context 라인
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

  // LCS 소진 후 남은 라인 처리
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
