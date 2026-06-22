/**
 * Sidebar.tsx — 좌측 사이드바 (F2-03 시각 구조).
 *
 * 원본 4컬럼의 ① 컬럼(채팅 세션 목록). **세션 실데이터/전환/rename/delete·⌘N·
 * 우클릭 = M4** → 여기선 *시각 골격*만: 브랜딩 mark + 새채팅(비활성) + 검색(시각) +
 * 세션목록(빈 placeholder) + 프로필 풋(정적 placeholder, 동적 사용자 바인딩 0).
 *
 * 인라인 색상 0 — CSS 토큰. 벡터 아이콘(이모지 0).
 */
import { memo, useState, type JSX } from 'react'
import { useAppStore, selectWorkspaceRoot } from '../store/appStore'
import { IconSearch, IconPlus, IconChevRight } from './icons'
import './Sidebar.css'

interface SidebarProps {
  /** rail로 접기 */
  onCollapse: () => void
}

function SidebarInner({ onCollapse }: SidebarProps): JSX.Element {
  const workspaceRoot = useAppStore(selectWorkspaceRoot)
  const wsName = workspaceRoot ? workspaceRoot.split(/[\\/]/).pop() ?? 'AgentDeck' : 'AgentDeck'
  const mark = wsName.charAt(0).toUpperCase()

  // 검색은 시각 골격(M4 세션 검색 자리) — 로컬 상태, 필터 동작 없음.
  const [query, setQuery] = useState('')

  return (
    <aside className="sidebar">
      <div className="sb-top">
        <div className="sb-ws">
          <span className="sb-mark" aria-hidden="true">{mark}</span>
          <span className="sb-ws-text">
            <span className="sb-name" title={workspaceRoot ?? ''}>{wsName}</span>
            <span className="sb-sub">Claude Code</span>
          </span>
        </div>
        <button
          type="button"
          className="sb-collapse"
          aria-label="사이드바 접기"
          onClick={onCollapse}
        >
          <IconChevRight size={15} />
        </button>
      </div>

      <button type="button" className="sb-new" disabled aria-label="새 대화 (준비 중)">
        <IconPlus size={14} />
        <span className="sb-new-label">새 대화</span>
        <kbd className="sb-kbd">Ctrl N</kbd>
      </button>

      <div className="sb-search">
        <IconSearch size={13} className="sb-search-ic" />
        <input
          className="sb-search-input"
          type="text"
          placeholder="대화 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="대화 검색"
        />
      </div>

      <div className="sb-label">최근 채팅</div>
      <div className="sb-list">
        {/* M4: 채팅 세션 목록 — 골격 단계 빈 placeholder */}
        <p className="sb-empty">대화 기록이 여기에 표시됩니다</p>
      </div>

      {/* 프로필 풋 — 정적 placeholder(인증·동적 사용자 데이터 = 후속) */}
      <div className="sb-foot">
        <span className="sb-ava" aria-hidden="true">U</span>
        <span className="sb-who">사용자</span>
      </div>
    </aside>
  )
}

export const Sidebar = memo(SidebarInner)
export default Sidebar
