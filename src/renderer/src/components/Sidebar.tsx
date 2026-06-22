/**
 * Sidebar.tsx — 좌측 사이드바 (F8: 세션 목록 + 멀티 토글).
 *
 * F8 설계:
 *  - props 시그니처 유지: { onCollapse, onOpenSettings } — Shell.tsx 무변경.
 *  - 샘플 세션·유저·모드·검색·CRUD = 전부 내부 로컬 state (sidebarSampleData 직접 소비).
 *  - 새 IPC/window.api/store 세션 호출 0. 정적 샘플 + 로컬 state(시각 CRUD).
 *  - avatarColor 인라인 동적색 허용(사용자별 고유 색 → 토큰 부적합, 설계 예외, ADR-014 주석).
 *
 * 인라인 색상 0 (avatarColor 인라인 제외) — CSS 토큰.
 * 이모지 0 — 벡터 아이콘.
 */
import { memo, useState, useMemo, useEffect, type JSX } from 'react'
import { useAppStore, selectWorkspaceRoot } from '../store/appStore'
import {
  IconSearch,
  IconPlus,
  IconChevRight,
  IconSquare,
  IconGrid,
  IconMore,
  IconPencil,
  IconSpark,
  IconTrash,
} from './icons'
import {
  SAMPLE_SESSIONS,
  SAMPLE_USER,
  type SessionSummary,
  type SessionStatus,
} from '../lib/sidebarSampleData'
import './Sidebar.css'

// ── 타입 ─────────────────────────────────────────────────────────────────
type WorkspaceMode = 'single' | 'multi'

interface SidebarProps {
  /** rail로 접기 */
  onCollapse: () => void
  /** 설정 모달 열기 */
  onOpenSettings: () => void
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────
const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac')

function statusSub(status: SessionStatus): string {
  switch (status) {
    case 'running': return '진행 중'
    case 'done':    return '완료됨'
    case 'error':   return '오류'
    default:        return ''
  }
}

function dotClass(status: SessionStatus): string {
  if (status === 'done')    return 'dot done'
  if (status === 'running') return 'dot run'
  if (status === 'error')   return 'dot err'
  return 'dot'
}

// 컨텍스트 메뉴 최소 너비(좌표 클램프용)
const MENU_W = 178

// 메뉴 높이 추정: 프롬프트 항목 포함(단일모드) 127, 미포함(멀티모드) 92
function menuH(hasPrompt: boolean): number {
  return hasPrompt ? 127 : 92
}

// ── RecentChats ───────────────────────────────────────────────────────────
interface RecentChatsProps {
  sessions: SessionSummary[]
  activeId: string
  query: string
  mode: WorkspaceMode
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

function RecentChats({
  sessions,
  activeId,
  query,
  mode,
  onSelect,
  onRename,
  onDelete,
}: RecentChatsProps): JSX.Element {
  // 단일 모드에서만 프롬프트 설정 항목 노출
  const showPrompt = mode === 'single'

  // ctx-menu 상태 (id + 좌표)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  // 다이얼로그 상태
  const [dialog, setDialog] = useState<{
    kind: 'rename' | 'delete'
    id: string
    title: string
  } | null>(null)
  const [draft, setDraft] = useState('')

  // ctx-menu 외부 이벤트로 닫기 (capture 주의)
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  // 다이얼로그 Esc 닫기
  useEffect(() => {
    if (!dialog) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setDialog(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dialog])

  const openRename = (id: string): void => {
    const s = sessions.find((c) => c.id === id)
    setDraft(s?.title ?? '')
    setDialog({ kind: 'rename', id, title: s?.title ?? '새 채팅' })
    setMenu(null)
  }

  const openDelete = (id: string): void => {
    const s = sessions.find((c) => c.id === id)
    setDialog({ kind: 'delete', id, title: s?.title ?? '새 채팅' })
    setMenu(null)
  }

  const commitRename = (): void => {
    if (!dialog) return
    const name = draft.trim()
    if (name) onRename(dialog.id, name)
    setDialog(null)
  }

  const confirmDelete = (): void => {
    if (!dialog) return
    onDelete(dialog.id)
    setDialog(null)
  }

  // 검색 필터
  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      q
        ? sessions.filter((s) => (s.title || '새 채팅').toLowerCase().includes(q))
        : sessions,
    [sessions, q],
  )

  return (
    <>
      {filtered.length === 0 ? (
        <div className="sb-empty">{q ? '검색 결과가 없어요' : '아직 채팅이 없어요'}</div>
      ) : (
        filtered.map((s) => {
          const active = s.id === activeId
          return (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              className={'sb-item' + (active ? ' active' : '')}
              onClick={() => onSelect(s.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(s.id)
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ id: s.id, x: e.clientX, y: e.clientY })
              }}
            >
              <span className={dotClass(s.status)} />
              <span className="txt">
                <div className="t1">
                  <span className="t1-text">{s.title || '새 채팅'}</span>
                  {s.hasPrompt && (
                    <span className="pr-mark">
                      <IconSpark size={11} stroke={2.4} />
                    </span>
                  )}
                </div>
                {s.status !== 'idle' && (
                  <div className="t2">{statusSub(s.status)}</div>
                )}
              </span>
              <button
                type="button"
                className="more"
                aria-label="채팅 메뉴"
                onClick={(e) => {
                  e.stopPropagation()
                  const r = e.currentTarget.getBoundingClientRect()
                  setMenu({ id: s.id, x: r.right - MENU_W, y: r.bottom + 6 })
                }}
              >
                <IconMore size={16} />
              </button>
            </div>
          )
        })
      )}

