/**
 * GitModal.tsx — M3 3c Git 카드 (실 IPC 연결).
 *
 * window.api.git.* 9메서드 경유 — fs/Node 직접 호출 0.
 * 원본 AgentCodeGUI GitModal.tsx 데이터 흐름 미러.
 *
 * props:
 *   root        — git 레포 최상위 절대 경로 (Shell이 git.root IPC로 해석해 전달)
 *   onClose     — 닫기 콜백
 *   onOpenFile  — 파일 뷰어 열기 (경로, 내용, diff)
 *   onAskClaude — AI 커밋 메시지 위임 콜백
 *
 * CRITICAL: renderer untrusted — fs/Node 호출 0. IPC는 window.api.git.* 경유만.
 * 인라인 색상 0 — CSS 변수 토큰.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react'
import type { GitStatus, GitChange, GitCommit } from '../../../../shared/ipc-contract'
import FileBadge from '../02_file/FileBadge'
import {
  IconCheck,
  IconClaude,
  IconClose,
  IconGitBranch,
  IconMax,
  IconRestore,
  IconSearch,
} from '../common/icons'
import './GitModal.css'

// ── 상태 배지 매핑 (git status porcelain: M/A/D/R) ──────────────────────────

const STATUS_CLS: Record<string, string> = { M: 'm', A: 'a', D: 'd', R: 'm' }

// ── 날짜 유틸 ─────────────────────────────────────────────────────────────────

function dayLabel(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((today - day) / 86_400_000)
  if (diff === 0) return '오늘'
  if (diff === 1) return '어제'
  if (d.getFullYear() !== now.getFullYear())
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

function agoLabel(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (s < 60) return '방금'
  if (s < 3600) return `${Math.floor(s / 60)}분 전`
  if (s < 86_400) return `${Math.floor(s / 3600)}시간 전`
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fullDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── FileRow ───────────────────────────────────────────────────────────────────

function FileRow({
  c,
  onOpen,
}: {
  c: GitChange
  onOpen: (c: GitChange) => void
}): JSX.Element {
  const slash = c.path.lastIndexOf('/')
  const dir = slash >= 0 ? c.path.slice(0, slash + 1) : ''
  const name = slash >= 0 ? c.path.slice(slash + 1) : c.path
  return (
    <button
      className="gitm-file"
      type="button"
      data-tip={c.path}
      onClick={() => onOpen(c)}
    >
      <span className={'gitm-st ' + (STATUS_CLS[c.status] ?? 'm')}>{c.status}</span>
      <FileBadge path={c.path} size={16} />
      <span className="fn">
        <span className="dir">{dir}</span>
        {name}
      </span>
      <span className="stat">
        {c.add != null && c.add > 0 ? <span className="add">+{c.add}</span> : null}
        {c.del != null && c.del > 0 ? <span className="del">-{c.del}</span> : null}
      </span>
    </button>
  )
}

// ── GitModal ──────────────────────────────────────────────────────────────────

export interface GitModalProps {
  /** git 레포 최상위 절대 경로 */
  root: string
  onClose: () => void
  /**
   * 파일 뷰어 열기.
   * path: 뷰어에 넘길 경로.
   * content: 커밋 시점 파일 내용(null이면 디스크에서 읽기).
   * diff: 변경 마킹용 diff (타입은 unknown — FileModal이 소비).
   */
  onOpenFile: (path: string, content: string | null, diff: unknown) => void
  /** AI 커밋 메시지 위임 — 활성 채팅에 prompt 주입하고 카드를 닫는다 */
  onAskClaude: (prompt: string) => void
}

