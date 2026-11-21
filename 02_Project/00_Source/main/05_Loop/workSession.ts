// 작업 노드 세션 포트(ports.SessionPort)의 실물. 노드마다 새 세션을 기존 03_Agent 백엔드로 연다.
//   - 프롬프트: 템플릿 노드의 지시와 그 노드가 고른 생존 문서(경로 머리 + 본문)만. 마일스톤 id·goal 제목 같은 다른 맥락은 없다.
//     단, 세션은 앱 세션과 같은 설정 출처(user·project·local)를 읽는다 — 작업 저장소와 사용자의 CLAUDE.md는 그쪽 몫이다.
//     사용자 MCP 서버는 루프 잠금이 붙은 세션에서 읽지 않는다(sdkOptions의 strictMcpConfig).
//   - 실행 입력: 앱 「자동」 모드(picker id auto), cwd는 작업 저장소, 환경은 자격 없는 자식 환경, 루프 잠금 노드(loopLock.ts).
//     잠금은 claude-code 백엔드의 SDK 옵션에서만 붙으므로 다른 백엔드는 열지 않는다(fail-closed).
//   - 결과: done이면 ok:true(요약은 마지막 메시지 한 줄). error가 하나라도 있었거나, done 없이 끝났거나, 시간 초과면 ok:false.
//     취소(실행기 닫기 신호·화면의 취소)는 ok:false에 cancelled:true다 — 실행기는 FAIL로 세지 않고 멈춘다.
// 메인 노드(role main, 브레인스토밍)는 사람과 이야기하는 세션이다.
//   - 카드(질문·권한)는 화면 응답자(mainCard)로 간다. 맥락으로 노드 id·goal id·그 세션의 최근 글, 세션이 끝나면 꺼지는 신호를 준다
//     (화면이 남은 카드를 거둔다). 시간 상한이 없다 — 사람이 화면에서 취소한다(cancel).
//   - 작업자 노드(role worker)의 카드는 거부·무응답(onCard로 바꿔 끼울 수 있다), 시간 상한이 있다.
// 세션 한 번을 돌리는 고리(runNodeSession)는 검수 세션(reviewSession.ts)과 함께 쓴다.
import { randomBytes } from 'node:crypto'
import type { AgentBackend, AgentRun, AgentRunInput, RunResponse } from '@main/03_Agent/AgentBackend'
import type { AgentEvent } from '@shared/agentEvents'
import type { LoopSessionTag } from '@shared/13_Loop/loop'
import type { SessionPort, WorkRequest, WorkResult } from './ports'
import { DOCS, goalDocPath } from './survivalDocs'
import type { DocKind } from './template'

export const DEFAULT_SESSION_TIMEOUT_MS = 60 * 60_000
const SUMMARY_MAX = 300

export type CardEvent = Extract<AgentEvent, { type: 'permission_request' | 'question_request' }>
// 카드 맥락 — signal은 그 세션이 끝나면 꺼진다(응답이 더는 쓰이지 않는다).
export interface CardContext { node: string; goal: string | null; text: string; signal: AbortSignal }
export type CardResponder = (ev: CardEvent, ctx: CardContext) => RunResponse | Promise<RunResponse>

export interface WorkSessionOptions {
  backend: AgentBackend
  // 작업 저장소 뿌리 — 세션 cwd이자 잠금의 저장소 뿌리
  cwd: string
  // 자격 없는 자식 환경(childEnv.ts)
  env: NodeJS.ProcessEnv
  // 앱 영역 — 잠금이 이 폴더 쓰기를 막는다
  appLoopDir: string
  // 작업자 노드 세션의 시간 상한. 메인 노드에는 걸지 않는다
  timeoutMs?: number
  model?: string
  effort?: string
  // 실행기를 닫을 때 돌고 있는 세션을 멈춘다
  signal?: AbortSignal
  // 작업자 노드의 카드 응답자. 기본은 거부·무응답
  onCard?: CardResponder
  // 메인 노드의 카드 응답자(화면). 없으면 메인 노드도 onCard·기본을 쓴다
  mainCard?: CardResponder
  // 화면이 세션 진행을 볼 수 있게 이벤트를 세션 꼬리표(kind work, 앱이 정한 key, 노드·goal, SDK 세션 id)와 함께 흘린다
  onEvent?: (e: AgentEvent, tag: LoopSessionTag) => void
  // 메인 노드(role main)를 메인 대화(mainChat.brainstorm)로 보낸다. 주면 메인 노드에 세션을 열지 않는다
  mainWork?: (req: WorkRequest) => Promise<WorkResult>
}

