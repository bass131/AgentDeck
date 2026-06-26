/**
 * TitleBar.tsx — 커스텀 타이틀바 (F1-b 셸 크롬).
 *
 * 투명 frameless 창은 OS 타이틀바가 없다 → 직접 그린다.
 *   - 드래그: 바 영역 mousedown → 임계값 초과 시 window.api.windowDragStart()
 *     (`-webkit-app-region:drag` 미사용 — 클릭/더블클릭을 삼키므로). 커서 추종은 main.
 *   - 더블클릭: 최대화 토글.
 *   - 컨트롤: 최소화 / 최대화(복원) / 닫기 — 벡터 아이콘(이모지 금지).
 *
 * CRITICAL: renderer untrusted — 윈도우 조작은 preload window.api 경유만.
 * 인라인 색상 0 — CSS 토큰.
 */
import { memo, type JSX } from 'react'
import './TitleBar.css'

interface TitleBarProps {
  /** 표시할 워크스페이스/앱 이름 */
  title: string
  /** 현재 최대화 상태 (복원 아이콘/레이블 전환) */
  maximized: boolean
}

// 클릭과 드래그 구분 임계값(px) — 이 미만 이동은 클릭으로 취급(드래그 안 함).
const DRAG_THRESHOLD = 4

function isControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('.tb-btn'))
}

function TitleBarInner({ title, maximized }: TitleBarProps): JSX.Element {
  // 바 mousedown → 임계값 넘으면 드래그 시작(이후 커서 추종은 main).
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
