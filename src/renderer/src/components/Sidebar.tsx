/**
 * Sidebar.tsx — 좌측 사이드바 (F8: 세션 목록 + 멀티 토글).
 *
 * M4-3 23c: 실데이터 배선.
 *  - props 시그니처 유지: { onCollapse, onOpenSettings } — Shell.tsx 무변경.
 *  - 세션 목록: store conversations(ConversationRecord[]) → SessionSummary[] 매핑.
 *  - 활성 id: store conversationId (로컬 activeId state 제거).
 *  - 액션 배선: selectConversation / renameConversation / deleteConversation / newConversation.
 *  - 마운트 시 listConversations() 호출.
 *  - avatarColor 인라인 동적색 허용(사용자별 고유 색 → 토큰 부적합, 설계 예외, ADR-014 주석).
 *
 * 브랜딩: .sb-name = "AgentDeck {version}" — 워크스페이스 폴더명 미표시.
 *  - 마운트 시 window.api.getAppVersion() IPC 호출(Shell.tsx appVersion 패턴 미러).
 *  - 로드 전(빈 문자열) graceful — "AgentDeck"만 표시.
 *  - IPC 실패 graceful catch — "AgentDeck" fallback.
 *
 * 인라인 색상 0 (avatarColor 인라인 제외) — CSS 토큰.
 * 이모지 0 — 벡터 아이콘.
 */
import { memo, useState, useMemo, useEffect, useRef, type JSX } from 'react'
import {
  useAppStore,
  selectWorkspaceMode,
  selectConversations,
  selectIsRunning,
  selectProfile,
  selectMultiSessions,
  selectActiveMultiSessionId,
  type MultiSessionSummary,
} from '../store/appStore'
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
  SAMPLE_USER,
  type SessionSummary,
  type SessionStatus,
} from '../lib/sidebarSampleData'
import type { ConversationRecord } from '../../../shared/ipc-contract'
import { PromptModal } from './PromptModal'
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

// ── ConversationRecord → SessionSummary 매핑 ─────────────────────────────
/**
 * 실 대화 레코드를 사이드바 행 데이터로 변환.
 * status: 활성+실행중이면 'running', 그 외 'idle' (per-session status 없음 — MVP).
 * hasPrompt: false (실데이터에 per-session 프롬프트 없음 — MVP).
 */
function toSessionSummary(
  rec: ConversationRecord,
  conversationId: string | null,
  isRunning: boolean,
): SessionSummary {
  const active = rec.id === conversationId
  return {
    id: rec.id,
    title: rec.title || '새 채팅',
    status: (active && isRunning) ? 'running' : 'idle',
    hasPrompt: false,
  }
}

/**
 * MultiSessionSummary → SessionSummary 매핑.
 * 멀티 모드 행 데이터. status 항상 idle(패널별 상태 없음 — 1단계).
 * hasPrompt: false (멀티 모드에 per-session 프롬프트 없음).
 * title 없으면 '새 작업' fallback.
 * activeId: 상위 컴포넌트가 activeId로 행 강조 처리(이 함수에서 미사용).
 */
