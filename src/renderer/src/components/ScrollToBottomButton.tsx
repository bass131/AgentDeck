/**
 * ScrollToBottomButton.tsx — "맨 아래로(최신 답변)" 플로팅 버튼.
 *
 * - show=false → null (미렌더)
 * - show=true → .scroll-to-bottom pill 버튼 (우측 하단 fixed-in-parent)
 * - 아이콘: IconChevDown (기존 아이콘셋 재활용)
 * - 안티슬롭: 은은한 pill, 색은 CSS 변수 토큰만, 글로우/그라데이션 0
 * - 접근성: aria-label, type="button"
 */
import type { JSX } from 'react'
import { IconChevDown } from './icons'
import './ScrollToBottomButton.css'

export interface ScrollToBottomButtonProps {
  show: boolean
  onClick: () => void
}

export function ScrollToBottomButton({ show, onClick }: ScrollToBottomButtonProps): JSX.Element | null {
  if (!show) return null
  return (
    <button
      type="button"
      className="scroll-to-bottom"
      aria-label="최신 답변으로 이동"
      onClick={onClick}
    >
      <IconChevDown size={16} />
    </button>
  )
}

export default ScrollToBottomButton
