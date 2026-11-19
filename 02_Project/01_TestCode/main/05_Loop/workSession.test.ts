// M09 G2 작업 노드 세션 포트 — 노드마다 새 세션을 백엔드로 열고, 지시와 그 노드의 생존 문서만 프롬프트로 준다.
// 자동 모드·작업 저장소 cwd·자격 없는 환경·루프 잠금을 실행 입력으로 넘기고, 시간 초과·취소·실패는 ok:false다.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentBackend, AgentRun, AgentRunInput, RunResponse } from '@main/03_Agent/AgentBackend'
import { ClaudeCodeBackend } from '@main/04_Claude/ClaudeCodeBackend'
import { MAIN_NODE_RULE, buildWorkPrompt, createWorkSessionPort, type WorkSessionOptions } from '@main/05_Loop/workSession'
import type { WorkRequest } from '@main/05_Loop/ports'
import type { GoalState } from '@main/05_Loop/runState'
import type { WorkNode } from '@main/05_Loop/template'
import type { AgentEvent } from '@shared/agentEvents'
import type { BackendId } from '@shared/ipcContract'
import { makeCaptureQuery } from '../00_Helpers/fakeQuery'

const CWD = 'C:\\work\\repo'
const APP = 'C:\\Users\\u\\AppData\\Roaming\\agentdeck\\loop'
const ENV: NodeJS.ProcessEnv = { PATH: '/bin', GH_TOKEN: 'agentdeck-no-credential' }

const NODE: WorkNode = {
  kind: 'work',
  id: 'implement',
  title: '구현',
  role: 'worker',
  instruction: 'goal 문서의 범위 안에서 구현하고 시험을 쓴다.',
  docs: ['goal', 'decisions'],
}
const GOAL = { id: 'g1', title: '첫 goal 제목은 프롬프트에 없다' } as unknown as GoalState

function request(over: Partial<WorkRequest> = {}): WorkRequest {
  return {
    milestoneId: 'M-ID-NOT-IN-PROMPT',
    node: NODE,
    goal: GOAL,
    docs: { goal: '# g1\n\ngoal 본문', decisions: null, milestoneSpec: '노드가 고르지 않은 스펙 본문' },
    ...over,
  }
}

interface Rec { starts: AgentRunInput[]; responses: [string, RunResponse][]; aborts: number }

function fakeBackend(events: AgentEvent[] | 'hang', opts: { id?: BackendId; throwOnStart?: boolean } = {}): { backend: AgentBackend; rec: Rec } {
  const rec: Rec = { starts: [], responses: [], aborts: 0 }
  const backend: AgentBackend = {
    id: opts.id ?? 'claude-code',
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    listSupportedCommands: () => [],
    start(req): AgentRun {
      if (opts.throwOnStart) throw new Error('start boom')
      rec.starts.push(req)
      let release: () => void = () => {}
      const aborted = new Promise<void>((r) => { release = r })
      return {
        events: (async function* () {
          if (events === 'hang') { await aborted; return }
          // 목록 안의 'hang'은 그 자리에서 취소까지 멈춘다(G4 — 카드 뒤에 기다리는 메인 세션)
          for (const e of events as (AgentEvent | 'hang')[]) {
            if (e === 'hang') { await aborted; return }
            await Promise.resolve(); yield e
          }
        })(),
        abort() { rec.aborts++; release() },
        interrupt() {},
        push() {},
        respond(id, r) { rec.responses.push([id, r]) },
      }
    },
  }
  return { backend, rec }
}

