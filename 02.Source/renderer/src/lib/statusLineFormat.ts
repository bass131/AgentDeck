/**
 * statusLineFormat.ts — 한 줄 상태 라인(status line) 표시 문자열 순수 포맷터 (TG1 P04).
 *
 * 배경(01.Phases/18_TG1-thinking-gui/04-status-line.md): 흩어진 사고 신호(경과 초·토큰)를
 * "✻ 궁리하는 중… (12s · ↑ 3.4k tokens)" 한 줄로 통합한다. 이 파일은 그 괄호 세그먼트의
 * 표시 문자열만 계산한다 — 데이터 원천(경과 초=store/thinkingElapsed.ts
 * computeThinkingElapsedSeconds, 토큰=thread 마지막 thinking 아이템의 estimatedTokens)은
 * 이미 있는 자산을 그대로 쓴다(새 집계 파이프라인 0 — 이중 집계 금지).
 *
 * CRITICAL: 순수 함수 — Date.now()/타이머/window.api 호출 0. 렌더(StatusLine.tsx)는 이
 * 결과 문자열만 그대로 표시한다(단방향 흐름: 값 계산은 여기, 그리기는 컴포넌트).
 */

/**
 * formatElapsedLabel — 경과 초(computeThinkingElapsedSeconds 결과) → "12s" 표시 문자열.
 * null(현재 열린 사고 블록 없음, 판정 불가) → null(호출부는 세그먼트 자체를 그리지 않는다).
 * 0은 유효한 값(방금 시작) — "0s"로 그대로 표시(미표시 아님).
 */
export function formatElapsedLabel(seconds: number | null): string | null {
  if (seconds === null) return null
  return `${seconds}s`
}

/**
 * formatTokenCount — 토큰 수 → 축약 표기.
 * 1000 미만은 축약 없이 정수 그대로(예: 340 → "340"). 1000 이상은 1000으로 나눠 소수점
 * 1자리 + 'k' 접미(예: 3400 → "3.4k", 1000 → "1.0k").
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
  return `${Math.max(0, Math.trunc(tokens))}`
}

/**
 * formatTokenSegment — estimatedTokens(런닝 토탈, undefined=아직 신호 없음) → "↑ 3.4k tokens"
 * 표시 세그먼트. undefined → null(호출부는 세그먼트 자체를 그리지 않는다).
 */
export function formatTokenSegment(tokens: number | undefined): string | null {
  if (tokens === undefined) return null
  return `↑ ${formatTokenCount(tokens)} tokens`
}

/**
 * buildStatusMeta — 경과 초 세그먼트 + 토큰 세그먼트를 "(12s · ↑ 3.4k tokens)" 형태로 합성.
 * 둘 다 없으면 괄호 자체를 null로 반환(호출부는 메타 그룹 전체를 미표시). 하나만 있으면
 * 그 세그먼트만 괄호로 감싼다.
 */
export function buildStatusMeta(elapsedSeconds: number | null, tokens: number | undefined): string | null {
  const parts = [formatElapsedLabel(elapsedSeconds), formatTokenSegment(tokens)].filter(
    (p): p is string => p !== null,
  )
  if (parts.length === 0) return null
  return `(${parts.join(' · ')})`
}
