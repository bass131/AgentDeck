// 메인 대화 엔진. 작업 폴더마다 하나, main 프로세스가 소유한다(채팅 목록·채팅 경로 agent.run과 무관).
//   - 턴 대기열: 사용자 글·브레인스토밍 여는 턴(start·rejected)·실행기 사건 턴·다시 물은 카드의 답이 한 줄로 서서
//     같은 SDK 세션을 차례로 이어 쓴다(resumeSessionId). 동시에 둘이 돌지 않는다. 턴마다 루프 세션 포트와 같은 입력
//     (자동 모드, 자격 없는 자식 환경, 루프 잠금의 메인 대화 꼴 — 앱 안 도구 서버만, 셸 금지, 브레인스토밍 쓰기 창)을 쓴다.
//   - 브레인스토밍 포트(brainstorm): 실행기가 브레인스토밍 노드를 부를 때마다 판정 대신 상태를 돌려준다.
//     새 방문(키가 다르다)이면 여는 턴을 넣고 방문 처음의 스펙 해시를 적는다. 턴이 돌거나 줄 서 있으면 waiting.
//     스펙이 비지 않았고 방문 처음과 다르면 ok(baseline 동봉 — 실행기가 그것과 대조한다). 아니면 waiting(사람 기다림, FAIL 아님).
//     턴이 끝날 때마다 onTurnEnd로 구동자를 깨운다 — 실행기가 다시 부른다. 대화를 끝내는 길은 스펙 승인 게이트 하나다.
//   - 쓰기 창(canWrite): 방문이 열려 있고(끝나지 않았고) 구동자의 판정(deps.canWrite — 실행기 커서가 그 메인 노드인가)이 참일 때만 참.
//     잠금(loopLock.mainChatToolReason)이 도구 호출마다 묻는다.
//   - 재개: 저장된 세션 id로 이어 간다. 여는 턴은 세션이 받은 뒤(session 사건)에 sent가 되고, 그 전이면 다음 부름에 다시 넣는다.
//     resume한 턴이 session 사건 없이 오류로 끝나면 세션 id가 무효일 수 있다 — 생존 문서를 실어 새 세션으로 한 번 다시 보낸다.
//     새 세션도 session 사건 없이 끝나면(일시적 spawn 실패 꼴) 옛 id를 되돌린다.
//     세션 id를 잃은 장(everSession)의 새 세션에도 생존 문서를 싣는다. 꺼질 때 남은 질문 카드는 다시 묻는다(restored).
//   - 받기 전의 턴: 사용자 글·사건·다시 물은 카드의 답은 세션이 받기(session 사건) 전까지 저장본 대기열 맨 앞에 남고
//     sent가 되지 않는다 — 프로세스가 죽어도 다시 열면 한 번 간다. 받기 전에 닫히면 대기열 맨 앞으로 되돌린다. 오류·멈춤·새 대화로
//     끝난 턴은 다시 줄 세우지 않는다(받지 못하는 백엔드에서 턴이 끝없이 돌지 않게).
//   - 닫기·멈춤: 턴을 꺼낼 때 멈춤 신호를 만들어 세션에 넘긴다 — 생존 문서·도구 서버를 기다리는 틈에도 닫기와 멈춤이
//     듣고, 그 틈에서는 세션을 열지 않는다. 새 메인 대화를 여는 동안에는 대기열을 돌리지 않고, 턴은 시작한 장에만 쓴다.
//   - 저장 실패는 대화에 알림으로 한 번 남긴다(실패가 이어지는 동안 되풀이하지 않는다).
//   - 사람 판정은 사람 몫이다. 메인의 도구(앱 안 도구)는 일시 정지 깃발과 Backlog 한 줄만 바꾼다(mainChatTools).
//     이 모듈은 실행 상태·검증 기록을 쓰지 않는다 — 사건 줄도 이 장에만 남는다.
import fs from 'node:fs'
import type { AgentBackend, AgentRunInput, RunResponse } from '@main/03_Agent/AgentBackend'
import type { AgentEvent } from '@shared/agentEvents'
import type {
  LoopCard, LoopCardResponse, LoopEventItem, LoopSessionTag, MainChatItem, MainChatView, MainTurnKind,
} from '@shared/13_Loop/loop'
import { mainAnswerOf } from '@shared/13_Loop/mainTurn'
import { TASTE_DOC_LABEL, type TasteCut, type TasteDraft, type TastePrNote } from '@shared/14_Taste/taste'
import { repoKeyOf } from './digestStore'
import {
  MAX_ITEMS, archiveRecord, blankRecord, loadRecordSync, mainChatPath, peekRecordSync, saveRecord,
  type MainChatRecord, type StoredTurn,
} from './mainChatStore'
import type { FsPort, WorkRequest, WorkResult } from './ports'
import type { GoalState } from './runState'
import { DOCS, readNodeDocs, sha256Text } from './survivalDocs'
import type { WorkNode } from './template'
import { buildNodePrompt, oneLine, runNodeSession, type CardEvent, type CardContext } from './workSession'

export const MAIN_TOOL_SERVER = 'agentdeck-main'