function toMultiSessionSummary(ms: MultiSessionSummary, _activeId: string): SessionSummary {
  return {
    id: ms.id,
    title: ms.title || '새 작업',
    status: 'idle',
    hasPrompt: false,
  }
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

  // 프롬프트 설정 모달 상태 (내부 로컬 — Sidebar props 무변경)
  const [promptSession, setPromptSession] = useState<{ id: string; title: string } | null>(null)

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
                const s = sessions.find((c) => c.id === menu.id)
                setPromptSession({ id: menu.id, title: s?.title ?? '새 채팅' })
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

      {/* 프롬프트 설정 모달 — Sidebar 내부 로컬 state (props 무변경) */}
      {promptSession && (
        <PromptModal
          target={promptSession.title}
          scope="이 채팅에만 적용"
          noun="채팅"
          value=""
          onSave={() => {
            // 실 저장 = 후속 (시각/로컬)
          }}
          onClose={() => setPromptSession(null)}
        />
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
  // 앱 버전 state — 마운트 시 window.api.getAppVersion() IPC 호출(Shell.tsx 패턴 미러).
  // 로드 전 빈 문자열, IPC 실패 시에도 빈 문자열로 graceful fallback.
  const [appVersion, setAppVersion] = useState('')
  const cancelledRef = useRef(false)
  useEffect(() => {
    cancelledRef.current = false
    window.api
      .getAppVersion()
      .then((v) => {
        if (cancelledRef.current) return
        setAppVersion(v ?? '')
      })
      .catch(() => {
        // IPC 실패 graceful — "AgentDeck" fallback(빈 문자열 유지)
      })
    return () => {
      cancelledRef.current = true
    }
  }, [])

  // 브랜딩 텍스트: "AgentDeck {version}" 또는 "AgentDeck"(버전 미로드 시)
  const brandName = appVersion ? `AgentDeck ${appVersion}` : 'AgentDeck'
  // sb-mark: 항상 "A" (AgentDeck 첫 글자)
  const mark = 'A'

  // 모드 — store 구독 + setWorkspaceMode (F13: 로컬 state → store 이전)
  const mode = useAppStore(selectWorkspaceMode)
  const setMode = (m: WorkspaceMode): void => {
    useAppStore.getState().setWorkspaceMode(m)
  }

  // 검색 쿼리 (로컬 state)
  const [query, setQuery] = useState('')

  // ── 23c: 단일챗 실데이터 배선 ──────────────────────────────────────────
  // conversations: store selectConversations 구독 (로컬 state 제거)
  const conversations = useAppStore(selectConversations)
  // 활성 대화 id: store conversationId 구독 (로컬 activeId state 제거)
  const conversationId = useAppStore((s) => s.conversationId)
  // 실행 중 여부: status 매핑용
  const isRunning = useAppStore(selectIsRunning)

  // ── 멀티세션 배선 ─────────────────────────────────────────────────────
  // multiSessions: store selectMultiSessions 구독
  const multiSessions = useAppStore(selectMultiSessions)
  // 활성 멀티세션 id: store selectActiveMultiSessionId 구독
  const activeMultiSessionId = useAppStore(selectActiveMultiSessionId)

  // P2: 실 프로필 구독 — store profile → 풋터 아바타/이름 반영.
  // null(미온보딩/IPC 실패)이면 SAMPLE_USER fallback 유지(graceful).
  const profile = useAppStore(selectProfile)

  // ── sessions 파생 (메모이즈, 과리렌더 방지) ──────────────────────────
  // 단일 모드: ConversationRecord[] → SessionSummary[]
  const singleSessions = useMemo(
    () => conversations.map((rec) => toSessionSummary(rec, conversationId, isRunning)),
    [conversations, conversationId, isRunning],
  )
  // 멀티 모드: MultiSessionSummary[] → SessionSummary[]
  const multiSessionsAsSummary = useMemo(
    () => multiSessions.map((ms) => toMultiSessionSummary(ms, activeMultiSessionId)),
    [multiSessions, activeMultiSessionId],
  )

  // 현재 모드에 따른 세션/activeId 분기
  const sessions = mode === 'multi' ? multiSessionsAsSummary : singleSessions
  const currentActiveId = mode === 'multi' ? activeMultiSessionId : (conversationId ?? '')

  // 마운트 시 목록 로드 (단방향: 액션 → store → 컴포넌트)
  // 단일: listConversations(), 멀티: loadMultiSessions()
  useEffect(() => {
    void useAppStore.getState().listConversations()
    void useAppStore.getState().loadMultiSessions()
  }, [])

  // ── 액션 핸들러 (store 액션 경유 — window.api 직접 호출 0) ─────────────
  // 모드에 따라 단일/멀티 액션으로 분기
  const handleSelect = (id: string): void => {
    if (mode === 'multi') {
      void useAppStore.getState().selectMultiSession(id)
    } else {
      void useAppStore.getState().selectConversation(id)
    }
  }

  const handleRename = (id: string, name: string): void => {
    if (mode === 'multi') {
      void useAppStore.getState().renameMultiSession(id, name)
    } else {
      void useAppStore.getState().renameConversation(id, name)
    }
  }

  const handleDelete = (id: string): void => {
    if (mode === 'multi') {
      void useAppStore.getState().deleteMultiSession(id)
    } else {
      void useAppStore.getState().deleteConversation(id)
    }
  }

  const handleNew = (): void => {
    if (mode === 'multi') {
      void useAppStore.getState().newMultiSession()
    } else {
      useAppStore.getState().newConversation()
    }
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
            <span className="sb-name" title="AgentDeck">{brandName}</span>
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
        onClick={handleNew}
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
          activeId={currentActiveId}
          query={query}
          mode={mode}
          onSelect={handleSelect}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      </div>

      {/* ── 프로필 풋 — 전체가 설정 트리거 ──
           avatarColor 인라인: 사용자별 동적 색 → 토큰 부적합 (F8 설계 예외, 헌법 안티슬롭 비위반).
           P2 실배선: profile(store) → 아바타/이름. null이면 SAMPLE_USER fallback(graceful).
      */}
      <button
        type="button"
        className="sb-foot"
        aria-label="설정 열기"
        onClick={onOpenSettings}
      >
        {/* avatarColor: 사용자별 동적색 — 토큰 부적합(안티슬롭 예외). profile.color 우선, null 시 SAMPLE_USER. */}
        <div
          className="ava"
          style={{ background: profile?.color ?? SAMPLE_USER.avatarColor, color: '#fff' }}
        >
          {profile?.nickname?.trim()?.[0]?.toUpperCase() ?? SAMPLE_USER.avatarText}
        </div>
        <div className="who">
          <div className="n">{profile?.nickname ?? SAMPLE_USER.name}</div>
        </div>
      </button>
    </aside>
  )
}

export const Sidebar = memo(SidebarInner)
export default Sidebar
