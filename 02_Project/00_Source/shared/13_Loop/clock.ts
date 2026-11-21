// 사람이 읽는 지역 시각(「11월 21일 19:00」). 읽을 수 없는 시각이면 null
export function localClockLabel(ms: number): string | null {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`
}
