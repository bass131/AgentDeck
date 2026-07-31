import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import { PermissionCoordinator } from '../../../02_Source/main/01_agents/permissionCoordinator'
import type { AgentRun } from '../../../02_Source/main/01_agents/AgentBackend'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'

type RunWithSetPermissionMode = AgentRun & { setPermissionMode?: (modeId: string) => void }

interface PermissionModeEv {
  type: 'permission_mode'
  mode: string
}

function permissionModeEvents(events: AgentEvent[]): PermissionModeEv[] {
  return events.filter(
    (e) => (e as { type: string }).type === 'permission_mode'
  ) as unknown as PermissionModeEv[]
}

type PermReqEvent = Extract<AgentEvent, { type: 'permission_request' }>

function mkResult(turnLabel = 'turn') {
  return {
    type: 'result' as const,
    subtype: 'success' as const,
    is_error: false,
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: 1,
    result: turnLabel,
    stop_reason: 'end_turn',
    total_cost_usd: 0,
    usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    errors: [],
    uuid: 'uuid-0000-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-p13',
  }
}

function mkStatus(permissionMode?: string) {
  return {
    type: 'system' as const,
    subtype: 'status' as const,
    status: null,
    ...(permissionMode !== undefined ? { permissionMode } : {}),
    uuid: 'uuid-stat-0000-0000-000000000042' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-p13',
  }
}

function mkQuery(messages: unknown[]): QueryFn {
  return async function* (params: { prompt: string; options?: unknown }) {
    const opts = params.options as Record<string, unknown> | undefined
    for (const m of messages) {
      const ab = opts?.['abortController'] as AbortController | undefined
      if (ab?.signal.aborted) return
      yield m
    }
  }
}

function makeSetModeQueryFn(calls: string[], opts: { throwing?: boolean } = {}): QueryFn {
  return (p) => {
    const gen = (async function* () {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')
      await inputIter.next()
    })()
    return Object.assign(gen, {
      setPermissionMode: (mode: string): void => {
        if (opts.throwing) throw new Error('SDK setPermissionMode 거부(모의)')
        calls.push(mode)
      },
    })
  }
}

async function waitFor(pred: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (pred()) return
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('waitFor 시간 초과 — predicate 미충족')
}

describe('gap1-p13 ① AgentRun.setPermissionMode — query 핸들 위임 (RED)', () => {
  it('persistent run이 setPermissionMode 메서드를 노출한다', async () => {
    const backend = new ClaudeCodeBackend(makeSetModeQueryFn([]))
    const run = backend.start({
      messages: [{ role: 'user', content: '지속 세션 시작' }],
      persistent: true,
      mode: 'normal',
    }) as RunWithSetPermissionMode
    try {
      expect(typeof run.setPermissionMode).toBe('function')
    } finally {
      run.abort()
      for await (const e of run.events) void e
    }
  })

  it("핸들 캡처 후 picker id → SDK 모드 매핑 위임: plan→'plan' · normal→'default' · acceptEdits→'acceptEdits' · auto→'auto'", async () => {
    const calls: string[] = []
    const backend = new ClaudeCodeBackend(makeSetModeQueryFn(calls))
    const run = backend.start({
      messages: [{ role: 'user', content: '모드 매핑 검증' }],
      persistent: true,
      mode: 'normal',
    }) as RunWithSetPermissionMode

    for await (const e of run.events) {
      if (e.type === 'done') {
        run.setPermissionMode?.('plan')
        run.setPermissionMode?.('normal')
        run.setPermissionMode?.('acceptEdits')
        run.setPermissionMode?.('auto')
        run.abort()
      }
    }

    expect(calls).toEqual(['plan', 'default', 'acceptEdits', 'auto'])
  })

  it('대조군(GREEN 핀): 핸들 캡처 전 호출은 조용한 no-op(throw 금지) — stopTask 미러', async () => {
    const backend = new ClaudeCodeBackend(makeSetModeQueryFn([]))
    const run = backend.start({
      messages: [{ role: 'user', content: '즉시 전환 시도' }],
      persistent: true,
      mode: 'normal',
    }) as RunWithSetPermissionMode
    expect(() => run.setPermissionMode?.('plan')).not.toThrow()
    run.abort()
    for await (const e of run.events) void e
  })

  it('대조군(GREEN 핀): 핸들 setPermissionMode가 throw해도 run 호출은 삼킨다(fire-and-forget)', async () => {
    const backend = new ClaudeCodeBackend(makeSetModeQueryFn([], { throwing: true }))
    const run = backend.start({
      messages: [{ role: 'user', content: '핸들 예외 흡수' }],
      persistent: true,
      mode: 'normal',
    }) as RunWithSetPermissionMode

    for await (const e of run.events) {
      if (e.type === 'done') {
        expect(() => run.setPermissionMode?.('plan')).not.toThrow()
        run.abort()
      }
    }
  })
})

type CapturedCanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  opts: { signal: AbortSignal; toolUseID: string }
) => Promise<{ behavior: string }>

describe('gap1-p13 ② 전환 후 다음 canUseTool부터 새 모드 (RED)', () => {
  it("mode 'normal' 시작 → setPermissionMode('auto') 후 부수효과 도구(Bash)가 permission_request 없이 allow", async () => {
    const cap: { canUseTool?: CapturedCanUseTool } = {}
    const queryFn: QueryFn = async function* (p) {
      const opts = p.options as Record<string, unknown> | undefined
      cap.canUseTool = opts?.['canUseTool'] as CapturedCanUseTool
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')
      await inputIter.next()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '진행 중 세션 라이브 전환' }],
      persistent: true,
      mode: 'normal',
    }) as RunWithSetPermissionMode

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await waitFor(() => events.some((e) => e.type === 'done'))
    expect(typeof cap.canUseTool).toBe('function')

    run.setPermissionMode?.('auto')

    const signal = new AbortController().signal
    const sentinel = new Promise<{ behavior: string }>((resolve) =>
      setTimeout(() => resolve({ behavior: '__timeout__' }), 300)
    )
    const decision = await Promise.race([
      cap.canUseTool!('Bash', { command: 'echo p13' }, { signal, toolUseID: 'bash-p13' }),
      sentinel,
    ])

    run.abort()
    await consume

    expect(decision.behavior).toBe('allow')
    expect(events.filter((e) => e.type === 'permission_request')).toHaveLength(0)
  })
})

