/**
 * resetText.ts — OAuth 레이트리밋 리셋 시각 포매터.
 *
 * 원본: AgentCodeGUI Chat.tsx L907~920 1:1 미러.
 *
 * CRITICAL: 순수 함수 — 부수효과 없음. window.api 호출 0.
 */

/**
 * resetsAt(unix seconds) + useDays 플래그 → 한국어 리셋 시간 문자열.
 *
 * 케이스:
 *   resetsAt == null     → '초기화 시간 미상'
 *   rem <= 0             → '곧 초기화'
 *   useDays && h >= 24   → 'N일 H시간 후 초기화'
 *   h > 0                → 'H시간 M분 후 초기화'
 *   h == 0               → 'M분 후 초기화'
 */
export function resetText(resetsAt: number | null, useDays: boolean): string {
  if (resetsAt == null) return '초기화 시간 미상'
  const rem = resetsAt - Math.floor(Date.now() / 1000)
  if (rem <= 0) return '곧 초기화'
  const mins = Math.floor(rem / 60)
  let h = Math.floor(mins / 60)
  const m = mins % 60
  if (useDays && h >= 24) {
    const d = Math.floor(h / 24)
    h = h % 24
    return `${d}일 ${h}시간 후 초기화`
  }
  return h > 0 ? `${h}시간 ${m}분 후 초기화` : `${m}분 후 초기화`
}
