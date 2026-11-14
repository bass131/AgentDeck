const ULTRACODE_RE = /\bultracode\b/i

const WORKFLOWS_RE = /(^|\s)\/workflows\b/

export function detectOrchestrationKeyword(text: string): boolean {
  if (!text) return false
  return ULTRACODE_RE.test(text) || WORKFLOWS_RE.test(text)
}

export interface OrchestrationSegment {
  text: string
  highlight: boolean
}

interface KeywordSpan {
  start: number
  end: number
}

function collectKeywordSpans(re: RegExp, text: string, boundaryGroup: number | null): KeywordSpan[] {
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g'
  const global = new RegExp(re.source, flags)
  const spans: KeywordSpan[] = []
  let m: RegExpExecArray | null
  while ((m = global.exec(text)) !== null) {
    const boundaryLen = boundaryGroup !== null ? (m[boundaryGroup]?.length ?? 0) : 0
    spans.push({ start: m.index + boundaryLen, end: m.index + m[0].length })
    if (global.lastIndex === m.index) global.lastIndex += 1
  }
  return spans
}

export function segmentOrchestrationKeywords(text: string): OrchestrationSegment[] {
  if (!text) return []

  const spans = [
    ...collectKeywordSpans(ULTRACODE_RE, text, null),
    ...collectKeywordSpans(WORKFLOWS_RE, text, 1),
  ].sort((a, b) => a.start - b.start)

  const segments: OrchestrationSegment[] = []
  let cursor = 0
  for (const { start, end } of spans) {
    if (start < cursor) continue
    if (start > cursor) segments.push({ text: text.slice(cursor, start), highlight: false })
    segments.push({ text: text.slice(start, end), highlight: true })
    cursor = end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), highlight: false })

  return segments
}
