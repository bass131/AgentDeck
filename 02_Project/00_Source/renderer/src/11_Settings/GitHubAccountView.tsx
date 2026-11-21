import { useEffect, useRef, useState, type JSX } from 'react'
import type { GithubAuthStatus } from '@shared/ipcContract'
import { IconCopy, IconGitBranch } from '@renderer/02_Common/icons'
import { ipc } from '@renderer/01_Ipc'

const REQUEST_FAILED = '요청을 처리하지 못했어요 — 다시 시도해 주세요'

function expiryText(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}까지 유효해요`
}

function statusText(s: GithubAuthStatus | null): string {
  if (s === null) return '상태를 읽고 있어요…'
  if (s.phase === 'pending') return '아래 코드를 GitHub에 입력해 주세요. 승인을 기다리고 있어요…'
  if (s.phase === 'connected') return 'GitHub 계정에 연결돼 있어요.'
  return 'GitHub에 연결되지 않았어요.'
}

export function GitHubAccountView(): JSX.Element {
  const [status, setStatus] = useState<GithubAuthStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [justConnected, setJustConnected] = useState(false)
  const phase = useRef<GithubAuthStatus['phase'] | null>(null)

  const apply = (s: GithubAuthStatus): void => {
    setJustConnected(phase.current === 'pending' && s.phase === 'connected')
    phase.current = s.phase
    setStatus(s)
  }

  useEffect(() => {
    let alive = true
    void ipc.github.status().then((s) => { if (alive) apply(s) }, () => undefined)
    const off = ipc.github.onState((s) => { if (alive) apply(s) })
    return () => {
      alive = false
      off()
    }
  }, [])

  const run = async (fn: () => Promise<GithubAuthStatus>): Promise<void> => {
    setBusy(true)
    setNote(null)
    try {
      apply(await fn())
    } catch {
      setNote(REQUEST_FAILED)
      await ipc.github.status().then(apply, () => undefined)
    } finally {
      setBusy(false)
    }
  }

  const openGithub = async (): Promise<void> => {
    const r = await ipc.github.openVerification().catch(() => ({ ok: false as const, error: undefined }))
    setNote(r.ok ? '브라우저에서 GitHub를 열었어요' : (r.error ?? 'GitHub를 열지 못했어요'))
  }

  const copyCode = (code: string): void => {
    void navigator.clipboard?.writeText(code).then(() => setNote('코드를 복사했어요'), () => setNote('복사하지 못했어요'))
  }

  const error = status?.phase === 'disconnected' ? status.error : undefined

  return (
    <>
      <div className="set-h1">GitHub 계정</div>
      <div className="set-h1-sub">
        앱이 이 계정으로 PR 카드를 읽고, 실행기가 push·PR을 해요. 토큰은 이 PC의 자격 보호로 저장되고 화면에 다시 보이지 않아요.
      </div>

      <div className="sec">
        <section className="card gh-card" aria-label="GitHub 계정">
          <div className="ver-row">
            <div className="ver-ic engine"><IconGitBranch size={20} /></div>
            <div className="ver-main">
              <div className="ver-name">GitHub</div>
              <div className="ver-meta" role="status" aria-label="GitHub 연결 상태">{statusText(status)}</div>
              {status?.phase === 'connected' && (
                <div className="ver-meta">
                  {justConnected && <span className="vtag inst gh-ok">연결됐어요</span>}
                  계정 <strong aria-label="연결된 계정">{status.login}</strong>
                </div>
              )}
            </div>
            <div className="ver-badges">
              {status?.phase === 'connected' ? (
                <button type="button" className="inst-btn ghost" aria-label="연결 해제" disabled={busy} onClick={() => void run(() => ipc.github.disconnect())}>
                  연결 해제
                </button>
              ) : status?.phase === 'pending' ? (
                <button type="button" className="inst-btn ghost" aria-label="연결 취소" disabled={busy} onClick={() => void run(() => ipc.github.cancel())}>
                  취소
                </button>
              ) : (
                <button type="button" className="inst-btn" aria-label="GitHub 연결" disabled={busy || status === null} onClick={() => void run(() => ipc.github.connect())}>
                  연결
                </button>
              )}
            </div>
          </div>

          {status?.phase === 'pending' && (
            <div className="gh-pending">
              <code className="gh-code" aria-label="사용자 코드">{status.userCode}</code>
              <button type="button" className="inst-btn ghost gh-copy" aria-label="사용자 코드 복사" onClick={() => copyCode(status.userCode)}>
                <IconCopy size={13} /> 복사
              </button>
              <button type="button" className="inst-btn" aria-label="GitHub에서 열기" onClick={() => void openGithub()}>
                GitHub에서 열기
              </button>
              <span className="gh-expiry" aria-label="코드 만료">{expiryText(status.expiresAt)}</span>
            </div>
          )}
        </section>

        {error && <div className="gh-error" role="alert" aria-label="GitHub 연결 오류">{error}</div>}
        {note && <div className="set-note" aria-live="polite">{note}</div>}
        <div className="set-note">
          GitHub에서 코드를 입력하고 승인하면 이 칸이 저절로 바뀌어요. 연결을 해제하면 저장된 토큰을 지우고, 실행기는 이 PC의 gh 로그인으로 돌아가요.
        </div>
      </div>
    </>
  )
}
