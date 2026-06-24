/**
 * FullscreenOverlay.tsx — 공통 풀스크린 블러 오버레이 셸 (Phase 37 #4b).
 *
 * SubAgentModal(sa-overlay/blur) 패턴 차용(폐기 X).
 * - blur 배경 오버레이 (fs-overlay)
 * - Esc 닫기 + 바깥클릭(mouseDown) 닫기
 * - 내부 클릭은 stopPropagation → 오버레이 닫기 미발화
 * - title(선택) → 헤더에 표시
 * - children → 패널 본문
 *
 * UI_GUIDE 준수:
 *   - glass morphism/그라데이션/네온 금지
 *   - 색상 CSS 변수 토큰만 (인라인 색상 0)
 *
 * CRITICAL: renderer untrusted — window.api/fs/Node 직접 0.
 * 순수 표시 컴포넌트(상태: 로컬 open만 없음 — 부모가 open 제어).
 */
import { useEffect, type JSX, type ReactNode } from 'react'
import { IconClose } from './icons'
import './FullscreenOverlay.css'

export interface FullscreenOverlayProps {
  /** 오버레이 닫기 콜백 (Esc/바깥클릭 시 호출) */
  onClose: () => void
  /** 패널 제목 (선택) */
  title?: string
  /** 패널 본문 */
  children: ReactNode
}

/**
 * FullscreenOverlay — 블러 배경 풀스크린 오버레이 셸.
 *
 * P-4(설계): #4b OrchestrationCard 풀스크린에서 공통 추출 →
 * #3 서브에이전트 풀스크린이 재사용할 예정.
 */
export function FullscreenOverlay({ onClose, title, children }: FullscreenOverlayProps): JSX.Element {
  // Esc 키 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
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
        {/* 헤더 */}
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
        {/* 본문 */}
        <div className="fs-body">
          {children}
        </div>
      </div>
    </div>
  )
}

export default FullscreenOverlay