// 세션 꼬리표의 key는 구동자 수명 동안 겹치지 않는 앱 이름(`<무작위 접두>.<차례>`)이다 — 노드 세션 탭이 같은 길을 쓴다.
const SESSION_KEY_PREFIX = randomBytes(3).toString('hex')
let sessionKeySeq = 0
export const nextSessionKey = (): string => `${SESSION_KEY_PREFIX}.${++sessionKeySeq}`

// 세션의 사건을 꼬리표와 함께 넘기는 고리. session 사건을 보면 그 id를 꼬리표에 싣는다(그 사건부터).
export function taggedEvents(
  onEvent: ((e: AgentEvent, tag: LoopSessionTag) => void) | undefined,
  tag: Omit<LoopSessionTag, 'sessionId'>,
): ((e: AgentEvent) => void) | undefined {
  if (!onEvent) return undefined
  let sessionId: string | null = null
  return (e) => {
    if (e.type === 'session') sessionId = e.sessionId
    onEvent(e, { ...tag, sessionId })
  }
}

const DOC_LABEL: Record<DocKind, string> = {
  milestoneSpec: '마일스톤 스펙',
  goal: 'goal 문서',
  decisions: '결정 대장',
  verification: '검증 기록',
}

function docPathOf(kind: DocKind, req: WorkRequest): string | null {
  if (kind === 'goal') return req.goal ? goalDocPath(req.goal.id) : null
  return kind === 'milestoneSpec' ? DOCS.milestoneSpec : kind === 'decisions' ? DOCS.decisions : DOCS.verification
}

// 메인 노드 세션은 한 턴이다. 일반 글로 묻고 턴을 끝내면 사람이 답할 길 없이 세션이 끝난다
// (사용자 설정의 「결정 요청은 글로」 규칙을 따른 실제 모델이 그렇게 끝냈다). 묻는 길을 질문 도구 하나로 못 박는다.
// 템플릿 지시가 아니라 여기에 두는 것은 템플릿 해시를 바꾸지 않기 위해서다(진행 중 실행 상태가 다시 열린다).
export const MAIN_NODE_RULE = [
  '## 이 세션에서 사람과 이야기하는 법',
  '',
  '- 이 세션은 한 턴이다. 턴을 끝내면 세션이 끝나고, 사람은 일반 글에 답할 수 없다.',
  '- 사람에게 묻는 것은 모두 AskUserQuestion 도구로 한다. 사용자 설정이 글로 묻는 형식을 정해 두었어도 이 세션에서는 도구로만 묻는다.',
  '- 받은 답은 결정 대장에 바로 적는다. 세션이 중간에 끝나도 다음 세션이 같은 질문을 다시 하지 않게 하기 위해서다.',
  '- 모호한 곳이 없어질 때까지 도구로 묻고 답을 받은 뒤, 이번 대화의 내용으로 마일스톤 스펙 파일과 결정 대장을 갱신하고 나서야 턴을 끝낸다. 스펙이 이미 있어도(반려 뒤 다시 도는 경우 포함) 이번 대화를 반영한다.',
].join('\n')

