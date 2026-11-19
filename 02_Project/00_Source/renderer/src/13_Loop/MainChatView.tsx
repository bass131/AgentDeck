// M10 G3 메인 대화 보기 — 작업 폴더 하나의 메인 대화(main/05_Loop/mainChat.ts가 소유)를 그리고 사람의 말·답을 보낸다.
// 작업 폴더만 받는 독립 컴포넌트다 — 지금은 작업 모드 몸체의 가운데에 놓이고, G4가 탭 하나로 그대로 올린다.
//   · 받기: 폴더가 정해지면 loop.mainRead·loop.status, 그 뒤 loop.mainState·loop.state push. 다른 폴더의 push는 버린다.
//     읽기·보내기·새로 열기·깃발 내리기 응답의 보기는 그 호출 중에 이 폴더의 push가 오지 않았을 때만 쓴다(낡은 보기로 되돌아가지 않는다).
//   · 기록: 사람 글(줄 섬·보냄), 메인 글(MarkdownView — 원시 HTML을 그리지 않는다), 사건 줄(종류별 모양 — 깃발과 사람의 이어 가기는 다르다),
//     알림(오류·저장 실패). 그 뒤에 대화 안 카드 — 메인의 질문·권한 카드(다시 묻는 카드 restored)와 스펙 승인 카드(LoopStatus.approval).
//     기록 한 줄은 내용이 같으면 다시 그리지 않고, 쓰는 글은 입력칸(Composer)이 쥔다 — 글자 하나·push 하나에 기록 전체(최대 500줄)를
//     다시 그리지 않는다(G3 독립 검수 중요 2). 모르는 사건 종류는 종류 이름·muted로 그린다(화면이 무너지지 않는다, 중요 1).
//   · 사람 판정은 사람만: 승인·고치기는 승인 카드의 버튼을 사람이 눌렀을 때만 loop.decide로 간다(받은 sha256·expectNode를 그대로 싣는다).
//     메인 글은 버튼·링크 동작을 갖지 않는다 — 어떤 글도 판정·카드 답·깃발·취소를 부르지 못한다.
//   · 일시 정지: 깃발이 올라 있으면 표시와 「이어 가기」 — 깃발만 내린다(loop.lowerFlag, 판정 칸 없음). 멈춘 실행의 사람 이어 가기(decide)는
//     루프 화면의 예외 한 줄에 그대로 있다. 취소는 대상(메인 턴 main / 작업 세션 worker)을 골라 보낸다(Backlog 9·12).
//   · 새 메인 대화는 확인을 한 번 받은 뒤 loop.mainNew다. 화면이 내려가도 대화를 닫지 않는다(구독만 푼다).
import { memo, useCallback, useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import type { LoopCancelTarget, LoopCard, LoopCardResponse, LoopStatus, MainChatItem, MainChatView as ChatView } from '@shared/ipcContract'
import { ipc } from '@renderer/01_Ipc'
import { MarkdownView } from '@renderer/05_Conversation'
import { QuestionModal } from '@renderer/03_Agent/prompt'
import { ApprovalCard } from './LoopCards'
import { errText, sameCwd } from './loopModel'
import { CHAT_APPROVE_EVIDENCE, blockedReason, clockOf, lookOf, sameItem, workSessionLive } from './mainChatModel'
import './LoopScreen.css'
import './MainChat.css'

export interface MainChatViewProps {
  // 작업 폴더(루프 화면에서 고른 저장소). null이면 아무것도 읽지 않는다
  cwd: string | null
}

type Where = 'top' | 'send' | 'cards' | 'approval' | 'flag' | 'cancel' | 'new'
type Errors = Partial<Record<Where, string>>

const CARD_REFUSED = '카드 답이 받아지지 않았어요 — 턴이 이미 끝났거나 카드가 바뀌었을 수 있어요'
const PLACEHOLDER = '메인에게 말하기 — 질문, 「멈춰」, 「이어 가」, 「Backlog로」…'

function ChatItemView({ item }: { item: MainChatItem }): JSX.Element {
  switch (item.kind) {
    case 'user':
      return (
        <div className="mc-msg user" data-item={item.id} data-state={item.state}>
          <div className="mc-text">{item.text}</div>
          <span className="mc-state">{item.state === 'queued' ? '줄 서 있어요' : '보냄'}</span>
        </div>
      )
    case 'assistant':
      return (
        <div className="mc-msg assistant" data-item={item.id}>
          <div className="mc-who">{`메인${item.turn === 'event' ? ' · 사건' : ''} · ${clockOf(item.at)}`}</div>
          <MarkdownView source={item.text} />
        </div>
      )
    case 'event': {
      const look = lookOf(item.event.kind)
      const where = item.event.goal ? `${item.event.goal}/${item.event.node ?? ''}` : item.event.node
      return (
        <div className="mc-evt" data-item={item.id} data-kind={item.event.kind} data-tone={look.tone}>
          <span className="mc-evt-k">{look.label}</span>
          <span className="mc-evt-t">{item.event.text}</span>
          {where !== null && where !== '' && <span className="mc-evt-n">{where}</span>}
        </div>
      )
    }
    case 'notice':
      return <div className="mc-notice" data-item={item.id} role="note">{item.text}</div>
  }
}

// push는 매번 새 객체를 준다 — id와 그리는 칸이 같으면 그 줄을 다시 그리지 않는다
const ChatItem = memo(ChatItemView, (a, b) => sameItem(a.item, b.item))

function ChatCard({ card, done, blocked, onAsk, onPermission }: {
  card: LoopCard
  done: boolean
  blocked: boolean
  onAsk: (card: LoopCard) => void
  onPermission: (card: LoopCard, behavior: 'allow' | 'deny') => void
}): JSX.Element {
  return (
    <div className="mc-card ask" data-testid={`mc-card-${card.requestId}`}>
      <div className="mc-card-hd">
        <span>{card.kind === 'question' ? `질문 ${card.questions.length}개` : '권한 요청'}</span>
        <span className="mc-tag">{card.restored === true ? '다시 묻는 질문' : '네 답이 필요해'}</span>
      </div>
      <div className="mc-card-bd">
        {card.text.trim() !== '' && <div className="mc-card-text">{card.text}</div>}
        {card.kind === 'question' && card.questions.map((q, i) => <div key={i} className="mc-card-q">{q.question}</div>)}
        {card.kind === 'permission' && (
          <div className="loop-perm">
            <span className="loop-mono loop-perm-tool">{card.toolName}</span>
            <span className="loop-mono loop-perm-sum">{card.summary}</span>
          </div>
        )}
        <div className="loop-actions mc-card-btns">
          {done && <span className="loop-muted">답을 보냈어요</span>}
          {card.kind === 'question' ? (
            <button type="button" className="loop-btn pri" disabled={done || blocked} onClick={() => onAsk(card)}>답하기</button>
          ) : (
            <>
              <button type="button" className="loop-btn" disabled={done || blocked} onClick={() => onPermission(card, 'deny')}>거부</button>
              <button type="button" className="loop-btn pri" disabled={done || blocked} onClick={() => onPermission(card, 'allow')}>허용</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// 입력칸 — 쓰는 글(draft)과 보내는 중 표시를 이 컴포넌트가 쥔다. 글자 하나가 기록을 다시 그리지 않는다.
// onSend는 받아졌는지를 돌려준다. 받아지면 입력칸을 비우되, 기다리는 동안 새로 쓴 글은 지우지 않는다(G3 독립 검수 사소 5).
// 폴더가 바뀌어도 쓰던 글은 그대로다(이 컴포넌트를 폴더로 다시 만들지 않는다)
const Composer = memo(function Composer({ blocked, error, onSend }: {
  blocked: string | null
  error: string | undefined
  onSend: (text: string) => Promise<boolean>
}): JSX.Element {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async (): Promise<void> => {
    const raw = draft
    const text = raw.trim()
    if (text === '' || sending || blocked !== null) return
    setSending(true)
    try {
      if (await onSend(text)) setDraft((now) => (now === raw ? '' : now))
    } finally {
      setSending(false)
    }
  }
  // 한글 조합 중의 Enter(isComposing)는 글자를 끝내는 키다 — 보내지 않는다
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    void submit()
  }

  return (
    <div className="mc-composer">
      <textarea
        className="loop-input mc-input"
        aria-label="메인에게 말하기"
        placeholder={PLACEHOLDER}
        value={draft}
        disabled={blocked !== null}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
      />
      <div className="mc-composer-bar">
        <span className="loop-muted mc-why">{blocked ?? 'Enter로 보내고 Shift+Enter로 줄을 바꿔요'}</span>
        <button type="button" className="loop-btn pri" disabled={blocked !== null || sending || draft.trim() === ''} onClick={() => void submit()}>보내기</button>
      </div>
      {error !== undefined && <div className="loop-err">{error}</div>}
    </div>
  )
})

export function MainChatView({ cwd }: MainChatViewProps): JSX.Element {
  const [view, setView] = useState<ChatView | null>(null)
  const [status, setStatus] = useState<LoopStatus | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  const [asking, setAsking] = useState<string | null>(null)
  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set())
  const cwdRef = useRef<string | null>(cwd)
  const mainSeq = useRef(0)
  const stateSeq = useRef(0)
  const busyRef = useRef(false)
  const alive = useRef(true)
  const threadRef = useRef<HTMLDivElement | null>(null)

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
    return () => { alive.current = false }
  }, [])

  // 폴더가 정해지면 구독하고 지금 보기와 상태를 읽는다. 읽기 응답은 그 사이 push가 없었을 때만 쓴다
  useEffect(() => {
    cwdRef.current = cwd
    setView(null)
    setStatus(null)
    setErrors({})
    setAnswered(new Set())
    setAsking(null)
    setConfirmNew(false)
    if (cwd === null) return
    let live = true
    const offMain = ipc.loop.onMainState((v) => {
      if (!sameCwd(v.cwd, cwdRef.current)) return
      mainSeq.current++
      setView(v)
    })
    const offState = ipc.loop.onState((s) => {
      if (!sameCwd(s.cwd, cwdRef.current)) return
      stateSeq.current++
      setStatus(s)
    })
    const m0 = mainSeq.current
    const s0 = stateSeq.current
    ipc.loop.mainRead({ cwd })
      .then((v) => { if (live && mainSeq.current === m0) setView(v) })
      .catch((e: unknown) => { if (live) setError('top', errText(e)) })
    ipc.loop.status({ cwd })
      .then((s) => { if (live && stateSeq.current === s0) setStatus(s) })
      .catch((e: unknown) => { if (live) setError('top', errText(e)) })
    return () => {
      live = false
      offMain()
      offState()
    }
  }, [cwd, setError])

  // 새 글이 오면 기록의 끝을 보인다 — 길이가 아니라 마지막 줄의 id를 본다(상한 500에 닿으면 길이가 그대로다, G3 독립 검수 사소 6)
  const items = view?.items ?? []
  const lastId = items.length > 0 ? items[items.length - 1].id : null
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lastId, view?.cards.length, status?.approval?.sha256])

  // 호출 하나(판정·깃발·취소·새로 열기) — 요청 중에는 그 버튼들을 끈다. freshMain·freshState는 호출 중 그 push가 없었다는 뜻이다
  const run = async <R,>(where: Where, call: (c: string) => Promise<R>, done: (r: R, freshMain: boolean, freshState: boolean) => void): Promise<void> => {
    const c = cwdRef.current
    if (c === null || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(where, null)
    const m0 = mainSeq.current
    const s0 = stateSeq.current
    try {
      const r = await call(c)
      if (!alive.current || !sameCwd(c, cwdRef.current)) return
      done(r, mainSeq.current === m0, stateSeq.current === s0)
    } catch (e) {
      if (alive.current) setError(where, errText(e))
    } finally {
      busyRef.current = false
      if (alive.current) setBusy(false)
    }
  }

  const blocked = blockedReason(cwd, view)
  const expectNode = (): { expectNode?: string } => (status?.node != null ? { expectNode: status.node } : {})

  // 보내기 — 받아졌는지를 입력칸에 돌려준다. 그 사이 폴더가 바뀌었으면 받아진 것으로 치지 않는다(입력칸을 비우지 않는다)
  const send = useCallback(async (text: string): Promise<boolean> => {
    const c = cwdRef.current
    if (c === null) return false
    setError('send', null)
    const m0 = mainSeq.current
    try {
      const r = await ipc.loop.mainSend({ cwd: c, text })
      if (!alive.current || !sameCwd(c, cwdRef.current)) return false
      if (!r.ok) setError('send', r.reason ?? '보내지 못했어요')
      if (mainSeq.current === m0) setView(r.view)
      return r.ok
    } catch (e) {
      if (alive.current) setError('send', errText(e))
      return false
    }
  }, [setError])

  const unmark = (id: string): void =>
    setAnswered((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  // 카드 답은 다른 호출을 기다리지 않는다(질문 창에서 고른 답을 버리지 않는다). 받아지지 않으면 답한 표시를 되돌린다.
  // 응답이 오기 전에 폴더가 바뀌었으면 새 폴더에 옛 폴더의 거부·오류를 보이지 않는다(G3 독립 검수 사소 8)
  const answer = async (card: LoopCard, response: LoopCardResponse): Promise<void> => {
    const c = cwdRef.current
    if (c === null) return
    setError('cards', null)
    setAnswered((prev) => new Set(prev).add(card.requestId))
    try {
      const r = await ipc.loop.answerCard({ cwd: c, requestId: card.requestId, response })
      if (!alive.current || !sameCwd(c, cwdRef.current)) return
      if (!r.ok) {
        unmark(card.requestId)
        setError('cards', CARD_REFUSED)
      }
    } catch (e) {
      if (!alive.current || !sameCwd(c, cwdRef.current)) return
      unmark(card.requestId)
      setError('cards', errText(e))
    }
  }

  const decided = (r: { ok: boolean; reason?: string; status: LoopStatus }, _m: boolean, freshState: boolean): void => {
    if (!r.ok) setError('approval', r.reason ?? '거부됐어요')
    if (freshState) setStatus(r.status)
  }
  const approve = (sha: string): void =>
    void run('approval', (c) => ipc.loop.decide({ cwd: c, verdict: 'pass', evidence: CHAT_APPROVE_EVIDENCE, specSha256: sha, ...expectNode() }), decided)
  // 「이어서 고치기」는 반려다 — 고칠 점이 근거다. 스펙 파일이 없으면 해시 없이 보낸다(main은 해시 없는 반려만 받는다, M09 G4 검수 I3)
  const revise = (sha: string | null, reason: string): void =>
    void run('approval', (c) => ipc.loop.decide({
      cwd: c, verdict: 'fail', evidence: reason, ...(sha !== null ? { specSha256: sha } : {}), ...expectNode(),
    }), decided)
  const lowerFlag = (): void =>
    void run('flag', (c) => ipc.loop.lowerFlag({ cwd: c }), (r, freshMain) => {
      if (!r.ok) setError('flag', r.reason ?? '깃발을 내리지 못했어요')
      if (freshMain) setView(r.view)
    })
  const cancel = (target: LoopCancelTarget): void =>
    void run('cancel', (c) => ipc.loop.cancelSession({ cwd: c, target }), (r) => {
      if (!r.ok) setError('cancel', target === 'main' ? '멈출 메인 턴이 없어요' : '멈출 작업 세션이 없어요')
    })
  const openNew = (): void =>
    void run('new', (c) => ipc.loop.mainNew({ cwd: c }), (r, freshMain) => {
      setConfirmNew(false)
      if (!r.ok) setError('new', r.reason ?? '새 메인 대화를 열지 못했어요')
      if (freshMain) setView(r.view)
    })

  const cards = view?.cards ?? []
  const found = asking === null ? undefined : cards.find((c) => c.requestId === asking)
  const askingCard = found && found.kind === 'question' ? found : null
  const approval = status?.approval ?? null
  const mainBusy = view?.busy ?? false
  const workLive = workSessionLive(status, view)
  const stoppable = mainBusy || workLive

  // 멈출 것(메인 턴·작업 세션)이 모두 사라지면 멈추기 실패 알림도 걷는다 — 버튼 없는 알림이 남지 않는다(G3 독립 검수 사소 4)
  useEffect(() => {
    if (!stoppable && errors.cancel !== undefined) setError('cancel', null)
  }, [stoppable, errors.cancel, setError])

  return (
    <section className="main-chat" aria-label="메인 대화">
      <div className="mc-head">
        <span className="mc-title">메인 대화</span>
        {mainBusy && <span className="mc-chip run" role="status">메인이 답하는 중이에요</span>}
        {!mainBusy && view?.waitingUser === true && <span className="mc-chip you" role="status">메인이 네 말을 기다려요</span>}
        {(view?.queued ?? 0) > 0 && <span className="mc-chip">{`줄 선 글 ${view?.queued ?? 0}개`}</span>}
        <span className="mc-sp" />
        <button type="button" className="loop-btn" disabled={blocked !== null || busy || confirmNew} onClick={() => setConfirmNew(true)}>새 메인 대화</button>
      </div>

      {confirmNew && (
        <div className="mc-bar mc-confirm" role="group" aria-label="새 메인 대화 확인">
          <span>지금 기록을 보관하고 새 메인 대화를 열까요? 메인은 지난 대화를 기억하지 않고 생존 문서로 다시 시작해요.</span>
          <div className="loop-actions">
            <button type="button" className="loop-btn" disabled={busy} onClick={() => setConfirmNew(false)}>그만두기</button>
            <button type="button" className="loop-btn pri" disabled={busy} onClick={openNew}>새로 열기</button>
          </div>
        </div>
      )}
      {errors.top !== undefined && <div className="loop-err mc-err">{errors.top}</div>}
      {errors.new !== undefined && <div className="loop-err mc-err">{errors.new}</div>}

      {view?.paused === true && (
        <div className="mc-bar mc-paused" role="status">
          <span>일시 정지 깃발이 올라 있어요 — 지금 노드가 끝나면 다음 노드로 가지 않아요. 실행 상태와 검증 기록은 그대로예요.</span>
          <div className="loop-actions">
            <button type="button" className="loop-btn pri" disabled={busy || blocked !== null} onClick={lowerFlag}>이어 가기</button>
          </div>
          {errors.flag !== undefined && <div className="loop-err">{errors.flag}</div>}
        </div>
      )}

      {stoppable && (
        <div className="mc-bar mc-cancel">
          <span className="loop-muted">멈출 대상을 골라요</span>
          <div className="loop-actions">
            {mainBusy && <button type="button" className="loop-btn" disabled={busy} onClick={() => cancel('main')}>메인 턴 멈추기</button>}
            {workLive && <button type="button" className="loop-btn" disabled={busy} onClick={() => cancel('worker')}>작업 세션 멈추기</button>}
          </div>
          {errors.cancel !== undefined && <div className="loop-err">{errors.cancel}</div>}
        </div>
      )}

      <div className="mc-thread" ref={threadRef} role="log" aria-label="메인 대화 기록">
        <div className="mc-col">
          {view !== null && items.length === 0 && cards.length === 0 && approval === null && (
            <div className="loop-muted mc-empty">아직 대화가 없어요 — 메인에게 먼저 말을 걸거나, 루프를 시작하면 메인이 브레인스토밍을 열어요.</div>
          )}
          {items.map((item) => <ChatItem key={item.id} item={item} />)}
          {cards.map((c) => (
            <ChatCard
              key={c.requestId}
              card={c}
              done={answered.has(c.requestId)}
              blocked={blocked !== null}
              onAsk={(card) => setAsking(card.requestId)}
              onPermission={(card, behavior) => void answer(card, { kind: 'permission', behavior })}
            />
          ))}
          {errors.cards !== undefined && <div className="loop-err">{errors.cards}</div>}
          {approval !== null && (
            <div className="mc-card approval">
              <ApprovalCard
                key={approval.sha256 ?? 'none'}
                approval={approval}
                busy={busy}
                approveLabel="스펙 승인"
                rejectLabel="이어서 고치기"
                reasonLabel="고칠 점"
                reasonPlaceholder="무엇을 더 고칠지 적어요 — 메인이 이어서 고쳐요"
                onApprove={() => { if (approval.sha256) approve(approval.sha256) }}
                onReject={(reason) => revise(approval.sha256, reason)}
                error={errors.approval ?? null}
              />
            </div>
          )}
        </div>
      </div>

      <Composer blocked={blocked} error={errors.send} onSend={send} />

      <QuestionModal
        open={askingCard !== null}
        questions={askingCard?.questions ?? []}
        source="메인 대화"
        onAnswer={(answers) => {
          setAsking(null)
          if (askingCard) void answer(askingCard, { kind: 'question', answers })
        }}
        onDismiss={() => {
          setAsking(null)
          if (askingCard) void answer(askingCard, { kind: 'question', answers: null })
        }}
      />
    </section>
  )
}

export default MainChatView
