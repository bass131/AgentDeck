/**
 * Modal.tsx — 재사용 모달 크롬 (F5-01).
 *
 * 중앙 카드 + backdrop blur 오버레이 + 헤더(title + close). Esc/오버레이 클릭 닫기.
 * 카드 내부 클릭은 닫지 않음(stopPropagation).
 *
 * 인라인 색상 0. 벡터 아이콘(이모지 0).
 */
import { useEffect, type ReactNode, type JSX } from 'react'
import { IconX } from './icons'
import './Modal.css'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
}

export function Modal({ title, onClose, children }: ModalProps): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <button type="button" className="modal-close" aria-label="닫기" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export default Modal