// 메인 대화의 규칙 — 턴마다 시스템 프롬프트로 싣는다(템플릿 해시를 바꾸지 않게 코드에 둔다).
export const MAIN_CHAT_RULE = [
  '## 너는 이 작업 폴더의 메인이다',
  '',
  '- 사람과 이 대화창에서 여러 턴에 걸쳐 이야기한다. 세션은 이어진다 — 턴을 끝내면 사람의 다음 말을 기다린다. 실패가 아니다.',
  '- 사람 판정은 사람만 한다. 스펙 승인·반려, 멈춘 실행의 이어 가기, 위조 래치 풀기, 검증 판정은 앱 화면의 카드와 버튼으로 사람이 한다. 네가 했다고 말하지 않는다.',
  '- 파일은 읽기만 한다. 쓸 수 있는 것은 브레인스토밍 중의 .agentdeck/milestone-spec.md와 .agentdeck/decisions.md 둘뿐이다. 셸 명령은 쓰지 않는다.',
  `- 앱 안 도구(mcp__${MAIN_TOOL_SERVER}__*): pause(지금 노드가 끝나면 다음 노드로 가지 않게 하는 일시 정지 깃발 — 실행 상태를 바꾸지 않는다), resume(그 깃발만 내린다), append_backlog(.agentdeck/backlog.md에 한 줄), propose_taste_doc(Taste·헌장 문답에서 정리한 문서 초안을 구조로 제안 — 앱이 검사하고 사람의 승인 카드로 확정한다). 사람이 원할 때만 쓴다.`,
  '- 「[실행기 사건]」으로 시작하는 글은 실행기가 보낸 보고다. 사람에게 한두 문장으로 알린다.',
  '- 사람에게 묻는 것은 일반 글이나 AskUserQuestion 도구 어느 쪽이든 된다 — 사람이 이 대화창에서 답한다.',
].join('\n')

// 브레인스토밍 여는 턴에 붙는다
const BRAINSTORM_RULE = [
  '## 브레인스토밍',
  '',
  '- 여러 턴에 걸쳐 사람과 이야기한다. 턴을 끝내면 사람의 답을 기다린다.',
  '- 합의한 답은 그때그때 결정 대장(.agentdeck/decisions.md)에 적는다.',
  '- 마일스톤 스펙 파일(.agentdeck/milestone-spec.md)은 초안이 준비됐을 때만 쓴다. 스펙이 바뀌면 브레인스토밍이 끝나고 사람에게 승인 카드가 뜬다.',
].join('\n')

// 앱은 브랜치를 옮기지 않는다 — 어디에 남았을 수 있는지만 알린다
const interruptedConfirm = (cut: TasteCut | undefined): string =>
  '앱이 꺼질 때 확정 중이었다 — 문서·PR이 생겼는지 확인한 뒤 다시 확정하거나 반려한다'
  + (cut ? `. 작업 트리가 ${cut.branch}에 남았을 수 있다 — 원래 브랜치는 ${cut.original}다(앱은 옮기지 않는다)` : '')

type TasteCard = Extract<LoopCard, { kind: 'taste' }>

// 대리 입력 턴의 글 끝에 붙는다
const PROXY_NOTE = '[대리 입력] 이 글은 사람이 아니라 사람에게 위임받은 대리인이 보냈다. 이 글로 정한 것은 결정 대장에 [USER·위임]으로 적는다.'

export interface MainActions {
  pause(): Promise<string>
  resume(): Promise<string>
  appendBacklog(line: string): Promise<string>
  proposeTasteDoc(draft: TasteDraft): Promise<string>
}

type TasteOutcome<T> = ({ ok: true } & T) | { ok: false; reason: string }
// 확정 중의 기록 — cut은 가른 브랜치를 카드에, openPr·prGone은 마지막으로 연 프로젝트 문서 PR을 다룬다
export interface TasteConfirmCtx {
  cut(cut: TasteCut): void
  openPr: TastePrNote | null
  prGone(): void
}
// 문서 초안 — check는 쓰지 않는 쓰기 검사(통과하면 쓸 원문), confirm은 사람 확정 뒤의 쓰기다
interface TasteDeps {
  check(draft: TasteDraft): Promise<TasteOutcome<{ preview: string }>>
  confirm(draft: TasteDraft, ctx: TasteConfirmCtx): Promise<TasteOutcome<{ summary: string; pr?: TastePrNote }>>
}

export interface MainChatDeps {
  // 작업 저장소 뿌리
  root: string
  // 앱 영역(userData/loop)
  appDataDir: string
  // 자격 없는 자식 환경
  env: NodeJS.ProcessEnv
  backend: AgentBackend
  fs: FsPort
  // 구동자의 쓰기 창 판정 — 실행기 커서가 그 방문의 메인 노드인가
  canWrite(visitKey: string): Promise<boolean>
  actions: MainActions
  // 생존 문서에 싣는 실행 상태 요약
  context(): Promise<string>
  // 턴마다 하나 — 카드 id의 차례(구동자 전역에서 단조 증가)
  nextTurnId(): string
  // 턴이 끝났다(구동자가 실행기를 다시 부른다)
  onTurnEnd?(): void
  // 보기가 바뀌었다(화면 밀어 주기)
  onChange?(): void
  onEvent?(tag: LoopSessionTag, e: AgentEvent): void
  // 새 메인 대화가 장을 바꿨다 — 새 장의 사건보다 먼저 온다
  onNewChat?(): void
  // 턴마다 새 앱 안 도구 서버(SDK mcpServers 값). null이면 싣지 않는다
  buildTools?(): Promise<Record<string, unknown> | null>
  // 없으면 문서 초안을 받지 않는다
  taste?: TasteDeps
  model?: string
  effort?: string
}

