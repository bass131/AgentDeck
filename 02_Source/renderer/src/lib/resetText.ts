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
