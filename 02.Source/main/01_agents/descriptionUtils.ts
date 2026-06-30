/**
 * descriptionUtils.ts — description 문자열 정규화 (순수 말단 모듈, RF1-followup P02)
 *
 * 단일 진실(DRY): ClaudeAgentRun(ClaudeCodeBackend.ts)·RunEventNormalizer(eventNormalizer.ts)
 * 두 곳에 중복돼 있던 static `_sanitizeDescription`을 의존 없는 순수 함수로 추출했다.
 *
 * 의존 0(import 없음) — 말단 모듈. 두 어댑터 파일이 이 모듈을 import하므로,
 * 이 모듈이 역으로 그들을 import하면 순환이 생긴다. 그래서 의존 없는 말단에 둔다.
 *
 * electron import 0 — vitest 직접 실행 가능.
 *
 * (원본 engine.ts _sanitizeDescription 미러)
 */

/**
 * description 문자열을 신뢰경계 규격으로 정규화한다.
 *
 * 1. 개행 문자(\r\n, \r, \n) → 공백으로 치환 + trim(oneLine 처리).
 * 2. 200자 cap: 초과 시 199자 + '…'(줄임표)로 자른다.
 *
 * 신뢰경계(ADR-019): description은 SDK 제공값(로컬 사용자 파일 유래).
 * 길이 제한·개행 제거로 출력 경계를 통제한다.
 */
export function sanitizeDescription(s: string): string {
  // 개행 제거: \r\n, \r, \n → 공백
  const oneLine = s.replace(/\r\n|\r|\n/g, ' ').trim()
  const MAX = 200
  if (oneLine.length <= MAX) return oneLine
  // 200자 초과 → 199자 + '…'
  return oneLine.slice(0, MAX - 1) + '…'
}