export interface MainChat {
  // prompt를 주면 세션에는 그 글이 가고, 대화 기록에는 text가 보인다
  send(text: string, opts?: { proxy?: boolean; prompt?: string }): { ok: boolean; reason?: string }
  // 쓰기 검사를 통과한 초안만 승인 카드로 띄운다. 돌려주는 글은 도구 결과다
  proposeTasteDoc(draft: TasteDraft): Promise<string>
  recordEvent(event: LoopEventItem, speak?: boolean): void
  brainstorm(req: WorkRequest): Promise<WorkResult>
  cards(): LoopCard[]
  answerCard(requestId: string, response: LoopCardResponse): boolean
  newChat(): Promise<{ ok: boolean; reason?: string }>
  // 실행기가 새 실행을 만들었다(start) — 앞 실행의 방문을 잊는다
  resetVisit(): void
  paused(): boolean
  setPaused(on: boolean): void
  busy(): boolean
  waitingUser(): boolean
  brainstorming(): boolean
  view(cwd: string): MainChatView
  // 돌고 있는 턴을 멈춘다(줄 선 턴은 남는다). 돌던 턴이 없으면 거짓
  cancel(): boolean
  idle(): Promise<void>
  close(): Promise<void>
}

interface Turn {
  kind: MainTurnKind
  text: string
  itemId: string | null
  proxy?: boolean
  events?: LoopEventItem[]
  node?: WorkNode
  goal?: GoalState | null
  milestoneId?: string
  visit?: WorkRequest['visit']
}
interface LiveCard { card: LoopCard; turnId: string; resolve: (r: RunResponse) => void }

const TAIL_ITEMS = 12
const TAIL_CHARS = 400
let itemSeq = 0
const newId = (): string => `${Date.now().toString(36)}-${(++itemSeq).toString(36)}`
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

function tailLine(i: MainChatItem): string | null {
  const cut = (s: string): string => (s.length > TAIL_CHARS ? `${s.slice(0, TAIL_CHARS - 1)}…` : s)
  switch (i.kind) {
    case 'user': return `- ${i.proxy === true ? '사람(대리 입력)' : '사람'}: ${cut(i.text)}`
    case 'assistant': return `- 메인: ${cut(i.text)}`
    case 'event': return `- 사건: ${cut(i.event.text)}`
    case 'notice': return null
  }
}

function viewOf(rec: MainChatRecord, cwd: string, root: string | null, chapter: string, extra: Partial<MainChatView>): MainChatView {
  const brainstorming = rec.visit !== null && !rec.visit.done
  return {
    cwd, root, chapter, sessionId: rec.sessionId, items: rec.items, cards: rec.cards,
    busy: false, waitingUser: false, brainstorming, paused: rec.paused, queued: rec.queue.length,
    ...(rec.tastePr ? { tastePr: rec.tastePr } : {}), ...extra,
  }
}

// 닫힌(또는 열리지 않은) 작업 폴더의 보기 — 기록만 읽는다. 남은 질문 카드는 다시 물을 것으로 보인다.
// 장의 키는 실행기가 연 뿌리(실제 경로)다 — 받은 경로의 실제 경로를 먼저 본다(하위 폴더를 주면 찾지 못한다)
export function readMainChatView(appDataDir: string, cwd: string): MainChatView {
  let real = cwd
  try { real = fs.realpathSync(cwd) } catch { /* 없는 경로면 받은 그대로 */ }
  const rec = peekRecordSync(mainChatPath(appDataDir, repoKeyOf(real)), cwd)
    ?? peekRecordSync(mainChatPath(appDataDir, repoKeyOf(cwd)), cwd)
    ?? blankRecord(cwd)
  return viewOf({ ...rec, cards: rec.cards.map((c) => ({ ...c, restored: true })) }, cwd, null, '', {})
}

const storable = (t: Turn): t is Turn & { kind: StoredTurn['kind'] } => t.kind === 'user' || t.kind === 'event' || t.kind === 'card-answer'

