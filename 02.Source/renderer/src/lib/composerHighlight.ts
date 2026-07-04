/**
 * composerHighlight.ts — FB2 Phase 06: 컴포저 하이라이트 통합 세그먼트 분해.
 *
 * UC1 P05/P07이 확립한 오케스트레이션 키워드 하이라이트(orchestrationKeyword.ts,
 * ADR-032 단일 진실원 — 절대 수정하지 않는다)와 이번 Phase가 추가한 일반 슬래시 커맨드
 * 토큰 하이라이트(slashTokenHighlight.ts)를 한 번의 선형 스캔 결과로 병합해
 * useComposerKeywordMirror.ts가 렌더에 바로 쓸 수 있는 단일 세그먼트 배열을 만든다.
 *
 * 병합 규칙: "/workflows"는 두 규칙(오케스트레이션·슬래시) 모두에 걸리는 유일한 실제
 * 케이스다 — 이미 ultracode 브랜드 그라데이션으로 특별 취급되는 키워드이므로 orchestration
 * 스팬이 항상 우선한다(동일/중첩 구간은 슬래시 쪽을 버림). 겹치지 않는 일반 경우는 시작
 * 위치 순서대로 그대로 배치.
 *
 * 순수 함수 — DOM/store 미참조, 부수효과 0. 세그먼트 text를 모두 이어붙이면 원문과
 * 정확히 일치(불변식, 두 하위 모듈과 동일 계약).
 */
import { segmentOrchestrationKeywords } from './orchestrationKeyword'
import { segmentSlashTokens } from './slashTokenHighlight'

export type ComposerHighlightKind = 'none' | 'orchestration' | 'slash'

/** 통합 세그먼트 — 미러 오버레이가 kind별로 다른 CSS 클래스를 골라 렌더링한다. */
export interface ComposerHighlightSegment {
  text: string
  kind: ComposerHighlightKind
}

interface Span {
  start: number
  end: number
}

/** [일반|하이라이트] 세그먼트 배열(각 하위 모듈의 출력)을 [start,end) 스팬으로 역산한다. */
function spansFromBooleanSegments(segments: { text: string; highlight: boolean }[]): Span[] {
  const spans: Span[] = []
  let cursor = 0
  for (const seg of segments) {
    if (seg.highlight) spans.push({ start: cursor, end: cursor + seg.text.length })
    cursor += seg.text.length
  }
  return spans
}

/**
 * 오케스트레이션 키워드 + 슬래시 커맨드 토큰을 병합해 [일반|orchestration|slash] 세그먼트
 * 배열로 분해한다. 두 스팬이 겹치면(=`/workflows`) orchestration이 우선 — 정렬 시
 * 타이브레이크로 orchestration을 먼저 배치하고, 이미 소비된 구간과 겹치는 슬래시 스팬은
 * 건너뛴다.
 */
export function segmentComposerHighlights(text: string): ComposerHighlightSegment[] {
  if (!text) return []

  const orchestrationSpans = spansFromBooleanSegments(segmentOrchestrationKeywords(text))
  const slashSpans = spansFromBooleanSegments(segmentSlashTokens(text))

  const typed: (Span & { kind: 'orchestration' | 'slash' })[] = [
    ...orchestrationSpans.map((s) => ({ ...s, kind: 'orchestration' as const })),
    ...slashSpans.map((s) => ({ ...s, kind: 'slash' as const })),
  ].sort((a, b) => a.start - b.start || (a.kind === 'orchestration' ? -1 : 1))

  const segments: ComposerHighlightSegment[] = []
  let cursor = 0
  for (const span of typed) {
    if (span.start < cursor) continue // orchestration이 이미 소비한 구간(=/workflows 중복) → 슬래시 스킵
    if (span.start > cursor) segments.push({ text: text.slice(cursor, span.start), kind: 'none' })
    segments.push({ text: text.slice(span.start, span.end), kind: span.kind })
    cursor = span.end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), kind: 'none' })

  return segments
}