// 노드가 고른 문서 종(node.docs)의 순서로만 싣는다 — req.docs에 다른 종이 있어도 넣지 않는다.
// 메인 대화(mainChat.ts)의 브레인스토밍 여는 턴도 이 꼴을 쓴다(규칙은 그쪽이 붙인다).
// 직전 FAIL 문장(visit.failed)이 있으면 끝에 싣는다.
export function buildNodePrompt(req: WorkRequest): string {
  const parts = [req.node.instruction.trim()]
  for (const kind of req.node.docs) {
    const p = docPathOf(kind, req)
    const body = req.docs[kind]
    parts.push(`## ${DOC_LABEL[kind]}${p ? ` (${p})` : ''}\n\n${body ?? '(아직 없음)'}`)
  }
  if (req.visit?.failed) parts.push(`## 직전 시도의 FAIL\n\n이 노드의 앞 세션이 FAIL로 끝났다 — ${req.visit.failed}\n같은 이유로 끝나지 않게 한다.`)
  return parts.join('\n\n')
}

// 사람과 이야기하는 세션인가 — 메인 노드이고 화면 응답자(mainCard)가 있다. 질문 도구 규칙과 카드 응답자가 이 술어 하나를 쓴다.
export const talksToHuman = (req: WorkRequest, mainCard: CardResponder | undefined): boolean => req.node.role === 'main' && mainCard !== undefined

// 사람과 이야기하는 세션에는 끝에 MAIN_NODE_RULE을 붙인다(메인 대화 없이 한 세션으로 도는 길).
export function buildWorkPrompt(req: WorkRequest, asksHuman: boolean): string {
  const body = buildNodePrompt(req)
  return asksHuman ? `${body}\n\n${MAIN_NODE_RULE}` : body
}

export const oneLine = (s: string): string => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > SUMMARY_MAX ? t.slice(0, SUMMARY_MAX - 1) + '…' : t
}

export const denyCards = (ev: CardEvent): RunResponse =>
  ev.type === 'question_request' ? { kind: 'question', answers: null } : { kind: 'permission', behavior: 'deny' }

// 세션 한 번의 끝. text는 마지막 최상위 메시지의 전문이다(검수 세션이 마지막 줄을 읽는다).
type SessionEnd =
  | { kind: 'done'; text: string }
  | { kind: 'error'; text: string; error: string }
  | { kind: 'cancelled'; text: string }
  | { kind: 'timeout'; text: string; timeoutMs: number }
  | { kind: 'start-failed'; error: string }

interface NodeSessionInput {
  backend: AgentBackend
  input: AgentRunInput
  // null이면 시간 상한 없음
  timeoutMs: number | null
  signal?: AbortSignal
  onCard: CardResponder
  cardContext: { node: string; goal: string | null }
  onEvent?: (e: AgentEvent) => void
}

// 세션 한 번을 연다. 돌려주는 cancel()은 이 세션을 취소한다(끝났으면 거짓).
export function runNodeSession(s: NodeSessionInput): { done: Promise<SessionEnd>; cancel: () => boolean } {
  if (s.signal?.aborted) return { done: Promise.resolve({ kind: 'cancelled', text: '' }), cancel: () => false }
  let run: AgentRun
  try {
    run = s.backend.start(s.input)
  } catch (e) {
    return { done: Promise.resolve({ kind: 'start-failed', error: e instanceof Error ? e.message : String(e) }), cancel: () => false }
  }
  const ended = new AbortController()
  let settled = false
  let text = ''
  let resolveDone: (r: SessionEnd) => void = () => {}
  const done = new Promise<SessionEnd>((r) => { resolveDone = r })
  const finish = (r: SessionEnd): void => {
    if (settled) return
    settled = true
    if (timer) clearTimeout(timer)
    s.signal?.removeEventListener('abort', onAbort)
    ended.abort()
    try { run.abort() } catch { /* 이미 닫힌 세션 */ }
    resolveDone(r)
  }
  const timer = s.timeoutMs === null ? null : setTimeout(() => finish({ kind: 'timeout', text, timeoutMs: s.timeoutMs as number }), s.timeoutMs)
  const onAbort = (): void => finish({ kind: 'cancelled', text })
  s.signal?.addEventListener('abort', onAbort, { once: true })

  void (async () => {
    let messageId: string | undefined
    let error: string | null = null
    // 최상위 도구 호출 뒤에는 새 메시지다. 그 뒤 글이 오면 새로 쌓고, 글 없이 끝나면 끝의 글은 빈 글이다.
    // 카드의 「최근 글」(ctx.text)은 지우지 않는다 — 질문 도구 호출 앞의 글이 카드에 보여야 한다.
    let afterTool = false
    try {
      for await (const ev of run.events) {
        if (settled) return
        s.onEvent?.(ev)
        if (ev.type === 'text') {
          if (ev.parentToolId !== undefined) continue
          if (afterTool || (ev.messageId !== undefined && ev.messageId !== messageId)) { messageId = ev.messageId; text = '' }
          afterTool = false
          text += ev.delta
        } else if (ev.type === 'tool_call') {
          if (ev.parentToolId === undefined) afterTool = true
        } else if (ev.type === 'error') {
          error ??= ev.message
        } else if (ev.type === 'permission_request' || ev.type === 'question_request') {
          const id = ev.requestId
          const ctx: CardContext = { ...s.cardContext, text, signal: ended.signal }
          let answer: Promise<RunResponse>
          try { answer = Promise.resolve(s.onCard(ev, ctx)) } catch (e) { answer = Promise.reject(e) }
          void answer.then((r) => { if (!settled) run.respond(id, r) }, () => { if (!settled) run.respond(id, denyCards(ev)) })
        } else if (ev.type === 'done') {
          const last = afterTool ? '' : text
          finish(error !== null ? { kind: 'error', text: last, error } : { kind: 'done', text: last })
          return
        }
      }
      finish({ kind: 'error', text, error: error ?? '세션이 끝 표시(done) 없이 닫혔다' })
    } catch (e) {
      finish({ kind: 'error', text, error: e instanceof Error ? e.message : String(e) })
    }
  })()
  return { done, cancel: () => { if (settled) return false; finish({ kind: 'cancelled', text }); return true } }
}

