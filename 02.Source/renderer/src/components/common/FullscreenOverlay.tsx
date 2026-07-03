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
import { createPortal } from 'react-dom'
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

  // CSS 함정 우회 — position:fixed 오버레이를 document.body 직속으로 포털(portal).
  // 배경: fixed의 containing block은 조상에 transform/filter/backdrop-filter 등이
  // 있으면 뷰포트가 아니라 "그 조상"으로 바뀐다. 이 오버레이는 대화 thread 내부
  // OrchestrationCard/SubAgentFullscreen에서 렌더되는데, 확장 패널(.ma-expand-card)이
  // `animation: rise ... both`로 transform:translateY(0)을 영구 유지 → fixed가 그 카드
  // 박스에 갇혀 max-height:88vh 패널이 화면 밖으로 잘렸다. body 직속 포털로 옮기면
  // 어떤 변형된 조상과도 무관하게 뷰포트 기준으로 고정된다.
  // 선례: 03_viewer/SelectionAskBar.tsx (동일 backdrop-filter 함정 회피).
  // Esc/바깥클릭/stopPropagation 거동은 불변 — DOM 위치만 바뀐다.
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
    </div>,
    document.body
  )
}

export default FullscreenOverlay
