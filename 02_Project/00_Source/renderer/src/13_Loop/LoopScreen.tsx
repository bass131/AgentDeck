// 병합은 PrCard의 「병합」 버튼으로만 한다(헌법 10조). 호출 응답의 상태는 그 사이 push가 없었을 때만 쓴다 — 응답이 push보다 낡을 수 있다
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { LoopCard, LoopCardResponse, LoopStatus } from '@shared/ipcContract'
import { ipc } from '@renderer/01_Ipc'
import { PrCard } from '@renderer/08_Git'
import { QuestionModal } from '@renderer/03_Agent/prompt'
import { CardList, ExceptionBar, GoalList, LatchCard } from './LoopCards'
import { GOAL_STATUS_LABEL, MARKER_LABEL, PHASE_LABEL, RESUME_EVIDENCE, VERDICT_LABEL, errText, exceptionLine, sameCwd } from './loopModel'
import { clockOf, workSessionLive } from './mainChatModel'
import { rowLabel } from './sessionLogModel'
import { decisionsOf, goalProgress } from './workModel'
import { alertsOf, useAlertStore } from './alertStore'
import './LoopScreen.css'

export interface StatusBoardProps {
  cwd: string | null
  onCwdChange: (cwd: string) => void
  onOpenSession?: (key: string) => void
  onOpenMain?: () => void
}

type Where = 'top' | 'resume' | 'cards' | 'latch'
type Errors = Partial<Record<Where, string>>

const CARD_REFUSED = '카드 답이 받아지지 않았어요 — 세션이 이미 끝났거나 카드가 바뀌었을 수 있어요'

