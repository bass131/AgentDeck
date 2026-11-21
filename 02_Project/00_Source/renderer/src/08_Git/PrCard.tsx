// 병합의 길은 사람이 이 카드에서 누르는 「병합」 버튼 하나다.
// 카드의 값은 모두 main이 GitHub에서 읽어 준 값이다(08_Git/prMerge.ts). 병합은 카드가 보인 머리 SHA를 싣고,
// main은 자기가 마지막으로 읽어 보인 SHA와 다르면 거부한다. Git 창(번호로 불러오기)과 대화(`gh pr create` 결과)에서 쓴다.
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { PrMergeResponse, PrReadResponse } from '@shared/ipcContract'
import { ipc } from '@renderer/01_Ipc'
import { checkLabel, confirmText, mergeOutcomeText, shortSha } from './prCardModel'
import './PrCard.css'

export interface PrCardProps {
  // 대화나 Git 창의 작업 폴더. 없으면 읽지 않는다
  cwd: string | null
  number?: number
  // 대화에서 감지한 PR URL — 번호를 찾는 데만 쓴다. 저장소 비교는 main이 한다
  url?: string
}

type Phase = 'idle' | 'confirm' | 'merging'

export function PrCard({ cwd, number, url }: PrCardProps): JSX.Element {
  const [read, setRead] = useState<PrReadResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [outcome, setOutcome] = useState<PrMergeResponse | null>(null)
  // 한 번 병합을 보낸 SHA는 main이 잊는다 — 다시 읽기 전까지 버튼을 끈다
  const [spent, setSpent] = useState(false)
  const alive = useRef(true)
  // 읽기 세대 — 병합을 시작하면 올린다. 그 전에 시작한 읽기가 늦게 와도 병합 상태(spent·phase·outcome)를 되돌리지 않는다.
  const readGen = useRef(0)

  const load = useCallback((): void => {
    if (!cwd) return
    const gen = ++readGen.current
    setLoading(true)
    ipc.git
      .prRead({ cwd, number, url })
      .then((r) => {
        if (!alive.current || gen !== readGen.current) return
        setRead(r)
        setOutcome(null)
        setSpent(false)
        setPhase('idle')
      })
      .catch((e: unknown) => {
        if (alive.current && gen === readGen.current) setRead({ ok: false, error: e instanceof Error ? e.message : String(e) })
      })
      .finally(() => {
        if (alive.current && gen === readGen.current) setLoading(false)
      })
  }, [cwd, number, url])

  // 마운트당 한 번만 읽는다 — 다시 연 대화의 지난 카드가 렌더마다 GitHub를 부르지 않게 한다
  const loadedOnce = useRef(false)
  useEffect(() => {
    alive.current = true
    if (!loadedOnce.current) {
      loadedOnce.current = true
      load()
    }
    return () => {
      alive.current = false
    }
  }, [load])

  const pr = read && read.ok ? read.pr : null

  const merge = (): void => {
    if (!cwd || !pr || loading) return
    // 진행 중인 읽기를 버린다
    readGen.current++
    setLoading(false)
    setPhase('merging')
    setSpent(true)
    ipc.git
      .prMerge({ cwd, number: pr.number, sha: pr.headSha })
      .then((r) => {
        if (alive.current) setOutcome(r)
      })
      .catch((e: unknown) => {
        if (alive.current) setOutcome({ status: 'failed', message: e instanceof Error ? e.message : String(e) })
      })
      .finally(() => {
        if (alive.current) setPhase('idle')
      })
  }

  if (!cwd) {
    return <div className="prc prc--muted">작업 폴더가 없어 PR을 불러오지 않았어요</div>
  }

  return (
    <div className="prc" data-testid="pr-card">
      {!read && <div className="prc-muted">{loading ? 'PR 불러오는 중…' : ''}</div>}
      {read && !read.ok && <div className={read.otherRepo ? 'prc-muted' : 'prc-err'}>{read.error}</div>}
      {pr && (
        <>
          <div className="prc-head">
            <span className="prc-num">#{pr.number}</span>
            <span className="prc-title">{pr.title}</span>
          </div>
          <div className="prc-meta">
            <span className="prc-ref">{`${pr.baseRef} ← ${pr.headRef}`}</span>
            <span className="prc-sha" title={pr.headSha}>{shortSha(pr.headSha)}</span>
          </div>
          {pr.checks.length > 0 && (
            <ul className="prc-checks">
              {pr.checks.map((c) => (
                <li key={c.name} className={`prc-check prc-check--${c.result}`}>
                  <span className="prc-check-name">{c.name}</span>
                  <span className="prc-check-res">{checkLabel(c.result)}</span>
                </li>
              ))}
            </ul>
          )}
          {pr.reasons.length > 0 && (
            <ul className="prc-reasons">
              {pr.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {pr.notes.map((n) => (
            <div key={n} className="prc-note">{n}</div>
          ))}
          {phase === 'confirm' && (
            <div className="prc-confirm" role="group" aria-label="병합 확인">
              <div className="prc-confirm-text">{confirmText(pr)}</div>
              <div className="prc-actions">
                <button type="button" className="prc-btn pri" disabled={loading} onClick={merge}>확인</button>
                <button type="button" className="prc-btn" onClick={() => setPhase('idle')}>취소</button>
              </div>
            </div>
          )}
          {phase === 'merging' && <div className="prc-muted">병합 진행 중…</div>}
          {outcome && (
            <div className={outcome.status === 'merged' || outcome.status === 'enqueued' ? 'prc-ok' : 'prc-err'}>
              {mergeOutcomeText(outcome)}
            </div>
          )}
        </>
      )}
      <div className="prc-actions">
        {pr && (
          <button
            type="button"
            className="prc-btn pri"
            disabled={!pr.canMerge || spent || loading || phase !== 'idle'}
            onClick={() => setPhase('confirm')}
          >
            병합
          </button>
        )}
        <button type="button" className="prc-btn" disabled={loading || phase === 'merging'} onClick={load}>
          다시 읽기
        </button>
      </div>
    </div>
  )
}
