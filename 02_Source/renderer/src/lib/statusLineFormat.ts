export function formatElapsedLabel(seconds: number | null): string | null {
  if (seconds === null) return null
  return `${seconds}s`
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
  return `${Math.max(0, Math.trunc(tokens))}`
}

export function formatTokenSegment(tokens: number | undefined): string | null {
  if (tokens === undefined) return null
  return `↑ ${formatTokenCount(tokens)} tokens`
}

export function buildStatusMeta(elapsedSeconds: number | null, tokens: number | undefined): string | null {
  const parts = [formatElapsedLabel(elapsedSeconds), formatTokenSegment(tokens)].filter(
    (p): p is string => p !== null,
  )
  if (parts.length === 0) return null
  return `(${parts.join(' · ')})`
}

const TRAILING_ELLIPSIS_RE = /(?:\.{2,}|…)+$/

export function formatPhraseLabel(label: string): string {
  return `${label.replace(TRAILING_ELLIPSIS_RE, '')}…`
}
