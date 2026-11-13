export function modelDisplay(id: unknown): string {
  const s = typeof id === 'string' ? id : ''
  const m = /claude-(fable|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?\b/i.exec(s)
  if (!m) return s || '다른 모델'
  return m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + ' ' + m[2] + (m[3] ? '.' + m[3] : '')
}

export const REFUSAL_CATEGORY_LABEL: Record<string, string> = {
  cyber: '사이버 보안',
  bio: '생물학',
}

export function fallbackNotice(from: unknown, to: unknown, category: unknown): string {
  const f = modelDisplay(from)
  const t = modelDisplay(to)
  const c = typeof category === 'string' && category
    ? ` (감지 분류: ${REFUSAL_CATEGORY_LABEL[category] ?? category})`
    : ''
  return `${f}의 안전 정책이 이 요청에 대한 응답을 거부해 ${t} 모델로 자동 전환했어요${c}. 이후 대화도 ${t} 모델로 진행됩니다.`
}
