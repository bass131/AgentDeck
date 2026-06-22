/**
 * GitModal.tsx — F11-01 Git 카드 (원본 AgentCodeGUI 1:1 시각 충실도).
 *
 * 정적 샘플 데이터(gitSampleData.ts) 기반 — window.api 호출 0.
 * git 백엔드(status/log/commit/push/pull) = M3 후속 IPC 연결 예정.
 *
 * CRITICAL: renderer untrusted — fs/Node 호출 0. IPC 호출 0(샘플).
 * 인라인 색상 0 — CSS 변수 토큰.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { GIT_STATUS, GIT_COMMITS, GIT_COMMIT_FILES } from '../lib/gitSampleData'
import type { GitChange, GitCommit } from '../lib/gitSampleData'
import FileBadge from './FileBadge'
import {
  IconCheck,
  IconClaude,
  IconClose,
  IconGitBranch,
  IconMax,
  IconRestore,
  IconSearch,
} from './icons'
import './GitModal.css'

// ── 유틸 ─────────────────────────────────────────────────────────────────────

const KIND_CLS: Record<string, string> = { modify: 'm', add: 'a', delete: 'd' }
const KIND_LABEL: Record<string, string> = { modify: 'M', add: 'A', delete: 'D' }

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

function FileRow({ c }: { c: GitChange }): JSX.Element {
  const slash = c.path.lastIndexOf('/')
  const dir = slash >= 0 ? c.path.slice(0, slash + 1) : ''
  const name = slash >= 0 ? c.path.slice(slash + 1) : c.path
  return (
    <button className="gitm-file" type="button" data-tip={c.path}>
      <span className={'gitm-st ' + (KIND_CLS[c.kind] ?? 'm')}>{KIND_LABEL[c.kind] ?? 'M'}</span>
      <FileBadge path={c.path} size={16} />
      <span className="fn">
        <span className="dir">{dir}</span>
        {name}
      </span>
    </button>
  )
}

// ── GitModal ──────────────────────────────────────────────────────────────────

export interface GitModalProps {
  onClose: () => void
}

export function GitModal({ onClose }: GitModalProps): JSX.Element {
  const [view, setView] = useState<'changes' | 'history'>('history')
  const [selHash, setSelHash] = useState<string | null>(GIT_COMMITS[0]?.hash ?? null)
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [maximized, setMaximized] = useState(false)
  const [copied, setCopied] = useState(false)
  const downOnOverlay = useRef(false)

  // Esc 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggleMaximize = useCallback(() => setMaximized((m) => !m), [])

  // 커밋 검색 — 메시지·해시·작성자
  const filtered = useMemo<GitCommit[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return GIT_COMMITS
    return GIT_COMMITS.filter(
      (c) =>
        c.subject.toLowerCase().includes(q) ||
        c.body.toLowerCase().includes(q) ||
        c.hash.startsWith(q) ||
        c.shortHash.startsWith(q) ||
        c.author.toLowerCase().includes(q)
    )
  }, [query])

  const sel: GitCommit | null = selHash
    ? (GIT_COMMITS.find((c) => c.hash === selHash) ?? null)
    : null

  const changeCount = GIT_STATUS.changes.length

  // 날짜 그룹을 끼워 넣은 커밋 rows
  const rows: React.ReactNode[] = []
  {
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
          className={'gitm-commit' + (c.hash === selHash ? ' sel' : '')}
          onClick={() => setSelHash(c.hash)}
        >
          <span className="c-rail">
            <span className="c-dot" />
            <span className="c-line" />
          </span>
          <span className="c-main">
            <span className="c-msg">
              <span className="t">{c.subject || '(메시지 없음)'}</span>
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

  // 선택 커밋의 변경 파일 (샘플 데이터에서 조회)
  const selFiles: GitChange[] | null = sel ? (GIT_COMMIT_FILES[sel.hash] ?? []) : null

  const handleCopyHash = (): void => {
    if (!sel) return
    navigator.clipboard?.writeText(sel.hash).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      },
      () => {}
    )
  }

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
          <span className="gitm-name">{GIT_STATUS.repoName}</span>
          <span className="gitm-br">
            ⎇ {GIT_STATUS.branch}
            {GIT_STATUS.ahead > 0 && <i className="ab">↑{GIT_STATUS.ahead}</i>}
            {GIT_STATUS.behind > 0 && <i className="ab bh">↓{GIT_STATUS.behind}</i>}
          </span>
          <span className="gitm-path">{GIT_STATUS.root}</span>
          <span className="dspacer" />
          {/* 당겨오기/푸시 — 시각(no-op). 실동작 = M3 */}
          <button className="gitm-btn" type="button">
            ⇣ 당겨오기
          </button>
          <button
            className={'gitm-btn' + (GIT_STATUS.ahead > 0 ? ' pri' : '')}
            type="button"
          >
            ⇡ 푸시{GIT_STATUS.ahead > 0 ? ` ${GIT_STATUS.ahead}` : ''}
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
              <span className="n">{GIT_COMMITS.length}</span>
            </button>

            {/* 브랜치 */}
            {GIT_STATUS.branches.length > 0 && (
              <>
                <div className="gitm-sec">브랜치</div>
                {GIT_STATUS.branches.map((b) => (
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
            {GIT_STATUS.remotes.length > 0 && (
              <>
                <div className="gitm-sec">원격</div>
                {GIT_STATUS.remotes.map((r) => (
                  <div className="gitm-item static" key={r}>
                    <span className="ic">☁</span>
                    <span className="nm">{r}</span>
                  </div>
                ))}
              </>
            )}

            {/* 태그 */}
            {GIT_STATUS.tags.length > 0 && (
              <>
                <div className="gitm-sec">태그</div>
                {GIT_STATUS.tags.map((t) => (
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
                  {rows.length ? (
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
                          onClick={handleCopyHash}
                        >
                          {copied ? '복사됨' : sel.shortHash + ' ⧉'}
                        </button>
                      </div>
                    </div>
                    <div className="gitm-sec line">
                      변경된 파일 {selFiles?.length ?? ''}
                    </div>
                    {selFiles && selFiles.length > 0 ? (
                      <div className="gitm-scroll">
                        {selFiles.map((c) => (
                          <FileRow key={c.path} c={c} />
                        ))}
                      </div>
                    ) : (
                      <div className="gitm-state small">변경 파일 없음</div>
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
                {changeCount === 0 ? (
                  <div className="gitm-state">작업 트리가 깨끗해요 ✓</div>
                ) : (
                  GIT_STATUS.changes.map((c) => <FileRow key={c.path} c={c} />)
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
                    if (e.key === 'Enter' && !e.shiftKey) e.preventDefault()
                  }}
                />
                <textarea
                  value={body}
                  rows={2}
                  placeholder="설명 (선택)"
                  onChange={(e) => setBody(e.target.value)}
                />
                <div className="row">
                  <button className="gitm-btn claude" type="button">
                    <IconClaude size={13} /> Claude에게 메시지 짓게 하기
                  </button>
                  <span className="sp" />
                  {/* 커밋 버튼 — 시각(no-op). subject 빈 시 disabled. 실동작 = M3 */}
                  <button
                    className="gitm-btn pri"
                    type="button"
                    disabled={!subject.trim()}
                  >
                    커밋
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
