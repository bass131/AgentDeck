export interface ComposerHeightResult {
  height: number
  overflow: 'hidden' | 'auto'
}

export function computeComposerHeight(
  scrollHeight: number,
  lineHeight: number,
  paddingY: number,
  maxLines = 3
): ComposerHeightResult {
  const minH = lineHeight + paddingY
  const maxH = lineHeight * maxLines + paddingY

  if (scrollHeight <= minH) {
    return { height: minH, overflow: 'hidden' }
  }
  if (scrollHeight <= maxH) {
    return { height: scrollHeight, overflow: 'hidden' }
  }
  return { height: maxH, overflow: 'auto' }
}
