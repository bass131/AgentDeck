/**
 * orchestrationKeyword.ts — UltraCode 키워드 턴 트리거 감지 (UC1 Phase 04, ADR-032 §2).
 *
 * 메시지 본문에 "ultracode"(대소문자 무관, 단어 경계) 또는 "/workflows"(문두/공백 뒤 리터럴,
 * "//workflows"·"a/workflows" 오탐 제외)가 있으면 그 턴은 토글 상태와 무관하게
 * orchestration=true로 전송된다 — 토글(지속 opt-in) OR 키워드(턴 단위 opt-in).
 *
 * 순수 함수 — DOM/store 미참조, 부수효과 없음. 표시 원문·엔진 전달문은 불변(호출부가
 * 플래그만 세움 — 이 함수는 메시지를 가공하지 않는다).
 */

// "ultracode": 대소문자 무관 + 단어 경계. \b는 [A-Za-z0-9_] 기준이라 "ultracoded"(뒤에
// 문자 이어짐)·"multracode"(앞에 문자 붙음— "m" 다음이 바로 "ultracode" 부분문자열이라
// \b 없이는 오탐)를 자연히 배제한다.
const ULTRACODE_RE = /\bultracode\b/i

// "/workflows": 문두(^) 또는 공백(\s) 바로 뒤 + 단어 경계. "//workflows"(슬래시 앞 문자가
// "/" — 공백/문두 아님)·"a/workflows"(슬래시 앞이 단어문자)를 배제하고, 코드펜스 안이라도
// 개행 뒤에 오면 감지한다(마크다운 파싱은 하지 않는 단순 규칙 — 과설계 금지).
// 의도적으로 대소문자 구분(i 플래그 없음) — 슬래시 커맨드는 소문자 리터럴이 관례.
const WORKFLOWS_RE = /(^|\s)\/workflows\b/

/** 텍스트에 UltraCode 트리거 키워드가 있으면 true (순수 함수, 부수효과 없음). */
export function detectOrchestrationKeyword(text: string): boolean {
  if (!text) return false
  return ULTRACODE_RE.test(text) || WORKFLOWS_RE.test(text)
}
