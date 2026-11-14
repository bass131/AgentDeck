import { segmentOrchestrationKeywords } from './orchestrationKeyword'
import { segmentSlashTokens } from './slashTokenHighlight'

export type ComposerHighlightKind = 'none' | 'orchestration' | 'slash'

export interface ComposerHighlightSegment {
  text: string
  kind: ComposerHighlightKind
}

interface Span {
  start: number
  end: number
}

function spansFromBooleanSegments(segments: { text: string; highlight: boolean }[]): Span[] {
  const spans: Span[] = []
  let cursor = 0
  for (const seg of segments) {
    if (seg.highlight) spans.push({ start: cursor, end: cursor + seg.text.length })
    cursor += seg.text.length
  }
  return spans
}

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
    if (span.start < cursor) continue
    if (span.start > cursor) segments.push({ text: text.slice(cursor, span.start), kind: 'none' })
    segments.push({ text: text.slice(span.start, span.end), kind: span.kind })
    cursor = span.end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), kind: 'none' })

  return segments
}