const opts = (backend: AgentBackend, over: Partial<WorkSessionOptions> = {}): WorkSessionOptions => ({
  backend, cwd: CWD, env: ENV, appLoopDir: APP, ...over,
})
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('작업 노드 프롬프트 (M09 G2)', () => {
  it('지시와 노드가 고른 문서만 담는다 — 마일스톤 id, goal 제목, 고르지 않은 문서는 없다', () => {
    const p = buildWorkPrompt(request())
    expect(p.startsWith(NODE.instruction)).toBe(true)
    expect(p).toContain('goal 본문')
    expect(p).toContain('.agentdeck/goals/g1.md')
    expect(p).toContain('.agentdeck/decisions.md')
    expect(p).toContain('(아직 없음)')
    expect(p).not.toContain('노드가 고르지 않은 스펙 본문')
    expect(p).not.toContain('M-ID-NOT-IN-PROMPT')
    expect(p).not.toContain('첫 goal 제목')
  })

  // G5 실주행 — 메인 노드 세션은 한 턴이라 일반 글로 물으면 사람이 답할 길이 없다. 묻는 길을 질문 도구로 못 박는다
  it('메인 노드(role main)에만 끝에 「질문 도구로만 묻고 스펙을 쓴 뒤 끝낸다」 규칙을 붙인다', () => {
    const main = buildWorkPrompt(request({ node: { ...NODE, id: 'brainstorm', role: 'main', docs: ['milestoneSpec'] }, goal: null }))
    expect(main.endsWith(MAIN_NODE_RULE)).toBe(true)
    expect(main).toContain('AskUserQuestion')
    // G5 독립 검수 사소 2·4 — 받은 답은 바로 결정 대장에 적고, 끝내기 전에 스펙이나 결정 대장을 갱신한다
    expect(MAIN_NODE_RULE).toContain('결정 대장에 바로')
    expect(MAIN_NODE_RULE).toContain('갱신')
    expect(main).toContain('노드가 고르지 않은 스펙 본문')
    expect(buildWorkPrompt(request())).not.toContain('AskUserQuestion')
  })

  it('세션 실행 입력: 사용자 메시지 하나(그 프롬프트), 자동 모드, 작업 저장소 cwd, 자격 없는 환경, 루프 잠금', async () => {
    const { backend, rec } = fakeBackend([{ type: 'done' }])
    await createWorkSessionPort(opts(backend)).runWork(request())
    expect(rec.starts).toHaveLength(1)
    const req = rec.starts[0]
    expect(req.messages).toEqual([{ role: 'user', content: buildWorkPrompt(request()) }])
    expect(req.mode).toBe('auto')
    expect(req.workspaceRoot).toBe(CWD)
    expect(req.env).toBe(ENV)
    expect(req.loopLock).toEqual({ repoRoot: CWD, appLoopDir: APP })
    expect(req.systemPrompt).toBeUndefined()
    expect(req.resumeSessionId).toBeUndefined()
    expect(req.persistent).toBeUndefined()
  })

  it('노드마다 새 세션을 연다', async () => {
    const { backend, rec } = fakeBackend([{ type: 'done' }])
    const port = createWorkSessionPort(opts(backend))
    await port.runWork(request())
    await port.runWork(request())
    expect(rec.starts).toHaveLength(2)
  })
})

describe('작업 노드 세션 결과 (M09 G2)', () => {
  it('done이면 ok:true, 요약은 마지막 메시지 한 줄', async () => {
    const { backend, rec } = fakeBackend([
      { type: 'text', delta: '먼저 ', messageId: 'm1' },
      { type: 'text', delta: '읽는다', messageId: 'm1' },
      { type: 'text', delta: '구현을 마쳤다\n시험 3건', messageId: 'm2' },
      { type: 'done' },
    ])
    expect(await createWorkSessionPort(opts(backend)).runWork(request())).toEqual({ ok: true, summary: '구현을 마쳤다 시험 3건' })
    expect(rec.aborts).toBe(1)
  })

  // G4 검수 사소 5 — 요약(검수에서는 판정)은 마지막 최상위 메시지의 글이다. 최상위 도구 호출 뒤 글 없이 끝나면 앞 메시지의 글을 쓰지 않는다
  it('최상위 도구 호출 뒤 글 없이 끝나면 요약에 앞 메시지의 글을 쓰지 않는다', async () => {
    const { backend } = fakeBackend([
      { type: 'text', delta: '다 했다고 말하고', messageId: 'm1' },
      { type: 'tool_call', id: 't1', name: 'Bash', input: { command: 'ls' } },
      { type: 'tool_result', id: 't1', ok: true, output: '' },
      { type: 'done' },
    ])
    expect(await createWorkSessionPort(opts(backend)).runWork(request())).toEqual({ ok: true, summary: '요약 없음' })
  })

  it('요약은 길이 상한이 있다', async () => {
    const { backend } = fakeBackend([{ type: 'text', delta: 'x'.repeat(5000) }, { type: 'done' }])
    const r = await createWorkSessionPort(opts(backend)).runWork(request())
    expect(r.ok).toBe(true)
    expect(r.summary.length).toBeLessThanOrEqual(300)
  })

  it('error 뒤 done이어도 ok:false — 오류 문구가 요약에 실린다', async () => {
    const { backend } = fakeBackend([{ type: 'error', message: 'rate limited' }, { type: 'done' }])
    const r = await createWorkSessionPort(opts(backend)).runWork(request())
    expect(r.ok).toBe(false)
    expect(r.summary).toContain('rate limited')
  })

  it('done 없이 끝난 스트림은 ok:false', async () => {
    const { backend } = fakeBackend([{ type: 'text', delta: '중간' }])
    expect((await createWorkSessionPort(opts(backend)).runWork(request())).ok).toBe(false)
  })

  it('시간 초과면 세션을 취소하고 ok:false', async () => {
    const { backend, rec } = fakeBackend('hang')
    const r = await createWorkSessionPort(opts(backend, { timeoutMs: 30 })).runWork(request())
    expect(r.ok).toBe(false)
    expect(r.summary).toContain('시간 초과')
    expect(rec.aborts).toBeGreaterThanOrEqual(1)
  })

  it('취소 신호가 오면 세션을 멈추고 ok:false, 이미 취소됐으면 열지 않는다', async () => {
    const { backend, rec } = fakeBackend('hang')
    const ac = new AbortController()
    const pending = createWorkSessionPort(opts(backend, { signal: ac.signal })).runWork(request())
    await tick()
    ac.abort()
    const r = await pending
    expect(r.ok).toBe(false)
    expect(r.summary).toContain('취소')
    expect(rec.aborts).toBeGreaterThanOrEqual(1)
    const again = await createWorkSessionPort(opts(backend, { signal: ac.signal })).runWork(request())
    expect(again.ok).toBe(false)
    expect(rec.starts).toHaveLength(1)
  })

  it('세션을 열다 던지면 ok:false', async () => {
    const { backend } = fakeBackend([], { throwOnStart: true })
    const r = await createWorkSessionPort(opts(backend)).runWork(request())
    expect(r).toMatchObject({ ok: false })
    expect(r.summary).toContain('start boom')
  })

  it('잠금 노드를 붙일 수 없는 백엔드(claude-code 밖)는 열지 않는다', async () => {
    const { backend, rec } = fakeBackend([{ type: 'done' }], { id: 'codex' })
    expect((await createWorkSessionPort(opts(backend)).runWork(request())).ok).toBe(false)
    expect(rec.starts).toHaveLength(0)
  })
})

