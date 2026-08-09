import { useEffect, type JSX, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconClose } from './icons'
import './FullscreenOverlay.css'

export interface FullscreenOverlayProps {
  onClose: () => void
  title?: string
  children: ReactNode
}

export function FullscreenOverlay({ onClose, title, children }: FullscreenOverlayProps): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fs-overlay"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? '상세 보기'}
    >
      <div
        className="fs-panel"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="fs-head">
          {title && <span className="fs-title">{title}</span>}
          <button
            type="button"
            className="fs-close"
            onClick={onClose}
            aria-label="닫기"
          >
            <IconClose size={18} />
          </button>
        </div>
        <div className="fs-body">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default FullscreenOverlay
