// M09 G4 루프 화면 — 작업 저장소 하나를 골라 앱 안 마일스톤 루프를 열고, 시작하고, 사람 게이트에 답한다.
// 상태는 main 구동자(main/05_Loop/loopDriver.ts)가 준 한 장(LoopStatus)뿐이다. 화면은 상태를 만들지 않고 받은 값을 보인다.
//   · 받기: 화면이 뜰 때 loop.status, 그 뒤 loop.state push. 다른 저장소의 push는 버린다.
//   · 호출 응답의 상태는 그 호출 중에 이 저장소의 push가 오지 않았을 때만 쓴다 — 구동자는 밀려난 계산을 push 없이
//     부른 쪽에만 돌려주므로(publish), 응답이 그 사이 온 push보다 낡을 수 있다.
//   · 화면을 닫는 것은 루프를 닫지 않는다(구독만 푼다). 루프 닫기는 「루프 닫기」 버튼(loop.close)이다.
// 병합의 길은 마일스톤 PR 카드(08_Git PrCard)의 「병합」 버튼 하나다 — 이 화면은 병합을 부르지 않는다(헌법 10조).
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { LoopCard, LoopCardResponse, LoopStatus } from '@shared/ipcContract'
import { ipc } from '@renderer/01_Ipc'
import { PrCard } from '@renderer/08_Git'
import { DIALOG_LAYER, QuestionModal } from '@renderer/03_Agent/prompt'
import { IconX } from '@renderer/02_Common/icons'
import { ApprovalCard, CardList, ExceptionBar, GoalList, LatchCard } from './LoopCards'
import { APPROVE_EVIDENCE, PHASE_LABEL, RESUME_EVIDENCE, errText, sameCwd } from './loopModel'
import './LoopScreen.css'

export interface LoopScreenProps {
  // 앱 껍데기가 기억하는 마지막 저장소 — 화면을 다시 열면 그 저장소의 상태부터 읽는다
  initialCwd: string | null
  onCwdChange: (cwd: string) => void
  onClose: () => void
}

type Where = 'top' | 'resume' | 'cards' | 'approval' | 'latch'
type Errors = Partial<Record<Where, string>>

const CARD_REFUSED = '카드 답이 받아지지 않았어요 — 세션이 이미 끝났거나 카드가 바뀌었을 수 있어요'