describe('작업 노드 세션의 카드 (M09 G2)', () => {
  const cards: AgentEvent[] = [
    { type: 'permission_request', requestId: 'p1', toolName: 'Bash', summary: '명령 실행: x' },
    { type: 'question_request', requestId: 'q1', questions: [] },
    { type: 'done' },
  ]

  it('기본은 권한 카드를 거부하고 질문 카드는 답 없이 넘긴다 — 사람이 없는 세션이 멈춰 기다리지 않는다', async () => {
    const { backend, rec } = fakeBackend(cards)
    await createWorkSessionPort(opts(backend)).runWork(request())
    await tick()
    expect(rec.responses).toEqual([
      ['p1', { kind: 'permission', behavior: 'deny' }],
      ['q1', { kind: 'question', answers: null }],
    ])
  })

  it('카드 응답자를 바꿔 끼울 수 있고(G3 사람 게이트), 이벤트는 onEvent로 흘린다', async () => {
    const { backend, rec } = fakeBackend(cards)
    const seen: string[] = []
    await createWorkSessionPort(opts(backend, {
      onCard: async (ev) => (ev.type === 'permission_request' ? { kind: 'permission', behavior: 'allow' } : { kind: 'question', answers: [['예']] }),
      onEvent: (e) => seen.push(e.type),
    })).runWork(request())
    await tick()
    expect(rec.responses).toEqual([
      ['p1', { kind: 'permission', behavior: 'allow' }],
      ['q1', { kind: 'question', answers: [['예']] }],
    ])
    expect(seen).toEqual(['permission_request', 'question_request', 'done'])
  })
})