describe('gap1-p13 ③ 단발 run setPermissionMode — no-op (RED: 존재 단정)', () => {
  it('메서드 존재 + 호출 예외 없음(멱등) + query 핸들 위임 0건', async () => {
    const calls: string[] = []
    let pumpStarted = false
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })

    const queryFn: QueryFn = () => {
      const gen = (async function* () {
        pumpStarted = true
        await gate
        yield mkResult('single')
      })()
      return Object.assign(gen, {
        setPermissionMode: (mode: string): void => {
          calls.push(mode)
        },
      })
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '단발 실행' }],
      mode: 'normal',
    }) as RunWithSetPermissionMode

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await waitFor(() => pumpStarted)

    expect(typeof run.setPermissionMode).toBe('function')
    expect(() => {
      run.setPermissionMode?.('plan')
      run.setPermissionMode?.('plan')
    }).not.toThrow()

    release()
    await consume

    expect(calls).toHaveLength(0)
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })
})

function mkCoord(): { coord: PermissionCoordinator; pushed: AgentEvent[] } {
  const pushed: AgentEvent[] = []
  const coord = new PermissionCoordinator((e) => pushed.push(e))
  return { coord, pushed }
}

describe('gap1-p13 ④ plan 승인 착지 — updatedPermissions setMode 결정성 (RED)', () => {
  it("ExitPlanMode allow 응답 → updatedPermissions [{type:'setMode', mode:'acceptEdits', destination:'session'}]", async () => {
    const { coord, pushed } = mkCoord()
    const canUse = coord.makeCanUseTool('plan', () => false)

    const p = canUse('ExitPlanMode', {
      plan: '# Plan: 라이브 전환 착지',
      planFilePath: 'C:\\Users\\bass1\\.claude\\plans\\p13.md',
    })
    expect(pushed.length).toBe(1)
    const req = pushed[0] as PermReqEvent
    expect(req.type).toBe('permission_request')
    coord.respond(req.requestId, { kind: 'permission', behavior: 'allow' })

    const result = await p
    expect(result.behavior).toBe('allow')
    const updated = (result as { updatedPermissions?: unknown[] }).updatedPermissions
    expect(updated).toEqual([{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }])
  })

  it('대조군(GREEN 핀): 비-ExitPlanMode(Bash) allow에는 setMode 착지 미부여(회귀 0)', async () => {
    const { coord, pushed } = mkCoord()
    const canUse = coord.makeCanUseTool('normal', () => false)
    const p = canUse('Bash', { command: 'ls' })
    const req = pushed[0] as PermReqEvent
    coord.respond(req.requestId, { kind: 'permission', behavior: 'allow' })
    const result = await p
    expect(result.behavior).toBe('allow')
    expect((result as { updatedPermissions?: unknown[] }).updatedPermissions).toBeUndefined()
  })

  it('대조군(GREEN 핀): ExitPlanMode deny에는 착지 미부여 — behavior deny 그대로("계속 계획" 경로)', async () => {
    const { coord, pushed } = mkCoord()
    const canUse = coord.makeCanUseTool('plan', () => false)
    const p = canUse('ExitPlanMode', { plan: '# Plan: 거부 케이스' })
    const req = pushed[0] as PermReqEvent
    coord.respond(req.requestId, { kind: 'permission', behavior: 'deny' })
    const result = await p
    expect(result.behavior).toBe('deny')
    expect((result as { updatedPermissions?: unknown[] }).updatedPermissions).toBeUndefined()
  })
})

function statusFixture(): unknown[] {
  return [
    mkStatus('plan'),
    mkStatus('default'),
    mkStatus('acceptEdits'),
    mkStatus('auto'),
    mkStatus('bypassPermissions'),
    mkStatus('dontAsk'),
    mkStatus(),
    mkResult('turn1'),
  ]
}

describe('gap1-p13 ⑤ status.permissionMode → permission_mode 방출 (RED)', () => {
  it("SDK 모드 → picker id 역매핑 순서 보존: ['plan','normal','acceptEdits','auto','bypass'] (dontAsk·부재 미방출)", async () => {
    const backend = new ClaudeCodeBackend(mkQuery(statusFixture()))
    const run = backend.start({ messages: [{ role: 'user', content: '상태 동기화' }] })
    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    expect(permissionModeEvents(events).map((e) => e.mode)).toEqual([
      'plan',
      'normal',
      'acceptEdits',
      'auto',
      'bypass',
    ])
  })

  it('대조군(GREEN 핀): 기존 S-01 compact(kind status) 매핑 불변 — status 라인 7건 전부 유지', async () => {
    const backend = new ClaudeCodeBackend(mkQuery(statusFixture()))
    const run = backend.start({ messages: [{ role: 'user', content: '상태 동기화 대조군' }] })
    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    const compactStatus = events
      .filter((e): e is Extract<AgentEvent, { type: 'compact' }> => e.type === 'compact')
      .filter((e) => e.kind === 'status')
    expect(compactStatus).toHaveLength(7)
  })
})
