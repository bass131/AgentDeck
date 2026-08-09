import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { AgentRun } from '../../../02_Source/main/01_agents/AgentBackend'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'

type RunWithSetModel = AgentRun & { setModel?: (modelId: string) => void }

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
    session_id: 'sess-lm1',
  }
}

function makeSetModelQueryFn(calls: string[], opts: { rejecting?: boolean } = {}): QueryFn {
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
      setModel: (model: string): unknown => {
        calls.push(model)
        return opts.rejecting ? Promise.reject(new Error('SDK setModel 거부(모의)')) : undefined
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

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 5))

describe('LM1 P02 ① persistent run setModel — 정규화 위임', () => {
  it("persistent run에서 setModel('haiku') → SDK 핸들에 'claude-haiku-4-5' 1회", async () => {
    const calls: string[] = []
    const backend = new ClaudeCodeBackend(makeSetModelQueryFn(calls))
    const run = backend.start({
      messages: [{ role: 'user', content: '지속 세션 모델 전환' }],
      persistent: true,
      model: 'sonnet',
    }) as RunWithSetModel

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()
    try {
      await waitFor(() => events.some((e) => e.type === 'done'))
      expect(typeof run.setModel).toBe('function')
      run.setModel?.('haiku')
      await tick()
    } finally {
      run.abort()
      await consume
    }

    expect(calls).toEqual(['claude-haiku-4-5'])
  })
})

describe('LM1 P02 ② 단발 run setModel — 위임 0 no-op', () => {
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
        setModel: (model: string): void => {
          calls.push(model)
        },
      })
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '단발 실행' }],
      model: 'sonnet',
    }) as RunWithSetModel

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    try {
      await waitFor(() => pumpStarted)
      expect(typeof run.setModel).toBe('function')
      expect(() => {
        run.setModel?.('haiku')
        run.setModel?.('haiku')
      }).not.toThrow()
    } finally {
      release()
      await consume
    }

    expect(calls).toHaveLength(0)
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })
})

describe('LM1 P02 ③ change-guard — 같은 값 위임 0', () => {
  it('ⓐ 생성 모델과 같은 값 호출 위임 0 · ⓑ 전환 성공 후 재호출 위임 총 1회 유지', async () => {
    {
      const calls: string[] = []
      const backend = new ClaudeCodeBackend(makeSetModelQueryFn(calls))
      const run = backend.start({
        messages: [{ role: 'user', content: '동일 모델 재요청' }],
        persistent: true,
        model: 'haiku',
      }) as RunWithSetModel
      const events: AgentEvent[] = []
      const consume = (async () => {
        for await (const e of run.events) events.push(e)
      })()
      try {
        await waitFor(() => events.some((e) => e.type === 'done'))
        run.setModel?.('haiku')
        await tick()
      } finally {
        run.abort()
        await consume
      }
      expect(calls).toHaveLength(0)
    }

    {
      const calls: string[] = []
      const backend = new ClaudeCodeBackend(makeSetModelQueryFn(calls))
      const run = backend.start({
        messages: [{ role: 'user', content: '전환 후 동일값 재호출' }],
        persistent: true,
        model: 'sonnet',
      }) as RunWithSetModel
      const events: AgentEvent[] = []
      const consume = (async () => {
        for await (const e of run.events) events.push(e)
      })()
      try {
        await waitFor(() => events.some((e) => e.type === 'done'))
        run.setModel?.('haiku')
        await tick()
        run.setModel?.('haiku')
        await tick()
      } finally {
        run.abort()
        await consume
      }
      expect(calls).toEqual(['claude-haiku-4-5'])
    }
  })
})

describe('LM1 P02 ④ 미지 모델 id — 위임 0', () => {
  it("normalizeModel이 못 접는 값('gpt-5' 등)은 걸러지고 유효 id만 위임된다", async () => {
    const calls: string[] = []
    const backend = new ClaudeCodeBackend(makeSetModelQueryFn(calls))
    const run = backend.start({
      messages: [{ role: 'user', content: '미지 모델 필터' }],
      persistent: true,
      model: 'sonnet',
    }) as RunWithSetModel
    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()
    try {
      await waitFor(() => events.some((e) => e.type === 'done'))
      run.setModel?.('gpt-5')
      run.setModel?.('claude')
      run.setModel?.('haiku')
      await tick()
    } finally {
      run.abort()
      await consume
    }
    expect(calls).toEqual(['claude-haiku-4-5'])
  })
})

describe('LM1 P02 ⑤ 핸들 미캡처 호출 — no-op·no-throw (GREEN 핀)', () => {
  it('queryFn 호출 전(펌프 시작 전) setModel 호출은 조용히 삼킨다(throw 금지)', async () => {
    const backend = new ClaudeCodeBackend(makeSetModelQueryFn([]))
    const run = backend.start({
      messages: [{ role: 'user', content: '즉시 전환 시도' }],
      persistent: true,
      model: 'sonnet',
    }) as RunWithSetModel
    expect(() => run.setModel?.('haiku')).not.toThrow()
    run.abort()
    for await (const e of run.events) void e
  })
})

describe('LM1 P02 ⑥ reject 롤백 — 재호출 재위임', () => {
  it("핸들 setModel reject 시 같은 값('haiku') 재호출이 다시 위임된다(총 2회)", async () => {
    const calls: string[] = []
    const backend = new ClaudeCodeBackend(makeSetModelQueryFn(calls, { rejecting: true }))
    const run = backend.start({
      messages: [{ role: 'user', content: '위임 실패 롤백' }],
      persistent: true,
      model: 'sonnet',
    }) as RunWithSetModel
    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()
    try {
      await waitFor(() => events.some((e) => e.type === 'done'))
      run.setModel?.('haiku')
      await tick()
      run.setModel?.('haiku')
      await tick()
    } finally {
      run.abort()
      await consume
    }
    expect(calls).toEqual(['claude-haiku-4-5', 'claude-haiku-4-5'])
  })
})
