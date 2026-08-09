import type { JSX } from 'react'
import { IconChevDown } from '../../components/common/icons'
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
