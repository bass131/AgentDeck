// PR 카드의 순수 도우미 (M07 G8) — 대화에서 PR URL을 감지하고 카드 문구를 만든다.
// 감지한 URL은 번호를 찾는 데만 쓴다. 저장소 비교와 카드의 값은 모두 main이 한다(08_Git/prMerge.ts).
import type { PrCheckResult, PrMergeResponse, PrView } from '@shared/ipcContract'

const GH_PR_CREATE = /\bgh(?:\.exe)?\b[^\n;&|]*?\bpr\s+create\b/i
const PR_URL = /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/g

function resultText(result: unknown): string | null {
  if (typeof result === 'string') return result
  // SDK 도구 결과가 블록 배열로 올 때 — 글 블록만 잇는다
  if (Array.isArray(result)) {
    const parts = result
      .map((b) => (b && typeof b === 'object' && typeof (b as { text?: unknown }).text === 'string' ? (b as { text: string }).text : ''))
      .filter(Boolean)
    return parts.length ? parts.join('\n') : null
  }
  return null
}

// `gh pr create`를 부른 Bash 호출의 결과에 보인 PR URL(여럿이면 마지막). 없으면 null
export function prUrlFromToolCall(input: unknown, result: unknown): string | null {
  const command = input && typeof input === 'object' ? (input as { command?: unknown }).command : undefined
  if (typeof command !== 'string' || !GH_PR_CREATE.test(command)) return null
  const text = resultText(result)
  if (!text) return null
  const found = text.match(PR_URL)
  return found ? found[found.length - 1] : null
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

const CHECK_LABEL: Record<PrCheckResult, string> = { success: '성공', pending: '대기 중', failure: '실패', missing: '결과 없음' }

export function checkLabel(r: PrCheckResult): string {
  return CHECK_LABEL[r]
}

// 확인 단계 문구 — 전체 SHA와 main이 읽은 base 이름을 다시 보인다
export function confirmText(pr: Pick<PrView, 'headSha' | 'baseRef'>): string {
  return `이 커밋 ${pr.headSha}를 ${pr.baseRef}에 병합`
}

export function mergeOutcomeText(r: PrMergeResponse): string {
  switch (r.status) {
    case 'merged':
      return r.mergeSha ? `병합했어요 — 병합 커밋 ${r.mergeSha}` : '병합했어요'
    case 'enqueued':
      return '병합 큐에 들어감'
    case 'refused':
      return `병합하지 않았어요 — ${r.message}`
    case 'failed':
      return `병합 실패 — ${r.message}`
    case 'timeout':
      return r.message
  }
}