export function createWorkSessionPort(opts: WorkSessionOptions): SessionPort {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS
  let current: (() => boolean) | null = null

  return {
    async runWork(req: WorkRequest): Promise<WorkResult> {
      if (opts.backend.id !== 'claude-code') {
        return { ok: false, summary: `작업 노드 세션은 루프 잠금을 붙일 수 있는 claude-code 백엔드로만 연다 — ${opts.backend.id}` }
      }
      if (opts.signal?.aborted) return { ok: false, summary: '취소됐다 — 세션을 열지 않았다', cancelled: true }
      if (req.node.role === 'main' && opts.mainWork) return opts.mainWork(req)
      const main = talksToHuman(req, opts.mainCard)
      const session = runNodeSession({
        backend: opts.backend,
        input: {
          messages: [{ role: 'user', content: buildWorkPrompt(req, main) }],
          workspaceRoot: opts.cwd,
          mode: 'auto',
          ...(opts.model !== undefined ? { model: opts.model } : {}),
          ...(opts.effort !== undefined ? { effort: opts.effort } : {}),
          env: opts.env,
          loopLock: { repoRoot: opts.cwd, appLoopDir: opts.appLoopDir },
        },
        timeoutMs: main ? null : timeoutMs,
        signal: opts.signal,
        onCard: main ? (opts.mainCard as CardResponder) : (opts.onCard ?? denyCards),
        cardContext: { node: req.node.id, goal: req.goal?.id ?? null },
        onEvent: taggedEvents(opts.onEvent, { key: nextSessionKey(), kind: 'work', node: req.node.id, goal: req.goal?.id ?? null }),
      })
      current = session.cancel
      try {
        const end = await session.done
        switch (end.kind) {
          case 'done': return { ok: true, summary: oneLine(end.text) || '요약 없음' }
          case 'error': return { ok: false, summary: oneLine(`세션 오류 — ${end.error}`) }
          case 'cancelled': return { ok: false, summary: '취소됐다 — 세션을 멈췄다', cancelled: true }
          case 'timeout': return { ok: false, summary: `시간 초과(${Math.round(end.timeoutMs / 1000)}초) — 세션을 취소했다` }
          case 'start-failed': return { ok: false, summary: oneLine(`세션을 열지 못했다 — ${end.error}`) }
        }
      } finally {
        if (current === session.cancel) current = null
      }
    },
    cancel: () => (current ? current() : false),
  }
}
