/**
 * modelFallback.ts — 모델 폴백 표시 헬퍼 (RF1-followup P03: eventNormalizer에서 분리)
 *
 * 모델 ID → 표시 이름, 거부 분류 라벨, 폴백 경고 배너 텍스트를 생성하는 순수 함수 모음.
 * 두 소비자가 공유한다(SRP — "변하는 이유"가 표시 문구 하나):
 *  - eventNormalizer.RunEventNormalizer.process() — system/model_refusal_fallback 경로.
 *  - sdkOptions.makeRefusalFallbackHandler() — onUserDialog(refusal_fallback_prompt) 경로.
 *
 * 격리 원칙(ADR-003): 엔진 고유 모델 ID 형상은 이 파일 내부에만. 출력은 표시 문자열(공통).
 * 신뢰경계: 모델 ID 문자열만 다룬다 — 시크릿 0.
 *
 * (원본 engine.ts L807-823 미러)
 */

/**
 * 모델 ID → 표시 이름 변환.
 * 'claude-fable-5' → 'Fable 5', 'claude-opus-4-8' → 'Opus 4.8'.
 * 빈 문자열 또는 패턴 불일치 시 '다른 모델' 폴백.
 * (원본 engine.ts L807-812 미러)
 */
export function modelDisplay(id: unknown): string {
  const s = typeof id === 'string' ? id : ''
  const m = /claude-(fable|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?\b/i.exec(s)
  if (!m) return s || '다른 모델'
  return m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + ' ' + m[2] + (m[3] ? '.' + m[3] : '')
}

/**
 * stop_details.category 코드 → 한국어 라벨.
 * 모르는 값은 코드 그대로(open string).
 * (원본 engine.ts L814-816 미러)
 */
export const REFUSAL_CATEGORY_LABEL: Record<string, string> = {
  cyber: '사이버 보안',
  bio: '생물학',
}

/**
 * 폴백 경고 배너 텍스트 생성.
 * from/to/category → 한국어 문구.
 * (원본 engine.ts L818-823 미러)
 */
export function fallbackNotice(from: unknown, to: unknown, category: unknown): string {
  const f = modelDisplay(from)
  const t = modelDisplay(to)
  const c = typeof category === 'string' && category
    ? ` (감지 분류: ${REFUSAL_CATEGORY_LABEL[category] ?? category})`
    : ''
  return `${f}의 안전 정책이 이 요청에 대한 응답을 거부해 ${t} 모델로 자동 전환했어요${c}. 이후 대화도 ${t} 모델로 진행됩니다.`
}
