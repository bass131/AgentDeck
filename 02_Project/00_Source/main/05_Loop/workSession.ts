// M09 G2 — 작업 노드 세션 포트(ports.SessionPort)의 실물. 노드마다 새 세션을 기존 03_Agent 백엔드로 연다.
//   - 프롬프트: 템플릿 노드의 지시와 그 노드가 고른 생존 문서(경로 머리 + 본문)만. 마일스톤 id·goal 제목 같은 다른 맥락은 없다.
//     단, 세션은 앱 세션과 같은 설정 출처(user·project·local)를 읽는다 — 작업 저장소와 사용자의 CLAUDE.md는 그쪽 몫이다.
//     사용자 MCP 서버는 루프 잠금이 붙은 세션에서 읽지 않는다(sdkOptions의 strictMcpConfig, G4).
//   - 실행 입력: 앱 「자동」 모드(picker id auto), cwd는 작업 저장소, 환경은 자격 없는 자식 환경, 루프 잠금 노드(loopLock.ts).
//     잠금은 claude-code 백엔드의 SDK 옵션에서만 붙으므로 다른 백엔드는 열지 않는다(fail-closed).
//   - 결과: done이면 ok:true(요약은 마지막 메시지 한 줄). error가 하나라도 있었거나, done 없이 끝났거나, 시간 초과면 ok:false.
//     취소(실행기 닫기 신호·화면의 취소)는 ok:false에 cancelled:true다 — 실행기는 FAIL로 세지 않고 멈춘다(G4).
// M09 G4 — 메인 노드(role main, 브레인스토밍)는 사람과 이야기하는 세션이다.
//   - 카드(질문·권한)는 화면 응답자(mainCard)로 간다. 맥락으로 노드 id·goal id·그 세션의 최근 글, 세션이 끝나면 꺼지는 신호를 준다
//     (화면이 남은 카드를 거둔다). 시간 상한이 없다 — 사람이 화면에서 취소한다(cancel).
//   - 작업자 노드(role worker)는 G2와 같다 — 카드는 거부·무응답(onCard로 바꿔 끼울 수 있다), 시간 상한이 있다.
// 세션 한 번을 돌리는 고리(runNodeSession)는 검수 세션(reviewSession.ts)과 함께 쓴다.
import type { AgentBackend, AgentRun, AgentRunInput, RunResponse } from '@main/03_Agent/AgentBackend'
import type { AgentEvent } from '@shared/agentEvents'
import type { SessionPort, WorkRequest, WorkResult } from './ports'
import { DOCS, goalDocPath } from './survivalDocs'
import type { DocKind } from './template'

export const DEFAULT_SESSION_TIMEOUT_MS = 60 * 60_000
const SUMMARY_MAX = 300

export type CardEvent = Extract<AgentEvent, { type: 'permission_request' | 'question_request' }>
// 카드 맥락(G4) — signal은 그 세션이 끝나면 꺼진다(응답이 더는 쓰이지 않는다).
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
  // 작업자 노드 세션의 시간 상한. 메인 노드에는 걸지 않는다(G4)
  timeoutMs?: number
  model?: string
  effort?: string
  // 실행기를 닫을 때 돌고 있는 세션을 멈춘다
  signal?: AbortSignal
  // 작업자 노드의 카드 응답자. 기본은 거부·무응답
  onCard?: CardResponder
  // 메인 노드의 카드 응답자(G4 — 화면). 없으면 메인 노드도 onCard·기본을 쓴다
  mainCard?: CardResponder
  // 화면이 세션 진행을 볼 수 있게 이벤트를 흘린다
  onEvent?: (e: AgentEvent) => void
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

// 노드가 고른 문서 종(node.docs)의 순서로만 싣는다 — req.docs에 다른 종이 있어도 넣지 않는다.
export function buildWorkPrompt(req: WorkRequest): string {
  const parts = [req.node.instruction.trim()]
  for (const kind of req.node.docs) {
    const p = docPathOf(kind, req)
    const body = req.docs[kind]
    parts.push(`## ${DOC_LABEL[kind]}${p ? ` (${p})` : ''}\n\n${body ?? '(아직 없음)'}`)
  }
  return parts.join('\n\n')
}

export const oneLine = (s: string): string => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > SUMMARY_MAX ? t.slice(0, SUMMARY_MAX - 1) + '…' : t
}

export const denyCards = (ev: CardEvent): RunResponse =>
  ev.type === 'question_request' ? { kind: 'question', answers: null } : { kind: 'permission', behavior: 'deny' }

// 세션 한 번의 끝. text는 마지막 최상위 메시지의 전문이다(검수 세션이 마지막 줄을 읽는다).
export type SessionEnd =
  | { kind: 'done'; text: string }
  | { kind: 'error'; text: string; error: string }
  | { kind: 'cancelled'; text: string }
  | { kind: 'timeout'; text: string; timeoutMs: number }
  | { kind: 'start-failed'; error: string }

export interface NodeSessionInput {
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
    // G4 검수 사소 5 — 최상위 도구 호출 뒤에는 새 메시지다. 그 뒤 글이 오면 새로 쌓고, 글 없이 끝나면 끝의 글은 빈 글이다.
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
      const main = req.node.role === 'main' && opts.mainCard !== undefined
      const session = runNodeSession({
        backend: opts.backend,
        input: {
          messages: [{ role: 'user', content: buildWorkPrompt(req) }],
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
        onEvent: opts.onEvent,
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
