/**
 * composerHeight.ts — Composer textarea 자동 높이 계산 순수 함수.
 * renderer untrusted — 부수효과 0, 순수 계산만.
 */

export interface ComposerHeightResult {
  /** 적용할 height (px) */
  height: number
  /** 적용할 overflow-y 값 */
  overflow: 'hidden' | 'auto'
}

/**
 * textarea scrollHeight 기반 높이 계산.
 *
 * @param scrollHeight - textarea.scrollHeight (내용 기준 전체 높이)
 * @param lineHeight   - CSS line-height (px) — 실제 line-height 계산값
 * @param paddingY     - 상하 padding 합계 (px) — paddingTop + paddingBottom
 * @param maxLines     - 최대 줄 수 (기본 3)
 * @returns height + overflow 쌍
 *
 * 동작:
 * - min: 1줄 높이 (lineHeight + paddingY)
 * - max: maxLines줄 높이 (lineHeight * maxLines + paddingY)
 * - scrollHeight < min → min 반환 (overflow:hidden)
 * - scrollHeight <= max → scrollHeight 반환 (overflow:hidden)
 * - scrollHeight > max → max 반환 (overflow:auto)
 */
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