describe('메인 노드의 카드와 취소 (M09 G4)', () => {
  const MAIN: WorkNode = { ...NODE, id: 'brainstorm', role: 'main', docs: ['milestoneSpec'] }
  const card: AgentEvent = { type: 'question_request', requestId: 'q1', questions: [] }

  it('메인 노드의 카드는 화면 응답자로 가고(최근 글과 노드 맥락 포함), 시간 상한이 없다 — 화면에서 취소하면 cancelled로 끝난다', async () => {
    const { backend, rec } = fakeBackend([{ type: 'text', delta: '무엇을 만들까?', messageId: 'm1' }, card, 'hang'] as never)
    const got: { node: string; goal: string | null; text: string; ended: boolean }[] = []
    let endSignal: AbortSignal | null = null
    const port = createWorkSessionPort(opts(backend, {
      timeoutMs: 20,
      mainCard: (_ev, ctx) => {
        endSignal = ctx.signal
        got.push({ node: ctx.node, goal: ctx.goal, text: ctx.text, ended: ctx.signal.aborted })
        return new Promise<RunResponse>(() => {})
      },
    }))
    const pending = port.runWork(request({ node: MAIN, goal: null }))
    await new Promise((r) => setTimeout(r, 80))
    expect(got).toEqual([{ node: 'brainstorm', goal: null, text: '무엇을 만들까?', ended: false }])
    expect(port.cancel?.()).toBe(true)
    const r = await pending
    expect(r).toMatchObject({ ok: false, cancelled: true })
    expect(r.summary).toContain('취소')
    expect((endSignal as AbortSignal | null)?.aborted).toBe(true)
    expect(rec.responses).toEqual([])
    expect(port.cancel?.()).toBe(false)
  })

  it('작업자 노드는 화면 응답자가 있어도 거부 응답자를 쓰고 시간 상한이 있다', async () => {
    const { backend, rec } = fakeBackend([{ type: 'permission_request', requestId: 'p1', toolName: 'Bash', summary: 'x' }, { type: 'done' }])
    let asked = 0
    await createWorkSessionPort(opts(backend, { mainCard: () => { asked++; return { kind: 'permission', behavior: 'allow' } } })).runWork(request())
    await tick()
    expect(asked).toBe(0)
    expect(rec.responses).toEqual([['p1', { kind: 'permission', behavior: 'deny' }]])
  })

  it('실행기 닫기(취소 신호)도 cancelled다 — FAIL이 아니라 멈춤으로 센다', async () => {
    const { backend } = fakeBackend('hang')
    const ac = new AbortController()
    const pending = createWorkSessionPort(opts(backend, { signal: ac.signal })).runWork(request())
    await tick()
    ac.abort()
    expect(await pending).toMatchObject({ ok: false, cancelled: true })
    expect(await createWorkSessionPort(opts(backend, { signal: ac.signal })).runWork(request())).toMatchObject({ cancelled: true })
  })

  it('응답자가 던지면 그 카드는 거부·무응답으로 넘긴다', async () => {
    const { backend, rec } = fakeBackend([{ type: 'permission_request', requestId: 'p1', toolName: 'Bash', summary: 'x' }, 'hang'] as never)
    const port = createWorkSessionPort(opts(backend, { mainCard: () => { throw new Error('화면 없음') } }))
    const pending = port.runWork(request({ node: MAIN, goal: null }))
    await new Promise((r) => setTimeout(r, 20))
    expect(rec.responses).toEqual([['p1', { kind: 'permission', behavior: 'deny' }]])
    port.cancel?.()
    await pending
  })

  it('시간 초과는 cancelled가 아니다(FAIL로 센다)', async () => {
    const { backend } = fakeBackend('hang')
    const r = await createWorkSessionPort(opts(backend, { timeoutMs: 20 })).runWork(request())
    expect(r.ok).toBe(false)
    expect(r.cancelled).toBeUndefined()
  })
})

describe('실물 백엔드 배선 (M09 G2)', () => {
  it('ClaudeCodeBackend로 열면 SDK 옵션에 cwd·자격 없는 환경·자동 모드 시작값·루프 잠금 훅(맨 앞)이 실린다', async () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-ws-')))
    try {
      const { queryFn, captured } = makeCaptureQuery([])
      const port = createWorkSessionPort({ backend: new ClaudeCodeBackend(queryFn), cwd: dir, env: ENV, appLoopDir: APP, timeoutMs: 3000 })
      await port.runWork(request())
      expect(captured.calls).toBe(1)
      const o = captured.options as Record<string, unknown>
      expect(o['cwd']).toBe(dir)
      expect(o['env']).toEqual({ ...ENV, CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: '1' })
      expect(o['permissionMode']).toBe('acceptEdits')
      type M = { hooks: ((i: unknown, id: string, x: { signal: AbortSignal }) => Promise<{ hookSpecificOutput?: { permissionDecision: string } }>)[] }
      const first = (o['hooks'] as { PreToolUse: M[] }).PreToolUse[0]
      const out = await first.hooks[0](
        { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git push origin HEAD' } }, 't', { signal: new AbortController().signal })
      expect(out.hookSpecificOutput?.permissionDecision).toBe('deny')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
