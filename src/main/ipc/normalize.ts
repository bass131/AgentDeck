/**
 * normalize.ts — IPC 핸들러 입력 정규화 순수 함수 (Phase 30 M2)
 *
 * 신뢰경계: renderer 입력은 untrusted.
 *   - string-only 게이트: 비-string → undefined.
 *   - 빈문자열·공백만 → undefined.
 *   - 길이 > cap → slice(0, cap) 절단 (trim 후 기준, S1).
 *   - 로그에 내용 미출력 — 호출부에서도 log 금지.
 *
 * 정규화 순서 (S1): typeof === 'string' → trim → 빈 체크 → cap.
 *
 * ADR-003: SDK 고유 형상(preset/append)은 어댑터 내부에만.
 * 이 함수는 string 정규화만 — SDK 형상 변환 0.
 */

/**
 * systemPrompt 최대 길이 상수 (코드 유닛 기준).
 *
 * 근거: 모델 컨텍스트 append 용도 — 16000자는 일반 지침 프롬프트의 상한으로 충분.
 * lone surrogate는 append가 모델 컨텍스트라 무해 (B2 결정).
 * 변경 시 IPC 계약 doc 주석·테스트 동반.
 */
export const MAX_SYSTEM_PROMPT_LEN = 16000

/**
 * systemPrompt 정규화.
 *
 * 정규화 순서: typeof === 'string' → trim → 빈 체크 → cap.
 * 반환 undefined: 비-string / 빈문자열 / 공백만.
 * 반환 string: trim 후 cap 이내 string.
 *
 * CRITICAL(신뢰경계): 로그에 내용 미출력(호출부 책임).
 *
 * @param raw renderer untrusted 입력
 * @returns 정규화된 string, 또는 무효 시 undefined
 */
export function normalizeSystemPrompt(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  if (trimmed.length > MAX_SYSTEM_PROMPT_LEN) {
    return trimmed.slice(0, MAX_SYSTEM_PROMPT_LEN)
  }
  return trimmed
}
