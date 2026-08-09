export function sanitizeDescription(s: string): string {
  if (typeof s !== 'string') return ''
  const oneLine = s.replace(/\r\n|\r|\n/g, ' ').trim()
  const MAX = 200
  if (oneLine.length <= MAX) return oneLine
  return oneLine.slice(0, MAX - 1) + '…'
}
