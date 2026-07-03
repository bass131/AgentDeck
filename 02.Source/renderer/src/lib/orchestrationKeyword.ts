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

// ── UC1 Phase 05: 컴포저 키워드 하이라이트용 세그먼트 분해 ──────────────────
//
// 하이라이트 위치 계산은 위 ULTRACODE_RE/WORKFLOWS_RE와 단일 진실원이어야 한다(Phase 05
// 지시) — 정규식 리터럴을 여기서 다시 쓰지 않고, 위 두 상수의 `.source`/`.flags`에서
// global 클론을 만들어 재사용한다(패턴 중복 정의 0).

/** 텍스트 세그먼트 — 미러 오버레이가 그대로 span으로 렌더링한다. */
export interface OrchestrationSegment {
  text: string
  /** true면 UltraCode 트리거 키워드 구간 — 그라데이션 하이라이트 대상. */
  highlight: boolean
}

interface KeywordSpan {
  start: number
  end: number
}

/**
 * re의 패턴/플래그를 그대로 재사용해 global 매치 전용 클론을 만든다(중복 정의 없이
 * matchAll 가능하게). boundaryGroup이 주어지면 그 캡처 그룹(예: WORKFLOWS_RE의 선행
 * 공백/문두)만큼 시작 offset을 밀어 실제 키워드 구간만 반환한다.
 */
function collectKeywordSpans(re: RegExp, text: string, boundaryGroup: number | null): KeywordSpan[] {
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g'
  const global = new RegExp(re.source, flags)
  const spans: KeywordSpan[] = []
  let m: RegExpExecArray | null
  while ((m = global.exec(text)) !== null) {
    const boundaryLen = boundaryGroup !== null ? (m[boundaryGroup]?.length ?? 0) : 0
    spans.push({ start: m.index + boundaryLen, end: m.index + m[0].length })
    // 방어적 무한루프 가드(이 두 패턴은 항상 1글자 이상 소비해 실전에서는 발동 안 함).
    if (global.lastIndex === m.index) global.lastIndex += 1
  }
  return spans
}

/**
 * 텍스트를 [일반|하이라이트] 세그먼트 배열로 분해한다(컴포저 미러 오버레이 렌더용).
 * detectOrchestrationKeyword와 동일 규칙(같은 정규식 소스) — 표시 전용, 원문은 불변
 * (세그먼트의 text를 모두 이어붙이면 원문과 정확히 일치한다).
 *
 * O(n) 정규식 2패스(키워드별 1패스) + 매치 수만큼 병합 — 컴포저 입력 길이 규모에서
 * 단일 결합 정규식 대비 실익 없는 과설계(케이스별 대소문자 플래그 분기)를 피한 실용적 선택.
 */
export function segmentOrchestrationKeywords(text: string): OrchestrationSegment[] {
  if (!text) return []

  const spans = [
    ...collectKeywordSpans(ULTRACODE_RE, text, null),
    ...collectKeywordSpans(WORKFLOWS_RE, text, 1),
  ].sort((a, b) => a.start - b.start)

  const segments: OrchestrationSegment[] = []
  let cursor = 0
  for (const { start, end } of spans) {
    if (start < cursor) continue // 이론상 겹칠 일 없음(서로 다른 리터럴) — 방어적 스킵
    if (start > cursor) segments.push({ text: text.slice(cursor, start), highlight: false })
    segments.push({ text: text.slice(start, end), highlight: true })
    cursor = end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), highlight: false })

  return segments
}
