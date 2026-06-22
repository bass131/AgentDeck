/**
 * Sidebar.tsx — 좌측 사이드바 (F1-b Phase 04, 스텁).
 *
 * 원본 4컬럼의 ① 컬럼(채팅 세션 목록). 골격 단계라 채팅 세션 전환 로직은
 * 없고(=M4), 브랜딩 + "새 대화"(비동작 스텁) + "최근 채팅" placeholder + 접힘만.
 *
 * 인라인 색상 0 — CSS 토큰.
 */
import { memo, type JSX } from 'react'
import './Sidebar.css'

interface SidebarProps {
  /** rail로 접기 */
  onCollapse: () => void
}

function SidebarInner({ onCollapse }: SidebarProps): JSX.Element {
  return (
    <aside className="sidebar">
      <div className="sb-top">
        <span className="sb-brand">AgentDeck</span>
        <button
          type="button"
          className="sb-collapse"
          aria-label="사이드바 접기"
          onClick={onCollapse}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M9 3 L5 7 L9 11" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      </div>

      <button type="button" className="sb-new" disabled aria-label="새 대화 (준비 중)">
        + 새 대화
      </button>

      <div className="sb-label">최근 채팅</div>
      <div className="sb-list">
        {/* M4: 채팅 세션 목록 — 골격 단계 placeholder */}
        <p className="sb-empty">대화 기록이 여기에 표시됩니다</p>
      </div>
    </aside>
  )
}

export const Sidebar = memo(SidebarInner)
export default Sidebar
