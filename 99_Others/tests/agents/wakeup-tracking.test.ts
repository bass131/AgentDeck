import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent, AgentEventLoops } from '../../../02_Source/shared/agentEvents'

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
    session_id: 'sess-test',
  }
}

function mkWakeupToolUse(toolUseId: string, delaySeconds: number, reason: string, prompt = '') {
  return {
    type: 'assistant' as const,
    message: {
      id: `msg_${toolUseId}`,
      type: 'message' as const,
      role: 'assistant' as const,
      content: [
        {
          type: 'tool_use',
          id: toolUseId,
          name: 'ScheduleWakeup',
          input: { delaySeconds, reason, prompt },
        }
      ],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: `uuid-asst-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

function mkWakeupToolResult(toolUseId: string, content: string, isError = false) {
  return {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content,
          ...(isError ? { is_error: true } : {}),
        }
      ]
    },
    parent_tool_use_id: null,
    uuid: `uuid-user-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

function mkAssistant(text: string, msgId = 'msg_plain') {
  return {
    type: 'assistant' as const,
    message: {
      id: msgId,
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'text', text }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: `uuid-asst-${msgId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

async function collectEvents(backend: ClaudeCodeBackend, req: Parameters<typeof backend.start>[0]): Promise<AgentEvent[]> {
  const run = backend.start(req)
  const events: AgentEvent[] = []
  for await (const e of run.events) {
    events.push(e)
  }
  return events
}

describe('WT1 — ScheduleWakeup 생성 → loops 이벤트', () => {
  it('tool_use + tool_result(ok) 시퀀스 → loops 이벤트 1개, summary/interval 반영', async () => {
    const queryFn: QueryFn = async function* (_p) {
      yield mkWakeupToolUse('wk-1', 270, '사용자가 멈추라고 할 때까지 PING 반복 응답')
      yield mkWakeupToolResult('wk-1', 'Next wakeup scheduled for 09:02:00 (in 284s). Nothing more to do this turn.')
      yield mkResult('turn1')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const events = await collectEvents(backend, {
      messages: [{ role: 'user', content: "/loop 'PING'이라고만 답하기" }]
    })

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    expect(loopsEvents.length).toBeGreaterThanOrEqual(1)

    const lastLoops = loopsEvents[loopsEvents.length - 1]
    expect(lastLoops.loops).toHaveLength(1)
    expect(lastLoops.loops[0].summary).toBe('사용자가 멈추라고 할 때까지 PING 반복 응답')
    expect(lastLoops.loops[0].interval).toMatch(/self-paced/)
  })

  it('ScheduleWakeup 예약 실패(ok=false) → loops 미방출(graceful, crash 0)', async () => {
    const queryFn: QueryFn = async function* (_p) {
      yield mkWakeupToolUse('wk-1', 270, '실패 케이스')
      yield mkWakeupToolResult('wk-1', 'error: could not schedule', true)
      yield mkResult('turn1')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    let threw = false
    let events: AgentEvent[] = []
    try {
      events = await collectEvents(backend, { messages: [{ role: 'user', content: '테스트' }] })
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    for (const le of loopsEvents) expect(le.loops.length).toBe(0)
  })
})

describe('WT2 — 연쇄 갱신(재예약) — 배너 1개 유지', () => {
  it('턴1 예약 → 턴2(자율) 재예약 → loops 스냅샷 항상 1항목, summary는 최신으로 교체', async () => {
    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkWakeupToolUse('wk-1', 270, 'A')
      yield mkWakeupToolResult('wk-1', 'Next wakeup scheduled (in 270s).')
      yield mkResult('turn1')

      yield mkWakeupToolUse('wk-2', 300, 'B')
      yield mkWakeupToolResult('wk-2', 'Next wakeup scheduled (in 300s).')
      yield mkResult('turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '시작' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    const nonEmptySnapshots = loopsEvents.filter(e => e.loops.length > 0)
    expect(nonEmptySnapshots.length).toBeGreaterThanOrEqual(2)
    for (const snap of nonEmptySnapshots) expect(snap.loops.length).toBe(1)

    expect(nonEmptySnapshots[0].loops[0].summary).toBe('A')
    expect(nonEmptySnapshots[nonEmptySnapshots.length - 1].loops[0].summary).toBe('B')

    const dones = events.filter(e => e.type === 'done')
    expect(dones.length).toBe(2)
  })
})

describe('WT3 — 종료(재예약 부재) → loops에서 제거', () => {
  it('턴1 예약 → 턴2(자율) 재예약 없이 응답만 → 두 번째 done 직전 loops:[] emit', async () => {
    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkWakeupToolUse('wk-1', 270, 'A')
      yield mkWakeupToolResult('wk-1', 'Next wakeup scheduled (in 270s).')
      yield mkResult('turn1')

      yield mkAssistant('더 이상 모니터링할 필요가 없어 보입니다. 종료합니다.')
      yield mkResult('turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '시작' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    const dones = events.filter(e => e.type === 'done')
    expect(dones.length).toBe(2)

    let doneCount = 0
    let secondDoneIdx = -1
    for (let i = 0; i < events.length; i++) {
      if (events[i].type === 'done') {
        doneCount++
        if (doneCount === 2) { secondDoneIdx = i; break }
      }
    }
    expect(secondDoneIdx).toBeGreaterThan(0)

    const beforeSecondDone = events[secondDoneIdx - 1]
    expect(beforeSecondDone.type).toBe('loops')
    expect((beforeSecondDone as AgentEventLoops).loops).toEqual([])

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    const lastLoops = loopsEvents[loopsEvents.length - 1]
    expect(lastLoops.loops).toEqual([])
  })
})

describe('WT4 — abort 시 wakeup loops clear', () => {
  it('ScheduleWakeup armed 후 abort → 빈 loops 이벤트 emit, crash/zombie 0', async () => {
    let resolveHold!: () => void
    const holdPromise = new Promise<void>((r) => { resolveHold = r })

    const queryFn: QueryFn = async function* (_p) {
      yield mkWakeupToolUse('wk-ab', 270, '어보트 웨이크업')
      yield mkWakeupToolResult('wk-ab', 'Next wakeup scheduled (in 270s).')
      await holdPromise
      yield mkResult('turn1')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '어보트 테스트' }]
    })

    const events: AgentEvent[] = []
    let threw = false
    let sawArmedLoops = false

    try {
      for await (const e of run.events) {
        events.push(e)
        if (e.type === 'loops' && (e as AgentEventLoops).loops.length > 0 && !sawArmedLoops) {
          sawArmedLoops = true
          run.abort()
          resolveHold()
        }
      }
    } catch {
      threw = true
    }
    resolveHold()

    expect(threw).toBe(false)
    expect(sawArmedLoops).toBe(true)
    const emptyLoopsAfter = events.filter(e => e.type === 'loops' && (e as AgentEventLoops).loops.length === 0)
    expect(emptyLoopsAfter.length).toBeGreaterThanOrEqual(1)
    expect(() => run.abort()).not.toThrow()
  })
})
