const BOUNDARY_SLASH_RE = /(^|\s)\//g
const SLASH_BODY_RE = /^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*/

export interface SlashTokenSegment {
  text: string
  highlight: boolean
}

export interface SlashTokenSpan {
  start: number
  end: number
}

export function collectSlashCommandSpans(text: string): SlashTokenSpan[] {
  if (!text) return []
  const boundaryRe = new RegExp(BOUNDARY_SLASH_RE.source, BOUNDARY_SLASH_RE.flags)
  const spans: SlashTokenSpan[] = []
  let m: RegExpExecArray | null
  while ((m = boundaryRe.exec(text)) !== null) {
    const boundaryLen = m[1]?.length ?? 0
    const start = m.index + boundaryLen

    const bodyMatch = text.slice(start + 1).match(SLASH_BODY_RE)
    if (!bodyMatch) continue

    const end = start + 1 + bodyMatch[0].length
    if (text[end] === '/') continue

    spans.push({ start, end })
  }
  return spans
}

export function segmentSlashTokens(text: string): SlashTokenSegment[] {
  if (!text) return []

  const spans = collectSlashCommandSpans(text)
  const segments: SlashTokenSegment[] = []
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
