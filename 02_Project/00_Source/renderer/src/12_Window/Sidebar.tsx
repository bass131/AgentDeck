import { memo, useState, useMemo, useEffect, useRef, useSyncExternalStore, type JSX } from 'react'
import { sessionRegistry } from '@renderer/03_Agent/state/sessionRegistry'
import { convKey } from '@renderer/03_Agent/state/sessionKeys'
import {
  useAppStore,
  selectWorkspaceMode,
  selectConversations,
  selectIsRunning,
  selectProfile,
} from '@renderer/00_App/appStore'
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
} from '@renderer/02_Common/icons'
import {
  SAMPLE_USER,
  type SessionSummary,
  type SessionStatus,
} from './sidebarSampleData'
import type { ConversationRecord } from '@shared/ipcContract'
import { ipc } from '@renderer/01_Ipc'
import { PromptModal } from '@renderer/03_Agent/prompt'
import type { WorkspaceMode } from './windowMode'
import './Sidebar.css'

interface SidebarProps {
  onCollapse: () => void
  onOpenSettings: () => void
}

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

const MENU_W = 178
const MENU_H = 127

// 실행 표시(B1, G9c) — 세션 레지스트리 기준이다. 대화는 isRunning(convKey(id))와 같은 판정으로, 활성 대화면
// 전경 저장 칸(store isRunning), 아니면 레지스트리의 배경 항목을 본다. runningKeys는 실행 중인 레지스트리 항목 키 집합이다.
function conversationRunning(
  id: string,
  activeId: string | null,
  activeRunning: boolean,
  runningKeys: ReadonlySet<string>,
): boolean {
  return id === activeId ? activeRunning : runningKeys.has(convKey(id))
}

function toSessionSummary(rec: ConversationRecord, running: boolean): SessionSummary {
  return {
    id: rec.id,
    title: rec.title || '새 채팅',
    status: running ? 'running' : 'idle',
    hasPrompt: false,
  }
}

interface RecentChatsProps {
  sessions: SessionSummary[]
  activeId: string
  query: string
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

function RecentChats({
  sessions,
  activeId,
  query,
  onSelect,
  onRename,
  onDelete,
}: RecentChatsProps): JSX.Element {
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  const [dialog, setDialog] = useState<{
    kind: 'rename' | 'delete'
    id: string
    title: string
  } | null>(null)
  const [draft, setDraft] = useState('')

  const [promptSession, setPromptSession] = useState<{ id: string; title: string } | null>(null)

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

      {menu && (
        <div
          className="ctx-menu"
          style={{
            left: Math.max(8, Math.min(menu.x, window.innerWidth - MENU_W - 8)),
            top: Math.max(8, Math.min(menu.y, window.innerHeight - MENU_H - 8)),
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button type="button" className="ctx-item" onClick={() => openRename(menu.id)}>
            <IconPencil size={15} />
            이름 변경
          </button>
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

      {promptSession && (
        <PromptModal
          target={promptSession.title}
          scope="이 채팅에만 적용"
          noun="채팅"
          value=""
          onSave={() => {
          }}
          onClose={() => setPromptSession(null)}
        />
      )}

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

// 모드 전환 칸의 두 모드 — 화면 이름 「채팅」·「작업」(M10 G1). 「작업」의 몸체는 루프 화면이다(Shell).
const MODES: ReadonlyArray<{ mode: WorkspaceMode; label: string; Icon: typeof IconSquare }> = [
  { mode: 'single', label: '채팅', Icon: IconSquare },
  { mode: 'work', label: '작업', Icon: IconGrid },
]

function SidebarInner({ onCollapse, onOpenSettings }: SidebarProps): JSX.Element {
  const [appVersion, setAppVersion] = useState('')
  const cancelledRef = useRef(false)
  useEffect(() => {
    cancelledRef.current = false
    ipc.engine
      .appVersion()
      .then((v) => {
        if (cancelledRef.current) return
        setAppVersion(v ?? '')
      })
      .catch(() => {
      })
    return () => {
      cancelledRef.current = true
    }
  }, [])

  const brandName = appVersion ? `AgentDeck ${appVersion}` : 'AgentDeck'
  const mark = 'A'

  const mode = useAppStore(selectWorkspaceMode)
  const setMode = (m: WorkspaceMode): void => {
    useAppStore.getState().setWorkspaceMode(m)
  }

  const [query, setQuery] = useState('')

  const conversations = useAppStore(selectConversations)
  const conversationId = useAppStore((s) => s.conversationId)
  const isRunning = useAppStore(selectIsRunning)

  const profile = useAppStore(selectProfile)

  const runningKeys = useSyncExternalStore(sessionRegistry.subscribe, sessionRegistry.runningKeys)

  // 목록은 모드와 관계없이 채팅이다 — 작업 모드의 프로젝트 목록은 G2·G3 몫이다.
  const sessions = useMemo(
    () => conversations.map((rec) =>
      toSessionSummary(rec, conversationRunning(rec.id, conversationId, isRunning, runningKeys))),
    [conversations, conversationId, isRunning, runningKeys],
  )

  useEffect(() => {
    void useAppStore.getState().listConversations()
  }, [])

  // 목록은 늘 채팅이다 — 작업 모드에서 대화를 고르거나 새로 열면 보이는 화면도 채팅으로 바꾼다(M10 G1 검수 사소 6)
  const showChat = (): void => {
    const s = useAppStore.getState()
    if (s.workspaceMode !== 'single') s.setWorkspaceMode('single')
  }

  const handleSelect = (id: string): void => {
    showChat()
    void useAppStore.getState().selectConversation(id)
  }

  const handleRename = (id: string, name: string): void => {
    void useAppStore.getState().renameConversation(id, name)
  }

  const handleDelete = (id: string): void => {
    void useAppStore.getState().deleteConversation(id)
  }

  const handleNew = (): void => {
    showChat()
    useAppStore.getState().newConversation()
  }

  return (
    <aside className="sidebar">
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

      <div className="sb-mode" role="tablist" aria-label="작업 모드">
        {MODES.map(({ mode: m, label, Icon }) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={'sb-mode-btn' + (mode === m ? ' on' : '')}
            onClick={() => setMode(m)}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="sb-new"
        aria-label="새 대화"
        onClick={handleNew}
      >
        <IconPlus size={14} />
        <span className="sb-new-label">새 대화</span>
        <kbd className="sb-kbd">{isMac ? '⌘N' : 'Ctrl N'}</kbd>
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
        <RecentChats
          sessions={sessions}
          activeId={conversationId ?? ''}
          query={query}
          onSelect={handleSelect}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      </div>

      <button
        type="button"
        className="sb-foot"
        aria-label="설정 열기"
        onClick={onOpenSettings}
      >
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
