import { memo, type JSX } from 'react'
import './TitleBar.css'

interface TitleBarProps {
  title: string
  maximized: boolean
}

const DRAG_THRESHOLD = 4

function isControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('.tb-btn'))
}

function TitleBarInner({ title, maximized }: TitleBarProps): JSX.Element {
  const onBarMouseDown = (e: React.MouseEvent): void => {
    if (e.button !== 0 || isControl(e.target)) return
    const startX = e.clientX
    const startY = e.clientY
    let dragging = false
    const onMove = (m: MouseEvent): void => {
      if (
        !dragging &&
        (Math.abs(m.clientX - startX) > DRAG_THRESHOLD ||
          Math.abs(m.clientY - startY) > DRAG_THRESHOLD)
      ) {
        dragging = true
        void window.api.windowDragStart()
      }
    }
    const onUp = (): void => {
      if (dragging) void window.api.windowDragEnd()
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const onDoubleClick = (e: React.MouseEvent): void => {
    if (isControl(e.target)) return
    void window.api.windowMaximizeToggle()
  }

  return (
    <header
      className="titlebar"
      role="banner"
      onMouseDown={onBarMouseDown}
      onDoubleClick={onDoubleClick}
    >
      <span className="tb-title">{title}</span>
      <span className="tb-spacer" />
      <div className="tb-controls">
        <button
          type="button"
          className="tb-btn"
          aria-label="최소화"
          onClick={() => void window.api.windowMinimize()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          type="button"
          className="tb-btn"
          aria-label={maximized ? '이전 크기로' : '최대화'}
          onClick={() => void window.api.windowMaximizeToggle()}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="1" y="2.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
              <path d="M3 2.5 V1 H9 V7 H7.5" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="tb-btn tb-btn--close"
          aria-label="닫기"
          onClick={() => void window.api.windowClose()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1" />
            <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </header>
  )
}

export const TitleBar = memo(TitleBarInner)
export default TitleBar
