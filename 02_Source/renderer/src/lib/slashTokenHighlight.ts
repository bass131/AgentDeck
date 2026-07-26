/**
 * slashTokenHighlight.ts — FB2 Phase 06: 컴포저 슬래시 커맨드(`/xxx`) 토큰 하이라이트.
 *
 * UC1 P05가 확립한 "컴포저 키워드 하이라이트" 미러 오버레이 메커니즘
 * (useComposerKeywordMirror.ts)을 오케스트레이션 키워드("ultracode"/"/workflows") 외의
 * 일반 슬래시 커맨드(`/work-run`, `/session:end` 등)까지 확장하기 위한 순수 세그먼트
 * 분해 함수. orchestrationKeyword.ts(ADR-032 단일 진실원)는 건드리지 않는다 — 완전히
 * 독립된 패턴(BOUNDARY_SLASH_RE/SLASH_BODY_RE)이고, 두 결과의 병합은
 * composerHighlight.ts가 맡는다.
 *
 * 토큰 규칙(오탐 방지, FB2 P06 지시 — 아래 두 정규식 리터럴이 이 규칙의 단일 진실원):
 *   1. 행 시작(^) 또는 공백(\s) 바로 뒤에 오는 "/"만 후보 — URL의 "https://"나 경로
 *      중간의 "a/workflows" 같은 위치는 직전 문자가 공백/문두가 아니라 자연히 배제된다.
 *   2. 토큰 본체 = "/" + [A-Za-z0-9_-]+ 를 ':'로 이어붙인 네임스페이스까지
 *      ( ":" + [A-Za-z0-9_-]+ )* 매치 — FB2 P04가 활성화한 콜론 네임스페이스
 *      (`/session:end`, `/work:plan`)까지 포함한다. 문자셋에 "/"가 없어 유닉스 다중
 *      세그먼트 경로(`/c/Dev/AgentDeck`)는 첫 세그먼트("c")에서 소비가 멈춘다.
 *   3. 소비가 멈춘 직후 문자가 다시 "/"면, 방금 멈춘 소비는 사실 경로의 첫 세그먼트였을
 *      뿐이므로 매치 전체를 버린다("/c/Dev/AgentDeck" 배제의 핵심).
 *   4. Windows 드라이브 경로("C:/Dev/...")는 애초에 "/"로 시작하지 않아 후보조차 되지
 *      않는다 — 별도 예외처리가 필요 없다.
 *
 * 구현 메모(2-패스 스캔인 이유): 위 세 규칙을 "본체 + 부정 전방탐색"을 한 정규식에 합치면
 * (`\/[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*(?!\/)`) 정규식 백트래킹이 문제를 일으킨다 —
 * "/etc/passwd"에서 최대 소비("etc")가 전방탐색에 걸리면 엔진이 본체 `+`를 한 글자씩
 * 줄여 재시도하다 "et" 다음 문자가 "c"(슬래시 아님)인 지점에서 거짓으로 통과해버려
 * "/et"만 하이라이트되는 오탐이 발생한다(실측: 이 파일 최초 구현에서 테스트로 잡힘).
 * 따라서 (a) 경계+슬래시 위치를 먼저 찾고 (b) 그 지점부터 앵커된 `^[...]+(?::[...]+)*`로
 * *유일하게 결정되는* 최대 본체를 구한 뒤 (c) 그 직후 문자가 "/"인지 별도로 문자열
 * 인덱싱으로 확인한다 — 백트래킹 여지가 없는 순서로 규칙 3을 적용한다.
 *
 * 순수 함수 — DOM/store 미참조, 부수효과 0.
 */

/** 규칙 1: 행 시작 또는 공백 바로 뒤의 "/" 위치만 후보로 스캔. */
const BOUNDARY_SLASH_RE = /(^|\s)\//g
/** 규칙 2: 슬래시 다음 토큰 본체(콜론 네임스페이스 포함) — 후보 위치에 앵커해서만 사용. */
const SLASH_BODY_RE = /^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*/

/** 텍스트 세그먼트 — 미러 오버레이가 그대로 span으로 렌더링한다. */
export interface SlashTokenSegment {
  text: string
  /** true면 슬래시 커맨드 토큰 구간 — 하이라이트 대상. */
  highlight: boolean
}

export interface SlashTokenSpan {
  start: number
  end: number
}

/**
 * 슬래시 커맨드 토큰의 [start,end) 스팬만 수집한다(경계 문자·전방탐색은 이미 소비/검증
 * 완료 — 반환 스팬은 실제 하이라이트 대상 구간만). composerHighlight.ts가 오케스트레이션
 * 스팬과 병합할 때 재사용.
 */
export function collectSlashCommandSpans(text: string): SlashTokenSpan[] {
  if (!text) return []
  const boundaryRe = new RegExp(BOUNDARY_SLASH_RE.source, BOUNDARY_SLASH_RE.flags)
  const spans: SlashTokenSpan[] = []
  let m: RegExpExecArray | null
  while ((m = boundaryRe.exec(text)) !== null) {
    const boundaryLen = m[1]?.length ?? 0
    const start = m.index + boundaryLen // '/' 문자 자신의 인덱스

    const bodyMatch = text.slice(start + 1).match(SLASH_BODY_RE)
    if (!bodyMatch) continue // "//..."처럼 슬래시 바로 뒤에 유효 본체 문자가 없음

    const end = start + 1 + bodyMatch[0].length
    if (text[end] === '/') continue // 규칙 3: 직후 문자가 또 "/" → 경로의 첫 세그먼트였을 뿐

    spans.push({ start, end })
  }
  return spans
}

/**
 * 텍스트를 [일반|하이라이트] 세그먼트 배열로 분해한다 — segmentOrchestrationKeywords와
 * 동일 계약(세그먼트 text를 모두 이어붙이면 원문과 정확히 일치, 순수함수).
 */
export function segmentSlashTokens(text: string): SlashTokenSegment[] {
  if (!text) return []

  const spans = collectSlashCommandSpans(text)
  const segments: SlashTokenSegment[] = []
  let cursor = 0
  for (const { start, end } of spans) {
    if (start < cursor) continue // 방어적 스킵(이 패턴은 서로 겹치는 스팬을 만들지 않음)
    if (start > cursor) segments.push({ text: text.slice(cursor, start), highlight: false })
    segments.push({ text: text.slice(start, end), highlight: true })
    cursor = end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), highlight: false })

  return segments
}