export function GitModal({
  root,
  onClose,
  onOpenFile,
  onAskClaude,
}: GitModalProps): JSX.Element {
  // ── state ─────────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [commits, setCommits] = useState<GitCommit[] | null>(null)
  const [view, setView] = useState<'changes' | 'history'>('history')
  const [selHash, setSelHash] = useState<string | null>(null)
  /** 커밋 상세 캐시: hash → GitChange[] */
  const [details, setDetails] = useState<Record<string, GitChange[]>>({})
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState<'commit' | 'push' | 'pull' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const downOnOverlay = useRef(false)

  // repoName = root의 basename (원본 동일 — GitStatus에 repoName 필드 없음)
  const repoName = root.split(/[\\/]/).filter(Boolean).pop() ?? root

  // ── refresh ───────────────────────────────────────────────────────────────
  const refresh = useCallback((): void => {
    window.api.git.status({ root }).then(setStatus).catch(() => {})
    window.api.git
      .log({ root, limit: 100 })
      .then((list) => {
        setCommits(list)
        setSelHash((h) => h ?? list[0]?.hash ?? null)
      })
      .catch(() => {})
  }, [root])

  useEffect(refresh, [refresh])

  // ── Esc 닫기 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // ── 커밋 상세 lazy + 캐시 ─────────────────────────────────────────────────
  useEffect(() => {
    if (!selHash || details[selHash]) return
    let alive = true
    window.api.git
      .commitDetail({ root, hash: selHash })
      .then((files) => {
        if (alive) setDetails((d) => ({ ...d, [selHash]: files }))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [selHash, root, details])

  // ── 파일 열기 ─────────────────────────────────────────────────────────────

  const openWorking = useCallback(
    (c: GitChange): void => {
      if (c.status === 'D') return // 삭제된 파일 — 디스크에 없음
      window.api.git
        .workingFile({ root, path: c.path })
        .then((r) => onOpenFile(c.path, null, r.diff))
        .catch(() => {})
    },
    [root, onOpenFile]
  )

  const openAtCommit = useCallback(
    (hash: string) =>
      (c: GitChange): void => {
        window.api.git
          .fileAt({ root, hash, path: c.path })
          .then((r) => {
            if (r.content == null) {
              setErr(r.error ?? '파일을 열 수 없어요')
              return
            }
            onOpenFile(c.path, r.content, r.diff)
          })
          .catch(() => {})
      },
    [root, onOpenFile]
  )

  // ── 커밋 ──────────────────────────────────────────────────────────────────

  const doCommit = (): void => {
    if (!subject.trim() || busy) return
    setBusy('commit')
    setErr(null)
    window.api.git
      .commit({ root, subject: subject.trim(), body: body.trim() })
      .then((r) => {
        if (r.ok) {
          setSubject('')
          setBody('')
          refresh()
        } else {
          setErr(r.error ?? '커밋 실패')
        }
      })
      .catch(() => setErr('커밋 중 오류가 발생했어요'))
      .finally(() => setBusy(null))
  }

  // ── push / pull ───────────────────────────────────────────────────────────

  const doSync = (kind: 'push' | 'pull'): void => {
    if (busy) return
    setBusy(kind)
    setErr(null)
    const op =
      kind === 'push'
        ? window.api.git.push({ root })
        : window.api.git.pull({ root })
    op.then((r) => {
      if (!r.ok) setErr(r.error ?? (kind === 'push' ? '푸시 실패' : '풀 실패'))
      refresh()
    })
      .catch(() => setErr(kind === 'push' ? '푸시 중 오류' : '풀 중 오류'))
      .finally(() => setBusy(null))
  }

  // ── AI커밋 ────────────────────────────────────────────────────────────────

  const askClaude = (): void => {
    onAskClaude(
      'git 작업 트리의 변경 사항을 검토해서, 이 저장소의 기존 커밋 메시지 스타일에 맞는 커밋 메시지를 작성해 커밋해줘. 푸시는 하지 마.'
    )
    onClose()
  }

  // ── 최대화 토글 ──────────────────────────────────────────────────────────

  const toggleMaximize = useCallback(() => setMaximized((m) => !m), [])

  // ── 커밋 검색 — 메시지·해시·작성자·태그 ────────────────────────────────────

  const filtered = useMemo<GitCommit[] | null>(() => {
    if (!commits) return null
    const q = query.trim().toLowerCase()
    if (!q) return commits
    return commits.filter(
      (c) =>
        c.subject.toLowerCase().includes(q) ||
        c.body.toLowerCase().includes(q) ||
        c.hash.startsWith(q) ||
        c.shortHash.startsWith(q) ||
        c.author.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
    )
  }, [commits, query])

  const sel: GitCommit | null =
    selHash && commits ? (commits.find((c) => c.hash === selHash) ?? null) : null

  const changeCount = status?.changes.length ?? 0

  // ── 날짜 그룹 커밋 rows ───────────────────────────────────────────────────

  const rows: React.ReactNode[] = []
  if (filtered) {
    let lastDay = ''
    for (const c of filtered) {
      const day = dayLabel(c.date)
      if (day !== lastDay) {
        lastDay = day
        rows.push(
          <div className="gitm-day" key={'day-' + day + c.hash}>
            {day}
          </div>
        )
      }
      rows.push(
        <button
          key={c.hash}
          type="button"
          className={
            'gitm-commit' +
            (c.pushed ? ' pushed' : '') +
            (c.hash === selHash ? ' sel' : '')
          }
          onClick={() => setSelHash(c.hash)}
        >
          <span className="c-rail">
            <span className="c-dot" />
            <span className="c-line" />
          </span>
          <span className="c-main">
            <span className="c-msg">
              <span className="t">{c.subject || '(메시지 없음)'}</span>
              {c.tags.map((t) => (
                <span className="c-tag" key={t}>
                  {t}
                </span>
              ))}
            </span>
            <span className="c-meta">
              <span className="c-hash">{c.shortHash}</span>
              <span>{agoLabel(c.date)}</span>
              <span>{c.author}</span>
            </span>
          </span>
        </button>
      )
    }
  }

  // ── 렌더 ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="gitm-overlay"
      onMouseDown={(e) => {
        downOnOverlay.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (downOnOverlay.current && e.target === e.currentTarget) {
          downOnOverlay.current = false
          onClose()
        }
      }}
    >
      <div className={'gitm-modal' + (maximized ? ' maximized' : '')}>
        {/* ── diff-head 헤더 ── */}
        <div className="diff-head" onDoubleClick={toggleMaximize}>
          <span className="gitm-ic">
            <IconGitBranch size={17} />
          </span>
          <span className="gitm-name">{repoName}</span>
          {status && (
            <span className="gitm-br">
              ⎇ {status.branch}
              {status.ahead > 0 && <i className="ab">↑{status.ahead}</i>}
              {status.behind > 0 && <i className="ab bh">↓{status.behind}</i>}
            </span>
          )}
          <span className="gitm-path">{root}</span>
          <span className="dspacer" />
          {err && (
            <span className="gitm-err" data-tip={err} title={err}>
              {err}
            </span>
          )}
          <button
            className="gitm-btn"
            type="button"
            onClick={() => doSync('pull')}
            disabled={busy != null}
          >
            {busy === 'pull' ? <span className="spin" /> : '⇣'} 당겨오기
          </button>
          <button
            className={'gitm-btn' + ((status?.ahead ?? 0) > 0 ? ' pri' : '')}
            type="button"
            onClick={() => doSync('push')}
            disabled={busy != null}
          >
            {busy === 'push' ? <span className="spin" /> : '⇡'} 푸시
            {(status?.ahead ?? 0) > 0 ? ` ${status?.ahead}` : ''}
          </button>
          <button
            className="dclose"
            type="button"
            onClick={toggleMaximize}
            aria-label={maximized ? '이전 크기로' : '최대화'}
          >
            {maximized ? <IconRestore size={15} /> : <IconMax size={13} />}
          </button>
          <button
            className="dclose"
            type="button"
            onClick={onClose}
            aria-label="닫기"
          >
            <IconClose size={16} />
          </button>
        </div>

        {/* ── gitm-body ── */}
        <div className="gitm-body">
          {/* 좌측 내비 */}
          <nav className="gitm-nav">
            <div className="gitm-sec">작업 트리</div>
            <button
              className={'gitm-item' + (view === 'changes' ? ' on' : '')}
              type="button"
              onClick={() => setView('changes')}
            >
              <span className="ic">±</span>
              변경 사항
              {changeCount > 0 && <span className="n warn">{changeCount}</span>}
            </button>

            <div className="gitm-sec">히스토리</div>
            <button
              className={'gitm-item' + (view === 'history' ? ' on' : '')}
              type="button"
              onClick={() => setView('history')}
            >
              <span className="ic">⏱</span>
              모든 커밋
              {commits != null && (
                <span className="n">
                  {commits.length}
                  {commits.length >= 100 ? '+' : ''}
                </span>
              )}
            </button>

            {/* 브랜치 */}
            {status && status.branches.length > 0 && (
              <>
                <div className="gitm-sec">브랜치</div>
                {status.branches.map((b) => (
                  <div className="gitm-item static" key={b.name}>
                    <span className="ic">⎇</span>
                    <span className="nm">{b.name}</span>
                    {b.current && (
                      <span className="cur">
                        <IconCheck size={11} />
                      </span>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* 원격 */}
            {status && status.remotes.length > 0 && (
              <>
                <div className="gitm-sec">원격</div>
                {status.remotes.map((r) => (
                  <div className="gitm-item static" key={r}>
                    <span className="ic">☁</span>
                    <span className="nm">{r}</span>
                  </div>
                ))}
              </>
            )}

            {/* 태그 */}
            {status && status.tags.length > 0 && (
              <>
                <div className="gitm-sec">태그</div>
                {status.tags.map((t) => (
                  <button
                    className="gitm-item"
                    type="button"
                    key={t}
                    onClick={() => {
                      setView('history')
                      setQuery(t)
                    }}
                  >
                    <span className="ic">⌂</span>
                    <span className="nm">{t}</span>
                  </button>
                ))}
              </>
            )}
          </nav>

          {/* ── history 뷰 ── */}
          {view === 'history' ? (
            <>
              <section className="gitm-list">
                <div className="gitm-filter">
                  <IconSearch size={13} />
                  <input
                    value={query}
                    placeholder="커밋 메시지·해시·작성자 검색…"
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      className="x"
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label="검색 지우기"
                    >
                      <IconClose size={12} />
                    </button>
                  )}
                </div>
                <div className="gitm-scroll">
                  {commits == null ? (
                    <div className="gitm-state">
                      <span className="spin" />
                    </div>
                  ) : rows.length ? (
                    rows
                  ) : (
                    <div className="gitm-state">
                      {query ? '검색 결과가 없어요' : '커밋이 없어요'}
                    </div>
                  )}
                </div>
              </section>

              {/* 커밋 상세 */}
              <aside className="gitm-detail">
                {sel ? (
                  <>
                    <div className="gd-pad">
                      <div className="gd-msg">{sel.subject}</div>
                      {sel.body && <div className="gd-desc">{sel.body}</div>}
                      <div className="gd-meta">
                        <span className="gd-av">
                          {(sel.author || '?').slice(0, 1).toUpperCase()}
                        </span>
                        <span className="gd-who">
                          <b>{sel.author}</b>
                          <i>{fullDate(sel.date)}</i>
                        </span>
                        <button
                          className="gd-hash"
                          type="button"
                          onClick={() => {
                            navigator.clipboard
                              ?.writeText(sel.hash)
                              .then(() => {
                                setCopied(true)
                                setTimeout(() => setCopied(false), 1200)
                              }, () => {})
                          }}
                        >
                          {copied ? '복사됨' : sel.shortHash + ' ⧉'}
                        </button>
                      </div>
                    </div>
                    <div className="gitm-sec line">
                      변경된 파일 {details[sel.hash]?.length ?? ''}
                    </div>
                    {details[sel.hash] ? (
                      details[sel.hash].length > 0 ? (
                        <div className="gitm-scroll">
                          {details[sel.hash].map((c) => (
                            <FileRow
                              key={c.path}
                              c={c}
                              onOpen={openAtCommit(sel.hash)}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="gitm-state small">변경 파일 없음</div>
                      )
                    ) : (
                      <div className="gitm-state small">
                        <span className="spin" />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="gitm-state">커밋을 선택하세요</div>
                )}
              </aside>
            </>
          ) : (
            /* ── changes 뷰 ── */
            <section className="gitm-list wide">
              <div className="gitm-scroll">
                <div className="gitm-day">변경된 파일 {changeCount}</div>
                {status == null ? (
                  <div className="gitm-state">
                    <span className="spin" />
                  </div>
                ) : changeCount === 0 ? (
                  <div className="gitm-state">작업 트리가 깨끗해요</div>
                ) : (
                  status.changes.map((c) => (
                    <FileRow key={c.path} c={c} onOpen={openWorking} />
                  ))
                )}
                {changeCount > 0 && (
                  <div className="gitm-hint">
                    파일을 클릭하면 코드 뷰어에서 커밋 전 변경 내용으로 열려요.
                  </div>
                )}
              </div>
              <div className="gitm-compose">
                <input
                  value={subject}
                  placeholder="커밋 메시지"
                  onChange={(e) => setSubject(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      doCommit()
                    }
                  }}
                />
                <textarea
                  value={body}
                  rows={2}
                  placeholder="설명 (선택)"
                  onChange={(e) => setBody(e.target.value)}
                />
                <div className="row">
                  <button
                    className="gitm-btn claude"
                    type="button"
                    onClick={askClaude}
                    disabled={changeCount === 0}
                  >
                    <IconClaude size={13} /> Claude에게 메시지 짓게 하기
                  </button>
                  <span className="sp" />
                  <button
                    className="gitm-btn pri"
                    type="button"
                    onClick={doCommit}
                    disabled={!subject.trim() || changeCount === 0 || busy != null}
                  >
                    {busy === 'commit' ? <span className="spin" /> : null} 커밋
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

export default GitModal