      {/* 컨텍스트 메뉴 */}
      {menu && (
        <div
          className="ctx-menu"
          style={{
            left: Math.max(8, Math.min(menu.x, window.innerWidth - MENU_W - 8)),
            top: Math.max(8, Math.min(menu.y, window.innerHeight - menuH(showPrompt) - 8)),
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button type="button" className="ctx-item" onClick={() => openRename(menu.id)}>
            <IconPencil size={15} />
            이름 변경
          </button>
          {showPrompt && (
            <button
              type="button"
              className="ctx-item"
              onClick={() => {
                // no-op (M4 실연결)
                setMenu(null)
              }}
            >
              <IconSpark size={15} />
              프롬프트 설정
            </button>
          )}
          <div className="ctx-sep" />
          <button
            type="button"
            className="ctx-item danger"
            onClick={() => openDelete(menu.id)}
          >
            <IconTrash size={15} />
            삭제
          </button>
        </div>
      )}

      {/* rename / delete 다이얼로그 */}
      {dialog && (
        <div className="set-dialog-overlay" onMouseDown={() => setDialog(null)}>
          <div className="set-dialog" onMouseDown={(e) => e.stopPropagation()}>
            {dialog.kind === 'delete' ? (
              <>
                <div className="sd-ic">
                  <IconTrash size={22} />
                </div>
                <div className="sd-title">채팅 삭제</div>
                <div className="sd-msg">
                  <b>{dialog.title}</b> 채팅을 삭제할까요? 되돌릴 수 없습니다.
                </div>
                <div className="sd-btns">
                  <button type="button" className="sd-cancel" onClick={() => setDialog(null)}>
                    취소
                  </button>
                  <button type="button" className="sd-go danger" onClick={confirmDelete}>
                    삭제
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="sd-ic warn">
                  <IconPencil size={20} />
                </div>
                <div className="sd-title">이름 변경</div>
                <input
                  className="sd-input"
                  autoFocus
                  value={draft}
                  placeholder="채팅 이름"
                  onChange={(e) => setDraft(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    else if (e.key === 'Escape') setDialog(null)
                  }}
                />
                <div className="sd-btns">
                  <button type="button" className="sd-cancel" onClick={() => setDialog(null)}>
                    취소
                  </button>
                  <button type="button" className="sd-go" onClick={commitRename}>
                    저장
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ── Sidebar 본체 ──────────────────────────────────────────────────────────
function SidebarInner({ onCollapse, onOpenSettings }: SidebarProps): JSX.Element {
  const workspaceRoot = useAppStore(selectWorkspaceRoot)
  const wsName = workspaceRoot
    ? workspaceRoot.split(/[\\/]/).pop() ?? 'AgentDeck'
    : 'AgentDeck'
  const mark = wsName.charAt(0).toUpperCase()

  // 로컬 모드 토글 상태 (단일/멀티)
  const [mode, setMode] = useState<WorkspaceMode>('single')

  // 검색 쿼리 (로컬 state)
  const [query, setQuery] = useState('')

  // 세션 목록 로컬 state (CRUD 시각 — 실데이터 연결은 M4)
  const [sessions, setSessions] = useState<SessionSummary[]>(SAMPLE_SESSIONS)

  // 활성 세션 ID (첫 번째 선택)
  const [activeId, setActiveId] = useState<string>(SAMPLE_SESSIONS[0]?.id ?? '')

  const handleRename = (id: string, name: string): void => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: name } : s)),
    )
  }

  const handleDelete = (id: string): void => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id)
      // 삭제된 항목이 활성이면 첫 번째로 이동
      if (activeId === id && next.length > 0) setActiveId(next[0].id)
      return next
    })
  }

  const labelSingle = { list: '최근 채팅', search: '대화 검색', new: '새 대화' }
  const labelMulti  = { list: '최근 작업', search: '작업 검색', new: '새 작업' }
  const labels = mode === 'single' ? labelSingle : labelMulti

  return (
    <aside className="sidebar">
      {/* ── 상단: 브랜딩 + 접기 ── */}
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

      {/* ── 모드 토글 (role=tablist) ── */}
      <div className="sb-mode" role="tablist" aria-label="작업 모드">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'single'}
          className={'sb-mode-btn' + (mode === 'single' ? ' on' : '')}
          onClick={() => setMode('single')}
        >
          <IconSquare size={14} />
          <span>단일 에이전트</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'multi'}
          className={'sb-mode-btn' + (mode === 'multi' ? ' on' : '')}
          onClick={() => setMode('multi')}
        >
          <IconGrid size={14} />
          <span>멀티 에이전트</span>
        </button>
      </div>

      {/* ── 새 대화 (활성 — disabled 제거) ── */}
      <button
        type="button"
        className="sb-new"
        aria-label="새 대화"
        onClick={() => {
          // no-op: 실세션 생성은 M4
        }}
      >
        <IconPlus size={14} />
        <span className="sb-new-label">{labels.new}</span>
        <kbd className="sb-kbd">{isMac ? '⌘N' : 'Ctrl N'}</kbd>
      </button>

      {/* ── 검색 ── */}
      <div className="sb-search">
        <IconSearch size={13} className="sb-search-ic" />
        <input
          className="sb-search-input"
          type="text"
          placeholder={labels.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="대화 검색"
        />
      </div>

      {/* ── 목록 라벨 + 세션 행 ── */}
      <div className="sb-label">{labels.list}</div>
      <div className="sb-list">
        <RecentChats
          sessions={sessions}
          activeId={activeId}
          query={query}
          mode={mode}
          onSelect={setActiveId}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      </div>

      {/* ── 프로필 풋 — 전체가 설정 트리거 ──
           avatarColor 인라인: 사용자별 동적 색 → 토큰 부적합 (F8 설계 예외, 헌법 안티슬롭 비위반).
      */}
      <button
        type="button"
        className="sb-foot"
        aria-label="설정 열기"
        onClick={onOpenSettings}
      >
        {/* avatarColor: 사용자별 동적색 — 토큰 부적합(안티슬롭 예외). 샘플 고정값. */}
        <div className="ava" style={{ background: SAMPLE_USER.avatarColor, color: '#fff' }}>
          {SAMPLE_USER.avatarText}
        </div>
        <div className="who">
          <div className="n">{SAMPLE_USER.name}</div>
        </div>
      </button>
    </aside>
  )
}

export const Sidebar = memo(SidebarInner)
export default Sidebar