export function LoopScreen({ initialCwd, onCwdChange, onClose }: LoopScreenProps): JSX.Element {
  const [cwd, setCwd] = useState<string | null>(initialCwd)
  const [status, setStatus] = useState<LoopStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [milestoneId, setMilestoneId] = useState('')
  const [asking, setAsking] = useState<string | null>(null)
  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set())
  const cwdRef = useRef<string | null>(initialCwd)
  const busyRef = useRef(false)
  const pushSeq = useRef(0)
  const alive = useRef(true)
  // 다른 호출이 도는 동안 고른 질문 답의 대기열(G4 검수 사소 8) — 버리지 않고 앞 호출이 끝난 뒤 하나씩 보낸다
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

  // push 구독 — 화면이 떠 있는 동안만
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

  // 저장소가 정해지면 지금 한 장을 읽는다
  useEffect(() => {
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

  // 사람이 Esc로 화면을 닫는다 — 질문 창이 떠 있으면 그 창의 Esc(내려두기·건너뛰기)에 맡긴다
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && asking === null) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [asking, onClose])

  // 호출 하나 — 요청 중에는 버튼을 끄고, throw는 그 자리의 사유로 보인다. fresh는 호출 중 push가 없었다는 뜻이다.
  // 끝나면 대기열의 질문 답을 하나 보낸다.
  const run = async <R,>(where: Where, call: (c: string) => Promise<R>, done: (r: R, fresh: boolean) => void): Promise<void> => {
    const c = cwdRef.current
    if (c === null || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(where, null)
    const before = pushSeq.current
    try {
      const r = await call(c)
      if (!alive.current || !sameCwd(c, cwdRef.current)) return
      done(r, pushSeq.current === before)
    } catch (e) {
      if (alive.current) setError(where, errText(e))
    } finally {
      busyRef.current = false
      if (alive.current) {
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
      cwdRef.current = res.path
      setCwd(res.path)
      setStatus(null)
      setErrors({})
      setAnswered(new Set())
      setAsking(null)
      queued.current = []
      onCwdChange(res.path)
    } catch (e) {
      if (alive.current) setError('top', errText(e))
    }
  }

  // 루프를 열기·닫기·다시 열기 할 때 답한 표시를 비운다(G4 확인 검수) — 닫으면 그 세션의 카드는 거둬지고, 다시 연 뒤의
  // 새 세션 카드가 옛 표시에 가려지지 않게 한다. 호출을 보내기 전에 비운다(열기 도중 뜬 새 카드에 낸 답의 표시를 지우지 않게).
  const clearAnswered = (): void => setAnswered(new Set())
  const open = (): void => void run('top', (c) => { clearAnswered(); return ipc.loop.open({ cwd: c }) }, apply)
  const start = (): void => void run('top', (c) => ipc.loop.start({ cwd: c, milestoneId: milestoneId.trim() }), apply)
  const closeLoop = (): void =>
    void run('top', async (c) => {
      clearAnswered()
      await ipc.loop.close({ cwd: c })
      return ipc.loop.status({ cwd: c })
    }, apply)
  // 진행 불가에서 빠져나가는 길(G4 검수 사소 7) — 루프를 닫고 다시 연다(컨트롤 설정 같은 원인을 고친 뒤)
  const reopen = (): void =>
    void run('top', async (c) => {
      clearAnswered()
      await ipc.loop.close({ cwd: c })
      return ipc.loop.open({ cwd: c })
    }, apply)
  const resume = (): void =>
    void run('resume', (c) => ipc.loop.decide({ cwd: c, verdict: 'pass', evidence: RESUME_EVIDENCE, ...expectNode() }), decided('resume'))
  const approve = (sha: string): void =>
    void run('approval', (c) => ipc.loop.decide({ cwd: c, verdict: 'pass', evidence: APPROVE_EVIDENCE, specSha256: sha, ...expectNode() }), decided('approval'))
  // 스펙 파일이 없으면 해시 없이 반려한다(G4 검수 I3 — main은 해시 없는 반려만 받는다)
  const reject = (sha: string | null, reason: string): void =>
    void run('approval', (c) => ipc.loop.decide({
      cwd: c, verdict: 'fail', evidence: reason, ...(sha !== null ? { specSha256: sha } : {}), ...expectNode(),
    }), decided('approval'))
  const release = (token: string): void =>
    void run('latch', (c) => ipc.loop.releaseLatch({ cwd: c, token }), decided('latch'))
  // 대기열에 넣을 때 미리 답한 표시를 하므로, 보내기가 throw하거나 받아지지 않으면 표시를 되돌린다(G4 확인 검수) —
  // 카드가 남아 있으면 사람이 다시 답할 수 있다. throw의 사유는 run이 그 자리(cards)에 보인다.
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
    void run('top', (c) => ipc.loop.cancelSession({ cwd: c }), (r) => {
      if (!r.ok) setError('top', '취소할 세션이 없어요')
    })

  const phase = status?.phase ?? null
  const canOpen = cwd !== null && (status === null || phase === 'closed' || phase === 'open-failed')
  const canStart = status !== null && (phase === 'not-started' || (phase === 'blocked' && status.milestoneId === null))
  const canClose = status !== null && phase !== 'closed'
  const found = asking === null ? undefined : status?.cards.find((c) => c.requestId === asking)
  const askingCard = found && found.kind === 'question' ? found : null

  return (
    <div className="modal-overlay loop-overlay">
      <div className="loop-modal" role="dialog" aria-modal="true" aria-label="마일스톤 루프">
        <div className="loop-head">
          <span className="loop-title">마일스톤 루프</span>
          {phase !== null && <span className="loop-phase" data-phase={phase}>{PHASE_LABEL[phase]}</span>}
          <button type="button" className="loop-close" aria-label="화면 닫기" title="화면 닫기 (Esc) — 루프는 그대로 돈다" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>

        <div className="loop-body">
          <section className="loop-sec" aria-label="작업 저장소">
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
          </section>

          {status !== null && (
            <>
              <ExceptionBar status={status} busy={busy} onResume={resume} onReopen={reopen} error={errors.resume ?? null} />

              {(status.milestoneId !== null || status.node !== null) && (
                <section className="loop-sec" aria-label="지금 노드">
                  <dl className="loop-facts">
                    {status.milestoneId !== null && (<><dt>마일스톤</dt><dd className="loop-mono">{status.milestoneId}</dd></>)}
                    {status.node !== null && (
                      <>
                        <dt>지금 노드</dt>
                        <dd><span className="loop-mono">{status.node}</span>{status.nodeTitle !== null && <span className="loop-node-title">{status.nodeTitle}</span>}</dd>
                      </>
                    )}
                    {status.base !== null && (<><dt>기준 브랜치</dt><dd className="loop-mono">{status.base}</dd></>)}
                    {status.ghRepo !== null && (<><dt>저장소</dt><dd className="loop-mono">{status.ghRepo}</dd></>)}
                    <dt>판정</dt>
                    <dd>
                      <span>{`FAIL ${status.failCount}`}</span>
                      {status.lastVerdict !== null && (
                        <span className="loop-muted loop-verdict">{`마지막 ${status.lastVerdict.node} ${status.lastVerdict.verdict}`}</span>
                      )}
                    </dd>
                  </dl>
                </section>
              )}

              {status.sessionActive && (
                <div className="loop-actions loop-session">
                  <span className="loop-muted">세션이 떠 있어요</span>
                  <button type="button" className="loop-btn" disabled={busy} onClick={cancelSession}>세션 취소</button>
                </div>
              )}

              <CardList
                cards={status.cards}
                answered={answered}
                busy={busy}
                onAsk={(c) => setAsking(c.requestId)}
                onPermission={(c, behavior) => answer(c, { kind: 'permission', behavior })}
                error={errors.cards ?? null}
              />

              {status.approval !== null && (
                <ApprovalCard
                  key={status.approval.sha256 ?? 'none'}
                  approval={status.approval}
                  busy={busy}
                  onApprove={() => { if (status.approval?.sha256) approve(status.approval.sha256) }}
                  onReject={(reason) => { if (status.approval) reject(status.approval.sha256, reason) }}
                  error={errors.approval ?? null}
                />
              )}

              {status.latch !== null && (
                <LatchCard
                  key={status.latch.token}
                  latch={status.latch}
                  busy={busy}
                  onRelease={() => { if (status.latch) release(status.latch.token) }}
                  error={errors.latch ?? null}
                />
              )}

              {status.milestonePr !== null && (
                <section className="loop-sec" aria-label="마일스톤 PR">
                  <h3 className="loop-h">마일스톤 PR</h3>
                  <PrCard key={`${status.root ?? cwd ?? ''}#${status.milestonePr}`} cwd={status.root ?? cwd} number={status.milestonePr} />
                </section>
              )}

              <GoalList goals={status.goals} />
            </>
          )}
        </div>
      </div>

      {/* 루프 오버레이(z 60) 안에 그려진다 — 대화·패널 질문 창(z 80)보다 아래 층이다 */}
      <QuestionModal
        layer={DIALOG_LAYER.loop}
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
    </div>
  )
}

export default LoopScreen