export function StatusBoard({ cwd, onCwdChange, onOpenSession, onOpenMain }: StatusBoardProps): JSX.Element {
  const [status, setStatus] = useState<LoopStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [milestoneId, setMilestoneId] = useState('')
  const [asking, setAsking] = useState<string | null>(null)
  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set())
  const allAlerts = useAlertStore((s) => s.alerts)
  const cwdRef = useRef<string | null>(cwd)
  const busyRef = useRef(false)
  // 폴더가 바뀔 때마다 오른다 — 옛 폴더 호출의 끝·오류·바쁨 풀기는 새 폴더에 닿지 않는다
  const folderGen = useRef(0)
  const pushSeq = useRef(0)
  const alive = useRef(true)
  // 다른 호출이 도는 동안 고른 질문 답을 버리지 않고 앞 호출이 끝난 뒤 하나씩 보낸다
  const queued = useRef<{ card: LoopCard; response: LoopCardResponse }[]>([])
  const drain = useRef<() => void>(() => {})

  const setError = useCallback((where: Where, text: string | null): void => {
    setErrors((prev) => {
      const next = { ...prev }
      if (text === null) delete next[where]
      else next[where] = text
      return next
    })
  }, [])

  useEffect(() => {
    alive.current = true
    const off = ipc.loop.onState((s) => {
      if (!sameCwd(s.cwd, cwdRef.current)) return
      pushSeq.current++
      setStatus(s)
    })
    return () => {
      alive.current = false
      off()
    }
  }, [])

  // 작업 폴더가 바뀌면 그 폴더의 표시를 비우고(답한 표시·질문 창·대기열 포함) 지금 한 장을 읽는다
  useEffect(() => {
    if (!sameCwd(cwd, cwdRef.current) || cwd === null) {
      setStatus(null)
      setErrors({})
      setAnswered(new Set())
      setAsking(null)
      queued.current = []
      folderGen.current++
      busyRef.current = false
      setBusy(false)
    }
    cwdRef.current = cwd
    if (cwd === null) return
    const before = pushSeq.current
    ipc.loop
      .status({ cwd })
      .then((s) => {
        if (!alive.current || !sameCwd(cwd, cwdRef.current) || pushSeq.current !== before) return
        setStatus(s)
      })
      .catch((e: unknown) => {
        if (alive.current && sameCwd(cwd, cwdRef.current)) setError('top', errText(e))
      })
  }, [cwd, setError])

  // 호출 하나 — 요청 중에는 버튼을 끄고, throw는 그 자리의 사유로 보인다. fresh는 호출 중 push가 없었다는 뜻이다.
  // 끝나면 대기열의 질문 답을 하나 보낸다.
  const run = async <R,>(where: Where, call: (c: string) => Promise<R>, done: (r: R, fresh: boolean) => void): Promise<void> => {
    const c = cwdRef.current
    if (c === null || busyRef.current) return
    const gen = folderGen.current
    const mine = (): boolean => alive.current && gen === folderGen.current
    busyRef.current = true
    setBusy(true)
    setError(where, null)
    const before = pushSeq.current
    try {
      const r = await call(c)
      if (mine()) done(r, pushSeq.current === before)
    } catch (e) {
      if (mine()) setError(where, errText(e))
    } finally {
      if (gen === folderGen.current) busyRef.current = false
      if (mine()) {
        setBusy(false)
        drain.current()
      }
    }
  }
  const apply = (s: LoopStatus, fresh: boolean): void => {
    if (fresh) setStatus(s)
  }
  const decided = (where: Where) => (r: { ok: boolean; reason?: string; status: LoopStatus }, fresh: boolean): void => {
    if (!r.ok) setError(where, r.reason ?? '거부됐어요')
    apply(r.status, fresh)
  }
  const expectNode = (): { expectNode?: string } => (status?.node != null ? { expectNode: status.node } : {})

  const pickFolder = async (): Promise<void> => {
    if (busyRef.current) return
    try {
      const res = await ipc.workspace.pickFolder()
      if (!alive.current || res.path === null) return
      onCwdChange(res.path)
    } catch (e) {
      if (alive.current) setError('top', errText(e))
    }
  }

  // 닫으면 그 세션의 카드는 거둬지므로 다시 연 뒤의 새 세션 카드가 옛 답한 표시에 가려지지 않게 비운다.
  // 호출을 보내기 전에 비운다(열기 도중 뜬 새 카드에 낸 답의 표시를 지우지 않게).
  const clearAnswered = (): void => setAnswered(new Set())
  const open = (): void => void run('top', (c) => { clearAnswered(); return ipc.loop.open({ cwd: c }) }, apply)
  const start = (): void => void run('top', (c) => ipc.loop.start({ cwd: c, milestoneId: milestoneId.trim() }), apply)
  const closeLoop = (): void =>
    void run('top', async (c) => {
      clearAnswered()
      await ipc.loop.close({ cwd: c })
      return ipc.loop.status({ cwd: c })
    }, apply)
  // 진행 불가(컨트롤 설정 같은 원인을 고친 뒤)에서 빠져나가는 길
  const reopen = (): void =>
    void run('top', async (c) => {
      clearAnswered()
      await ipc.loop.close({ cwd: c })
      return ipc.loop.open({ cwd: c })
    }, apply)
  const resume = (): void =>
    void run('resume', (c) => ipc.loop.decide({ cwd: c, verdict: 'pass', evidence: RESUME_EVIDENCE, ...expectNode() }), decided('resume'))
  const release = (token: string): void =>
    void run('latch', (c) => ipc.loop.releaseLatch({ cwd: c, token }), decided('latch'))
  // 대기열에 넣을 때 미리 답한 표시를 하므로, 보내기가 throw하거나 받아지지 않으면 표시를 되돌려 다시 답할 수 있게 한다.
  const unmark = (id: string): void =>
    setAnswered((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  const send = (card: LoopCard, response: LoopCardResponse): void =>
    void run('cards', async (c) => {
      try {
        return await ipc.loop.answerCard({ cwd: c, requestId: card.requestId, response })
      } catch (e) {
        unmark(card.requestId)
        throw e
      }
    }, (r) => {
      if (r.ok) setAnswered((prev) => new Set(prev).add(card.requestId))
      else {
        unmark(card.requestId)
        setError('cards', CARD_REFUSED)
      }
    })
  const answer = (card: LoopCard, response: LoopCardResponse): void => {
    if (!busyRef.current) {
      send(card, response)
      return
    }
    queued.current.push({ card, response })
    setAnswered((prev) => new Set(prev).add(card.requestId))
  }
  drain.current = () => {
    const next = queued.current.shift()
    if (next) send(next.card, next.response)
  }
  const cancelSession = (): void =>
    void run('top', (c) => ipc.loop.cancelSession({ cwd: c, target: 'worker' }), (r) => {
      if (!r.ok) setError('top', '취소할 작업 세션이 없어요')
    })

  const phase = status?.phase ?? null
  const canOpen = cwd !== null && (status === null || phase === 'closed' || phase === 'open-failed')
  const canStart = status !== null && (phase === 'not-started' || (phase === 'blocked' && status.milestoneId === null))
  const canClose = status !== null && phase !== 'closed'
  // 메인 대화의 카드는 메인 대화 화면이 답한다 — 구동자 자신의 카드만 남긴다
  const cards = status?.cards.filter((c) => c.inChat !== true) ?? []
  const found = asking === null ? undefined : cards.find((c) => c.requestId === asking)
  const askingCard = found && found.kind === 'question' ? found : null
  const progress = status !== null ? goalProgress(status) : null
  const decisions = status !== null ? decisionsOf(status) : []
  const waiting = status !== null && (exceptionLine(status) !== null || status.latch !== null || cards.length > 0 || decisions.length > 0)
  const goalPrs = status?.goals.filter((g) => g.pr !== null) ?? []
  const boardAlerts = alertsOf(allAlerts, cwd)

  return (
    <section className="status-board" aria-label="현황판">
      <div className="board-body">
        <section className="board-box" aria-label="마일스톤">
          <h3 className="board-h">
            <span>마일스톤</span>
            {phase !== null && <span className="loop-phase" data-phase={phase}>{PHASE_LABEL[phase]}</span>}
          </h3>
          <div className="loop-repo">
            {cwd !== null ? <span className="loop-mono loop-cwd">{cwd}</span> : <span className="loop-muted">작업 저장소를 골라요</span>}
          </div>
          <div className="loop-actions">
            <button type="button" className="loop-btn" disabled={busy} onClick={() => void pickFolder()}>폴더 고르기</button>
            <button type="button" className="loop-btn pri" disabled={!canOpen || busy} onClick={open}>열기</button>
            <button type="button" className="loop-btn" disabled={!canClose || busy} onClick={closeLoop}>루프 닫기</button>
          </div>
          {canStart && (
            <div className="loop-start">
              <input
                className="loop-input"
                aria-label="마일스톤 id"
                placeholder="마일스톤 id (예: M01)"
                maxLength={64}
                value={milestoneId}
                onChange={(e) => setMilestoneId(e.target.value)}
              />
              <button type="button" className="loop-btn pri" disabled={busy || milestoneId.trim() === ''} onClick={start}>시작</button>
            </div>
          )}
          {errors.top !== undefined && <div className="loop-err">{errors.top}</div>}
          {status !== null && (status.milestoneId !== null || status.node !== null) && (
            <dl className="loop-facts" aria-label="지금 노드">
              {status.milestoneId !== null && (<><dt>마일스톤</dt><dd className="loop-mono">{status.milestoneId}</dd></>)}
              {status.node !== null && (
                <>
                  <dt>지금 노드</dt>
                  <dd><span className="loop-mono">{status.node}</span>{status.nodeTitle !== null && <span className="loop-node-title">{status.nodeTitle}</span>}</dd>
                </>
              )}
              {progress !== null && (<><dt>진척</dt><dd>{`목표 ${progress.done}/${progress.total} 끝`}</dd></>)}
              {status.base !== null && (<><dt>기준 브랜치</dt><dd className="loop-mono">{status.base}</dd></>)}
              {status.ghRepo !== null && (<><dt>저장소</dt><dd className="loop-mono">{status.ghRepo}</dd></>)}
              <dt>판정</dt>
              <dd>
                <span>{`실패 ${status.failCount}`}</span>
                {status.lastVerdict !== null && (
                  <span className="loop-muted loop-verdict">{`마지막 ${status.lastVerdict.node} ${VERDICT_LABEL[status.lastVerdict.verdict]}`}</span>
                )}
              </dd>
            </dl>
          )}
        </section>

        {status !== null && (
          <>
            {boardAlerts.map((a) => (
              <section key={a.key} className="board-alert" aria-label="알림" data-level={a.level}>
                <b>{a.level === 'now' ? '사람이 필요해' : '나중에 봐도 돼'}</b>
                <span>{a.text}</span>
              </section>
            ))}
            <section className="board-box" aria-label="기다리는 결정" data-hot={waiting ? 'true' : undefined}>
              <h3 className="board-h"><span>기다리는 결정</span></h3>
              <ExceptionBar status={status} busy={busy} onResume={resume} onReopen={reopen} error={errors.resume ?? null} />
              {status.latch !== null && (
                <LatchCard
                  key={status.latch.token}
                  latch={status.latch}
                  busy={busy}
                  onRelease={() => { if (status.latch) release(status.latch.token) }}
                  error={errors.latch ?? null}
                />
              )}
              <CardList
                cards={cards}
                answered={answered}
                busy={busy}
                onAsk={(c) => setAsking(c.requestId)}
                onPermission={(c, behavior) => answer(c, { kind: 'permission', behavior })}
                error={errors.cards ?? null}
              />
              {decisions.length > 0 && (
                <ul className="board-decs">
                  {decisions.map((d, i) => (
                    <li key={`${d.kind}-${i}`} className="board-dec" data-kind={d.kind}>
                      {d.kind === 'chat' ? (
                        <button type="button" className="board-dec-btn" onClick={() => onOpenMain?.()}>
                          <b>{d.title}</b>
                          <span>{d.text}</span>
                        </button>
                      ) : (
                        <div className="board-dec-btn">
                          <b>{d.title}</b>
                          <span>{d.text}</span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {!waiting && <div className="board-empty">지금 네 손이 필요한 일은 없어</div>}
            </section>

            <section className="board-box" aria-label="목표">
              <h3 className="board-h"><span>목표</span>{status.goals.length > 0 && <small>{status.goals.length}</small>}</h3>
              {status.goals.length > 0 ? <GoalList goals={status.goals} /> : <div className="board-empty">아직 목표가 없어</div>}
            </section>

            <section className="board-box" aria-label="노드 세션">
              <h3 className="board-h"><span>노드 세션</span></h3>
              {status.mainNode || status.sessions.length > 0 ? (
                <ul className="board-nodes">
                  {status.mainNode && (
                    <li className="board-node" data-live="true">
                      <span className="board-pulse" aria-hidden="true" />
                      <div className="board-node-txt">
                        <div>메인 · 브레인스토밍</div>
                        <small>{status.mainWaiting ? '사람의 답을 기다리는 중' : status.mainBusy ? '메인 턴이 도는 중' : '메인 대화'}</small>
                      </div>
                      <button type="button" className="loop-btn" onClick={() => onOpenMain?.()}>열기</button>
                    </li>
                  )}
                  {status.sessions.map((r) => (
                    <li key={r.key} className="board-node" data-live={r.live ? 'true' : 'false'}>
                      <span className={r.live ? 'board-pulse' : 'board-idle'} aria-hidden="true" />
                      <div className="board-node-txt">
                        <div>{rowLabel(r)}</div>
                        <small>{r.live ? '도는 중' : '끝'}</small>
                      </div>
                      <button type="button" className="loop-btn" onClick={() => onOpenSession?.(r.key)}>열기</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="board-empty">돌고 있는 노드 없음</div>
              )}
              {workSessionLive(status, null) && (
                <div className="loop-actions loop-session">
                  <span className="loop-muted">세션이 떠 있어요</span>
                  <button type="button" className="loop-btn" disabled={busy} onClick={cancelSession}>작업 세션 취소</button>
                </div>
              )}
            </section>

            <section className="board-box" aria-label="PR" data-hot={status.milestonePr !== null && phase === 'waiting-human' ? 'true' : undefined}>
              <h3 className="board-h"><span>PR</span></h3>
              {status.milestonePr !== null && (
                <section className="loop-sec" aria-label="마일스톤 PR">
                  <h4 className="loop-h">마일스톤 PR</h4>
                  <PrCard key={`${status.root ?? cwd ?? ''}#${status.milestonePr}`} cwd={status.root ?? cwd} number={status.milestonePr} />
                </section>
              )}
              {goalPrs.length > 0 && (
                <ul className="board-prs">
                  {goalPrs.map((g) => (
                    <li key={g.id} className="board-pr">
                      <span className="loop-mono">{`${g.id} #${g.pr}`}</span>
                      <span className="loop-muted">{GOAL_STATUS_LABEL[g.status]}</span>
                    </li>
                  ))}
                </ul>
              )}
              {status.milestonePr === null && goalPrs.length === 0 && <div className="board-empty">열린 PR이 없어</div>}
            </section>

            <section className="board-box" aria-label="검증 기록">
              <h3 className="board-h"><span>검증 기록</span><small>최근</small></h3>
              {status.recentLines.length > 0 ? (
                <ul className="board-lines">
                  {status.recentLines.map((l, i) => (
                    <li key={`${l.at}-${i}`} className="board-line" data-marker={l.marker}>
                      <span className="board-line-mk">{MARKER_LABEL[l.marker]}</span>
                      <span className="loop-mono">{clockOf(l.at)}</span>
                      <span className="loop-mono">{[l.goal, l.node].filter((x) => x !== null && x !== '').join(' ')}</span>
                      <span className="board-line-txt">{l.sentence}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="board-empty">(아직 없음)</div>
              )}
            </section>
          </>
        )}
      </div>

      {/* 현황판에는 겹침 맥락이 없다 — 질문 창은 대화 질문 창과 같은 층(app, z 80)에 뜬다 */}
      <QuestionModal
        open={askingCard !== null}
        questions={askingCard?.questions ?? []}
        source={askingCard?.node}
        onAnswer={(answers) => {
          setAsking(null)
          if (askingCard) answer(askingCard, { kind: 'question', answers })
        }}
        onDismiss={() => {
          setAsking(null)
          if (askingCard) answer(askingCard, { kind: 'question', answers: null })
        }}
      />
    </section>
  )
}

export default StatusBoard