export function openMainChat(deps: MainChatDeps): MainChat {
  const repoKey = repoKeyOf(deps.root)
  const file = mainChatPath(deps.appDataDir, repoKey)
  let rec: MainChatRecord = loadRecordSync(file, deps.root) ?? blankRecord(deps.root)
  let chapter = newId()
  // 쓰는 중에 꺼진 초안 카드는 쓰였는지 모른다 — 확정 중을 풀고 사람에게 결과를 확인하게 한다
  rec.cards = rec.cards.map((c) => (c.kind === 'taste' && c.confirming === true
    ? { ...c, restored: true, confirming: false, refused: interruptedConfirm(c.cut) }
    : { ...c, restored: true }))
  const queue: Turn[] = rec.queue.map((t) => ({ ...t }))
  const live = new Map<string, LiveCard>()
  const confirms = new Set<Promise<void>>()
  let running: Promise<void> | null = null
  // 돌고 있는 턴의 멈춤 신호 — 턴을 꺼낼 때 만든다(생존 문서·도구 서버를 기다리는 틈에도 닫기·멈춤이 듣는다)
  let turnAbort: AbortController | null = null
  // 꺼냈지만 세션이 아직 받지 못한 턴 — 저장본의 대기열 맨 앞에 남는다
  let inflight: Turn | null = null
  let closing = false
  // 새 메인 대화를 여는 중 — 대기열을 돌리지 않는다. 그동안 들어온 글·사건(arrived)은 새 장으로 옮긴다
  let resetting = false
  const arrived: string[] = []
  // 저장 실패를 이미 알렸다(실패가 이어지는 동안 다시 알리지 않는다)
  let saveFailed = false
  let writes: Promise<void> = Promise.resolve()
  // 이 프로세스에서 그 방문의 여는 턴을 이미 보냈다(세션이 받지 못하고 끝났어도 다시 넣지 않는다 — 실패하는 백엔드에서 턴이 계속 돌지 않게)
  let openTried: string | null = null
  let lastVisitReq: WorkRequest | null = null

  // 저장본의 대기열 — 받기 전의 턴(inflight)이 맨 앞이다. 여는 턴(start·rejected)은 저장하지 않는다(visit.open으로 다시 넣는다)
  const stored = (): StoredTurn[] => [...(inflight ? [inflight] : []), ...queue]
    .filter(storable)
    .map((t) => ({ kind: t.kind, text: t.text, itemId: t.itemId, ...(t.proxy ? { proxy: true } : {}), ...(t.events ? { events: t.events } : {}) }))

  // 저장 실패는 처음 한 번만 알린다 — 여기서 persist를 부르지 않는다(실패가 되풀이돼도 저장이 저장을 부르지 않게)
  function save(snap: MainChatRecord): void {
    writes = writes.then(() => saveRecord(file, snap)).then(
      () => { saveFailed = false },
      (e: unknown) => {
        if (saveFailed) return
        saveFailed = true
        notice(`대화 기록을 저장하지 못했다 — ${oneLine(errText(e))}. 이대로 앱을 끄면 이 뒤의 기록을 잃을 수 있다.`)
        deps.onChange?.()
      },
    )
  }
  function persist(): void {
    rec.queue = stored()
    if (rec.items.length > MAX_ITEMS) rec.items = rec.items.slice(-MAX_ITEMS)
    save(JSON.parse(JSON.stringify(rec)) as MainChatRecord)
    deps.onChange?.()
  }
  const push = (item: MainChatItem): void => {
    rec.items.push(item)
    if (resetting) arrived.push(item.id)
  }
  const notice = (text: string): void => push({ id: newId(), at: new Date().toISOString(), kind: 'notice', text })
  const brainstorming = (): boolean => rec.visit !== null && !rec.visit.done
  const markSent = (t: Turn): void => {
    if (t.itemId === null) return
    const item = rec.items.find((i) => i.id === t.itemId)
    if (item?.kind === 'user') item.state = 'sent'
  }

  async function canWriteNow(): Promise<boolean> {
    const v = rec.visit
    if (closing || v === null || v.done) return false
    try { return (await deps.canWrite(v.key)) === true } catch { return false }
  }

  // 방문의 여는 턴 — 세션이 있고 반려 사유가 있으면 반려 턴, 아니면 시작 턴(반려 사유는 시작 턴 끝에 붙는다)
  function enqueueOpening(req: WorkRequest, front = false): void {
    const v = rec.visit
    if (v === null || queue.some((t) => t.kind === 'start' || t.kind === 'rejected')) return
    openTried = v.key
    const kind: MainTurnKind = rec.sessionId !== null && v.rejected !== null ? 'rejected' : 'start'
    const turn: Turn = { kind, text: '', itemId: null, node: req.node, goal: req.goal, milestoneId: req.milestoneId, visit: req.visit }
    if (front) queue.unshift(turn)
    else queue.push(turn)
  }

  async function promptOf(t: Turn): Promise<string> {
    switch (t.kind) {
      case 'user':
        return t.proxy ? `${t.text}\n\n${PROXY_NOTE}` : t.text
      case 'card-answer':
        return t.text
      case 'event':
        return ['[실행기 사건]', ...(t.events ?? []).map((e) => `- ${e.text}`), '', '사람에게 한두 문장으로 알려라.'].join('\n')
      case 'rejected':
        return [
          `[스펙 반려] 사람이 마일스톤 스펙을 반려했다 — ${rec.visit?.rejected ?? ''}`,
          '반려 사유를 반영해 사람과 이야기를 이어 가고, 초안이 다시 준비되면 스펙 파일을 고친다.',
        ].join('\n')
      case 'start': {
        const node = t.node as WorkNode
        const docs = await readNodeDocs(deps.fs, node.docs, t.goal?.id ?? null)
        const parts = [buildNodePrompt({ milestoneId: t.milestoneId ?? '', node, goal: t.goal ?? null, docs, visit: t.visit }), BRAINSTORM_RULE]
        if (rec.visit?.rejected) parts.push(`## 스펙 반려\n\n사람이 앞 스펙을 반려했다 — ${rec.visit.rejected}`)
        return parts.join('\n\n')
      }
    }
  }

  async function seeded(prompt: string): Promise<string> {
    let state = ''
    try { state = await deps.context() } catch { state = '(실행 상태를 읽지 못했다)' }
    const spec = await deps.fs.read(DOCS.milestoneSpec).catch(() => null)
    const decisions = await deps.fs.read(DOCS.decisions).catch(() => null)
    const tail = rec.items.map(tailLine).filter((l): l is string => l !== null).slice(-TAIL_ITEMS)
    return [
      '[생존 문서 — 앞 세션을 이어 가지 못해 새 세션을 연다. 아래가 지금까지의 기록이다]',
      `## 실행 상태\n\n${state}`,
      `## 마일스톤 스펙 (${DOCS.milestoneSpec})\n\n${spec ?? '(아직 없음)'}`,
      `## 결정 대장 (${DOCS.decisions})\n\n${decisions ?? '(아직 없음)'}`,
      `## 최근 대화\n\n${tail.length > 0 ? tail.join('\n') : '(없음)'}`,
      '---',
      prompt,
    ].join('\n\n')
  }

  function cardFor(turnId: string): (ev: CardEvent, ctx: CardContext) => Promise<RunResponse> {
    return (ev, ctx) => new Promise<RunResponse>((resolve) => {
      const requestId = `s${turnId}-${ev.requestId}`
      const base = { requestId, node: ctx.node, goal: ctx.goal, text: ctx.text }
      const card: LoopCard = ev.type === 'question_request'
        ? { ...base, kind: 'question', questions: ev.questions }
        : { ...base, kind: 'permission', toolName: ev.toolName, summary: ev.summary }
      live.set(requestId, { card, turnId, resolve })
      // 질문 카드는 도착하자마자 남긴다 — 꺼지면 다시 묻는다. 권한 카드는 그 세션에만 뜻이 있어 남기지 않는다
      if (card.kind === 'question') rec.cards.push(card)
      persist()
    })
  }

  function dropCard(requestId: string): void {
    live.delete(requestId)
    rec.cards = rec.cards.filter((c) => c.requestId !== requestId)
  }

  async function runTurn(t: Turn, signal: AbortSignal): Promise<void> {
    // 턴은 시작한 장에 묶인다 — 새 메인 대화가 장을 갈았으면 옛 세션 id·글을 새 장에 쓰지 않는다
    const own = rec
    const gone = (): boolean => closing || signal.aborted || rec !== own
    // 세션을 열기 전에 멈췄다 — 사람의 멈춤이면 알린다(닫기·새 대화는 알리지 않는다)
    const stopped = (): void => { if (signal.aborted && !closing && !resetting && rec === own) notice('턴을 멈췄다.') }
    const base = await promptOf(t)
    // 새 세션에는 생존 문서를 싣는다 — 시작 턴은 노드 지시와 문서를 이미 싣으므로, 세션 id를 잃은 장(everSession)일 때만
    let seed = rec.sessionId === null && (t.kind !== 'start' || rec.everSession)
    // resume이 세션 사건 없이 오류로 끝나면 새 세션으로 한 번 다시 보낸다(fresh). 저장된 id는 그 새 세션이 받을 때(session 사건)만
    // 바뀐다 — 새 세션도 받지 못하거나 그 전에 꺼지면 옛 id가 그대로다(일시적 spawn 실패로 id를 잃지 않게)
    let fresh = false
    for (let attempt = 0; attempt < 2; attempt++) {
      if (gone()) { stopped(); return }
      const resume = fresh ? null : rec.sessionId
      const prompt = seed ? await seeded(base) : base
      const turnId = deps.nextTurnId()
      let sawSession = false
      const said: AgentEvent[] = []
      // 도구 서버를 만들지 못하면 알린다(규칙 글은 도구를 말하므로 사람이 알아야 한다) — 턴은 도구 없이 돈다
      const tools = deps.buildTools
        ? await deps.buildTools().catch((e: unknown) => { notice(`앱 안 도구를 싣지 못했다 — ${oneLine(errText(e))}`); return null })
        : null
      // 생존 문서·도구 서버를 기다리는 동안 닫혔거나 멈췄으면 세션을 열지 않는다
      if (gone()) { stopped(); return }
      const node = brainstorming() ? (rec.visit?.node ?? 'main') : 'main'
      const input: AgentRunInput = {
        messages: [{ role: 'user', content: prompt }],
        workspaceRoot: deps.root,
        mode: 'auto',
        systemPrompt: MAIN_CHAT_RULE,
        env: deps.env,
        ...(deps.model !== undefined ? { model: deps.model } : {}),
        ...(deps.effort !== undefined ? { effort: deps.effort } : {}),
        ...(resume !== null ? { resumeSessionId: resume } : {}),
        loopLock: { repoRoot: deps.root, appLoopDir: deps.appDataDir, mainChat: { toolServer: MAIN_TOOL_SERVER, canWrite: canWriteNow } },
        ...(tools ? { loopMcpServers: tools } : {}),
      }
      const session = runNodeSession({
        backend: deps.backend,
        input,
        timeoutMs: null,
        signal,
        onCard: cardFor(turnId),
        cardContext: { node, goal: null },
        onEvent: (ev) => {
          if (ev.type === 'session') {
            sawSession = true
            if (rec === own) {
              let changed = false
              // 세션이 받았다 — 이제 보낸 글이다(저장본 대기열에서 빠진다)
              if (inflight === t) { inflight = null; markSent(t); changed = true }
              if (rec.sessionId !== ev.sessionId) { rec.sessionId = ev.sessionId; rec.everSession = true; changed = true }
              if ((t.kind === 'start' || t.kind === 'rejected') && rec.visit && rec.visit.open !== 'sent') { rec.visit.open = 'sent'; changed = true }
              if (changed) persist()
            }
          } else if ((ev.type === 'text' || ev.type === 'tool_call') && ev.parentToolId === undefined) {
            said.push(ev)
          }
          deps.onEvent?.({ key: 'main', kind: 'main', node: node === 'main' ? null : node, goal: null, sessionId: rec.sessionId }, ev)
        },
      })
      const end = await session.done
      // 세션이 끝난 카드는 거둔다. 닫을 때는 질문 카드를 남긴다(다시 묻는다)
      for (const [id, c] of [...live]) {
        if (c.turnId !== turnId) continue
        if (closing) live.delete(id)
        else dropCard(id)
      }
      if (resume !== null && !sawSession && end.kind === 'error' && attempt === 0 && !gone()) {
        fresh = true
        notice(`저장된 세션을 이어 가지 못해(${oneLine(end.error)}) 생존 문서로 새 세션을 연다.`)
        persist()
        seed = true
        continue
      }
      if (rec !== own) return
      const text = mainAnswerOf(said)
      if (text !== '') push({ id: newId(), at: new Date().toISOString(), kind: 'assistant', text, turn: t.kind })
      if (end.kind === 'error') notice(`턴이 오류로 끝났다 — ${oneLine(end.error)}`)
      else if (end.kind === 'start-failed') notice(`턴을 열지 못했다 — ${oneLine(end.error)}`)
      else if (end.kind === 'cancelled' && !closing && !resetting) notice('턴을 멈췄다.')
      if (fresh && !sawSession) notice('새 세션도 열지 못해 저장된 세션 id를 그대로 둔다 — 다음 턴에 다시 이어 간다.')
      return
    }
  }

  function pump(): void {
    if (running !== null || closing || resetting || queue.length === 0) return
    const t = queue.shift() as Turn
    const ac = new AbortController()
    inflight = t
    turnAbort = ac
    persist()
    running = (async () => {
      try {
        await runTurn(t, ac.signal)
      } catch (e) {
        notice(`턴을 돌리지 못했다 — ${oneLine(errText(e))}`)
      } finally {
        const unseen = inflight === t
        inflight = null
        turnAbort = null
        // 세션이 받기 전에 닫혔으면 대기열 맨 앞으로 되돌린다(다음 열기에서 한 번 보낸다). 그 밖의 끝(오류·멈춤·새 대화)은
        // 다시 줄 세우지 않는다 — 받지 못하는 백엔드에서 턴이 끝없이 돌지 않게
        if (unseen && closing && storable(t)) queue.unshift(t)
        else markSent(t)
        running = null
        persist()
        if (!closing) {
          try { deps.onTurnEnd?.() } catch { /* 구동자 쪽 오류는 대기열을 막지 않는다 */ }
          pump()
        }
      }
    })()
  }

  // 확정은 카드를 먼저 잡고(confirming) 쓴다 — 같은 카드의 두 번째 확정·반려는 받지 않는다
  function answerTaste(requestId: string, response: Extract<LoopCardResponse, { kind: 'taste' }>): boolean {
    if (closing) return false
    const card = rec.cards.find((c) => c.requestId === requestId)
    if (card?.kind !== 'taste' || card.confirming === true) return false
    const label = TASTE_DOC_LABEL[card.draft.doc]
    if (response.decision === 'reject') {
      const reason = oneLine(response.reason)
      if (reason === '') return false
      dropCard(requestId)
      const text = [
        `[문서 반려] 사람이 ${label} 초안을 반려했다 — ${reason}`,
        '이유를 반영해 사람과 이야기를 이어 가고, 고친 초안을 propose_taste_doc으로 다시 제안한다.',
      ].join('\n')
      const id = newId()
      push({ id, at: new Date().toISOString(), kind: 'user', text, state: 'queued' })
      queue.push({ kind: 'card-answer', text, itemId: id })
      persist()
      pump()
      return true
    }
    const taste = deps.taste
    if (!taste) return false
    card.confirming = true
    delete card.refused
    delete card.cut
    persist()
    const draft = card.draft
    // 새 메인 대화가 장을 갈았어도 카드는 옮겨 가 있다 — 지금 장에서 id로 다시 찾는다
    const current = (): TasteCard | undefined => rec.cards.find((c): c is TasteCard => c.kind === 'taste' && c.requestId === requestId)
    const ctx: TasteConfirmCtx = {
      cut: (cut) => {
        const now = current()
        if (now) { now.cut = { ...cut }; persist() }
      },
      openPr: rec.tastePr ? { ...rec.tastePr } : null,
      prGone: () => { delete rec.tastePr; persist() },
    }
    const job = (async () => {
      const r = await taste.confirm(draft, ctx).catch((e: unknown) => ({ ok: false as const, reason: errText(e) }))
      const now = current()
      if (r.ok) {
        if (r.pr) rec.tastePr = { ...r.pr }
        dropCard(requestId)
        notice(`${label} 초안을 확정했다 — ${oneLine(r.summary)}`)
      } else {
        if (now) { now.confirming = false; now.refused = oneLine(r.reason) }
        notice(`${label} 초안을 쓰지 않았다 — ${oneLine(r.reason)}`)
      }
      persist()
    })()
    confirms.add(job)
    void job.finally(() => confirms.delete(job))
    return true
  }

  persist()
  pump()

  const api: MainChat = {
    send(text, opts) {
      const body = text.trim()
      if (closing) return { ok: false, reason: '메인 대화가 닫혔다' }
      if (body === '') return { ok: false, reason: '빈 글이다' }
      const id = newId()
      const proxy = opts?.proxy === true ? { proxy: true } : {}
      push({ id, at: new Date().toISOString(), kind: 'user', text: body, state: 'queued', ...proxy })
      queue.push({ kind: 'user', text: opts?.prompt ?? body, itemId: id, ...proxy })
      persist()
      pump()
      return { ok: true }
    },

    async proposeTasteDoc(draft) {
      if (closing) return '메인 대화가 닫혔다'
      if (!deps.taste) return '제안하지 않았다 — 이 메인 대화는 문서 초안을 받지 않는다'
      const r = await deps.taste.check(draft).catch((e: unknown) => ({ ok: false as const, reason: errText(e) }))
      if (!r.ok) return `제안하지 않았다 — ${r.reason}`
      if (closing) return '메인 대화가 닫혔다'
      const label = TASTE_DOC_LABEL[draft.doc]
      // 같은 문서의 앞 초안은 갈음한다(쓰는 중인 카드는 남긴다)
      rec.cards = rec.cards.filter((c) => !(c.kind === 'taste' && c.draft.doc === draft.doc && c.confirming !== true))
      rec.cards.push({ kind: 'taste', requestId: `taste-${newId()}`, node: 'main', goal: null, text: `${label} 초안`, draft, preview: r.preview })
      persist()
      return `${label} 승인 카드를 띄웠다 — 사람이 확정하면 앱이 쓰고, 반려하면 이유가 다음 턴으로 온다. 확정·반려는 사람이 카드로 한다.`
    },

    recordEvent(event, speak = false) {
      if (closing) return
      push({ id: newId(), at: new Date().toISOString(), kind: 'event', event })
      if (speak) {
        const pending = queue.find((q) => q.kind === 'event')
        if (pending) {
          pending.events = [...(pending.events ?? []), event]
          pending.text = (pending.events ?? []).map((e) => e.text).join('\n')
        } else {
          queue.push({ kind: 'event', text: event.text, itemId: null, events: [event] })
        }
      }
      persist()
      if (speak) pump()
    },

    async brainstorm(req) {
      // 닫는 중의 부름은 기다림이다 — 취소(cancelled)는 실행기가 멈춤으로 바꾼다(닫기가 브레인스토밍을 멈추지 않는다)
      if (closing) return { ok: false, summary: '메인 대화가 닫히는 중이다', waiting: true }
      const key = req.visit?.key ?? `${req.milestoneId}#?`
      if (rec.visit === null || rec.visit.key !== key) {
        const spec = await deps.fs.read(DOCS.milestoneSpec)
        rec.visit = { key, node: req.node.id, baselineSpecSha: spec === null ? null : sha256Text(spec), open: 'queued', rejected: req.visit?.rejected ?? null, done: false }
        openTried = null
        persist()
      }
      lastVisitReq = req
      const v = rec.visit
      if (v.open === 'queued' && openTried !== v.key) { enqueueOpening(req); persist(); pump() }
      if (running !== null || queue.length > 0) {
        if (v.done) { v.done = false; persist() }
        return { ok: false, summary: '메인 대화가 턴을 돌고 있다', waiting: true }
      }
      const spec = await deps.fs.read(DOCS.milestoneSpec)
      if (spec !== null && spec.trim() !== '' && sha256Text(spec) !== v.baselineSpecSha) {
        if (!v.done) { v.done = true; persist() }
        return { ok: true, summary: '브레인스토밍에서 스펙 초안을 썼다', baseline: { specSha256: v.baselineSpecSha } }
      }
      if (v.done) { v.done = false; persist() }
      return { ok: false, summary: '브레인스토밍 대화 중 — 사람의 다음 말을 기다린다', waiting: true }
    },

    cards: () => [...rec.cards, ...[...live.values()].map((c) => c.card).filter((c) => c.kind === 'permission')],

    answerCard(requestId, response) {
      if (response.kind === 'taste') return answerTaste(requestId, response)
      const l = live.get(requestId)
      if (l) {
        if (l.card.kind !== response.kind) return false
        dropCard(requestId)
        l.resolve(response as RunResponse)
        persist()
        return true
      }
      const card = rec.cards.find((c) => c.requestId === requestId && c.restored === true)
      if (!card || card.kind !== 'question' || response.kind !== 'question') return false
      dropCard(requestId)
      if (response.answers !== null) {
        const lines = card.questions.map((q, i) => `- 질문: ${q.question}\n  답: ${(response.answers?.[i] ?? []).join(', ') || '(답 없음)'}`)
        const text = ['[다시 물은 질문의 답] 앱을 다시 열기 전에 물은 질문에 사람이 답했다.', ...lines].join('\n')
        const id = newId()
        push({ id, at: new Date().toISOString(), kind: 'user', text, state: 'queued' })
        queue.push({ kind: 'card-answer', text, itemId: id })
      }
      persist()
      pump()
      return true
    },

    async newChat() {
      if (closing) return { ok: false, reason: '메인 대화가 닫혔다' }
      if (resetting) return { ok: false, reason: '새 메인 대화를 여는 중이다' }
      // 여는 동안 대기열을 돌리지 않는다 — 그 사이 들어온 글이 옛 세션을 잇거나 옛 id를 새 장에 쓰지 않게
      resetting = true
      arrived.splice(0)
      try {
        queue.splice(0)
        turnAbort?.abort()
        await api.idle()
        if (closing) return { ok: false, reason: '메인 대화가 닫혔다' }
        try {
          await writes
          await archiveRecord(deps.appDataDir, repoKey, rec)
        } catch (e) {
          return { ok: false, reason: `지난 기록을 보관하지 못했다 — ${errText(e)}` }
        }
        for (const id of [...live.keys()]) live.delete(id)
        const old = rec
        // 여는 동안 들어온 글·사건은 새 장으로 옮긴다 — 줄 선 턴의 itemId가 새 장의 항목을 가리킨다
        const carried = old.items.filter((i) => arrived.includes(i.id) && (i.kind === 'user' || i.kind === 'event'))
        // 문서 초안 카드와 마지막 문서 PR은 세션과 무관해 새 장으로 옮긴다
        rec = {
          ...blankRecord(deps.root), paused: old.paused, visit: old.visit ? { ...old.visit, open: 'queued' } : null,
          cards: old.cards.filter((c) => c.kind === 'taste'),
          ...(old.tastePr ? { tastePr: old.tastePr } : {}),
        }
        chapter = newId()
        deps.onNewChat?.()
        notice('새 메인 대화를 열었다 — 지난 기록은 보관했다.')
        rec.items.push(...carried)
        openTried = null
        if (rec.visit && !rec.visit.done && lastVisitReq && lastVisitReq.visit?.key === rec.visit.key) enqueueOpening(lastVisitReq, true)
        return { ok: true }
      } finally {
        resetting = false
        arrived.splice(0)
        if (!closing) {
          persist()
          pump()
        }
      }
    },

    // 새 실행이 시작됐다 — 장의 방문은 앞 실행의 것이다(방문 키가 같아도 새 방문이다). 줄 선 여는 턴도 거둔다
    resetVisit() {
      rec.visit = null
      openTried = null
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].kind === 'start' || queue[i].kind === 'rejected') queue.splice(i, 1)
      persist()
    },

    paused: () => rec.paused,
    setPaused(on) {
      if (rec.paused === on) return
      rec.paused = on
      persist()
    },
    busy: () => running !== null,
    waitingUser: () => brainstorming() && running === null && queue.length === 0,
    brainstorming,
    view: (cwd) => viewOf(rec, cwd, deps.root, chapter, {
      cards: api.cards(), busy: running !== null, waitingUser: api.waitingUser(), queued: queue.length,
    }),
    // 세션을 열기 전의 틈에서도 듣는다(신호가 세션을 열지 않게 한다)
    cancel: () => {
      if (turnAbort === null || turnAbort.signal.aborted) return false
      turnAbort.abort()
      return true
    },

    async idle() {
      while (running !== null || confirms.size > 0) {
        if (running !== null) await running
        await Promise.all([...confirms])
      }
      await writes
    },

    // 확정 쓰기는 멈추지 않고 끝을 기다린다 — 결과가 카드와 기록에 남아야 다시 열 때 두 번 쓰지 않는다
    async close() {
      if (closing) { await writes; return }
      closing = true
      turnAbort?.abort()
      while (running !== null) await running
      await Promise.all([...confirms])
      rec.queue = stored()
      save(JSON.parse(JSON.stringify(rec)) as MainChatRecord)
      await writes
    },
  }
  return api
}
