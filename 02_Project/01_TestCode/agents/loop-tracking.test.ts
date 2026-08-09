import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent, AgentEventLoops, LoopInfo } from '../../../02_Project/00_Source/shared/agentEvents'

function mkResult() {
  return {
    type: 'result' as const,
    subtype: 'success' as const,
    is_error: false,
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: 1,
    result: 'done',
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

function mkCronCreateToolUse(toolUseId: string, prompt: string, cron = '*/1 * * * *') {
  return {
    type: 'assistant' as const,
    message: {
      id: 'msg_cron',
      type: 'message' as const,
      role: 'assistant' as const,
      content: [
        {
          type: 'tool_use',
          id: toolUseId,
          name: 'CronCreate',
          input: { cron, prompt, recurring: true }
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

function mkCronCreateToolResult(toolUseId: string, cronId: string, interval: string, extraText = '') {
  const content = `Scheduled recurring job ${cronId} (${interval}). Session-only (not written to disk).${extraText}`
  return {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: content,
        }
      ]
    },
    parent_tool_use_id: null,
    uuid: `uuid-user-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

function mkCronDeleteToolUse(toolUseId: string, cronId: string) {
  return {
    type: 'assistant' as const,
    message: {
      id: 'msg_cron_del',
      type: 'message' as const,
      role: 'assistant' as const,
      content: [
        {
          type: 'tool_use',
          id: toolUseId,
          name: 'CronDelete',
          input: { id: cronId }
        }
      ],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: `uuid-asst-del-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

function mkToolResult(toolUseId: string, content: string = 'ok') {
  return {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content,
        }
      ]
    },
    parent_tool_use_id: null,
    uuid: `uuid-user-res-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

function mkAssistant(text: string) {
  return {
    type: 'assistant' as const,
    message: {
      id: 'msg_001',
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'text', text }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: 'uuid-asst-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

function mkBashToolUse(toolUseId: string, command: string) {
  return {
    type: 'assistant' as const,
    message: {
      id: 'msg_bash',
      type: 'message' as const,
      role: 'assistant' as const,
      content: [
        {
          type: 'tool_use',
          id: toolUseId,
          name: 'Bash',
          input: { command }
        }
      ],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: `uuid-bash-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
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

describe('LT1 — CronCreate → loops 이벤트 1개(파싱 검증)', () => {
  it('tool_use + tool_result 시퀀스 → loops 이벤트 1개, id/summary/interval 단언', async () => {
    const CRON_PROMPT = '매 분마다 상태 보고'
    const CRON_ID = 'cc2476aa'
    const INTERVAL = 'Every minute'

    const queryFn: QueryFn = async function* (_p) {
      yield mkCronCreateToolUse('tool-1', CRON_PROMPT)
      yield mkCronCreateToolResult('tool-1', CRON_ID, INTERVAL)
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const events = await collectEvents(backend, {
      messages: [{ role: 'user', content: '/loop 매 분마다 상태 보고' }]
    })

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')

    expect(loopsEvents.length).toBeGreaterThanOrEqual(1)

    const lastLoops = loopsEvents[loopsEvents.length - 1]
    expect(lastLoops.loops).toHaveLength(1)

    const loop = lastLoops.loops[0] as LoopInfo
    expect(loop.id).toBe(CRON_ID)
    expect(loop.summary).toBe(CRON_PROMPT)
    expect(loop.interval).toBe(INTERVAL)
  })
})

describe('LT2 — CronCreate 2개 + CronDelete 1개', () => {
  it('2개 CronCreate 후 loops 2항목, CronDelete 후 loops 1항목', async () => {
    const queryFn: QueryFn = async function* (_p) {
      yield mkCronCreateToolUse('tool-a', '작업A 반복')
      yield mkCronCreateToolResult('tool-a', 'aabbccdd', 'Every minute')
      yield mkCronCreateToolUse('tool-b', '작업B 반복', '*/5 * * * *')
      yield mkCronCreateToolResult('tool-b', 'eeff0011', 'Every 5 minutes')
      yield mkCronDeleteToolUse('tool-del', 'aabbccdd')
      yield mkToolResult('tool-del', 'Deleted job aabbccdd')
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const events = await collectEvents(backend, {
      messages: [{ role: 'user', content: '/loop 시작' }]
    })

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')

    expect(loopsEvents.length).toBeGreaterThanOrEqual(3)

    const twoLoopsSnapshot = loopsEvents.find(e => e.loops.length === 2)
    expect(twoLoopsSnapshot).toBeDefined()

    const lastLoops = loopsEvents[loopsEvents.length - 1]
    expect(lastLoops.loops).toHaveLength(1)
    expect(lastLoops.loops[0].id).toBe('eeff0011')
  })
})

describe('LT3 — 파싱 불가 result content → graceful', () => {
  it('result content에 id 파싱 불가(ok:true) → crash 없음 + 보수 폴백(tool id 활성 등록)', async () => {
    const queryFn: QueryFn = async function* (_p) {
      yield mkCronCreateToolUse('tool-bad', '작업 내용')
      yield mkToolResult('tool-bad', '파싱 불가 응답 — no job id here')
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    let threw = false
    let events: AgentEvent[] = []
    try {
      events = await collectEvents(backend, {
        messages: [{ role: 'user', content: '/loop 테스트' }]
      })
    } catch {
      threw = true
    }

    expect(threw).toBe(false)

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    expect(loopsEvents.length).toBeGreaterThanOrEqual(1)
    const last = loopsEvents[loopsEvents.length - 1]
    expect(last.loops.length).toBe(1)
    expect(last.loops[0].id).toBe('tool-bad')
    expect(last.loops[0].summary).toBe('작업 내용')
  })

  it('빈 result content → crash 없음', async () => {
    const queryFn: QueryFn = async function* (_p) {
      yield mkCronCreateToolUse('tool-empty', '작업')
      yield mkToolResult('tool-empty', '')
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    let threw = false
    try {
      await collectEvents(backend, {
        messages: [{ role: 'user', content: '/loop 테스트' }]
      })
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
  })

  it('result content가 배열 형식 → crash 없음', async () => {
    const queryFn: QueryFn = async function* (_p) {
      yield mkCronCreateToolUse('tool-arr', '작업')
      yield {
        type: 'user' as const,
        message: {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-arr',
              content: [{ type: 'text', text: 'some text' }],
            }
          ]
        },
        parent_tool_use_id: null,
        uuid: 'uuid-user-arr-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`,
        session_id: 'sess-test',
      }
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    let threw = false
    try {
      await collectEvents(backend, {
        messages: [{ role: 'user', content: '/loop 테스트' }]
      })
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
  })
})

describe('LT4 — summary sanitize', () => {
  it('prompt에 개행 포함 → loops summary는 개행 제거된 1줄', async () => {
    const promptWithNewlines = '첫 번째 줄\n두 번째 줄\r세 번째 줄'
    const queryFn: QueryFn = async function* (_p) {
      yield mkCronCreateToolUse('tool-nl', promptWithNewlines)
      yield mkCronCreateToolResult('tool-nl', 'deadbeef', 'Every minute')
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const events = await collectEvents(backend, {
      messages: [{ role: 'user', content: '/loop 시작' }]
    })

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    expect(loopsEvents.length).toBeGreaterThanOrEqual(1)

    const lastLoops = loopsEvents[loopsEvents.length - 1]
    if (lastLoops.loops.length > 0) {
      const summary = lastLoops.loops[0].summary
      expect(summary).not.toMatch(/[\n\r]/)
    }
  })

  it('200자 초과 prompt → summary는 200자 이하로 cap', async () => {
    const longPrompt = 'A'.repeat(300)
    const queryFn: QueryFn = async function* (_p) {
      yield mkCronCreateToolUse('tool-cap', longPrompt)
      yield mkCronCreateToolResult('tool-cap', 'cafebabe', 'Every minute')
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const events = await collectEvents(backend, {
      messages: [{ role: 'user', content: '/loop 시작' }]
    })

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    expect(loopsEvents.length).toBeGreaterThanOrEqual(1)

    const lastLoops = loopsEvents[loopsEvents.length - 1]
    if (lastLoops.loops.length > 0) {
      const summary = lastLoops.loops[0].summary
      expect(summary.length).toBeLessThanOrEqual(200)
    }
  })

  it('loops 이벤트에 cron 표현식/raw payload 필드 없음(신뢰경계)', async () => {
    const queryFn: QueryFn = async function* (_p) {
      yield mkCronCreateToolUse('tool-trust', '신뢰경계 테스트', '*/30 * * * *')
      yield mkCronCreateToolResult('tool-trust', '12345678', 'Every 30 minutes')
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const events = await collectEvents(backend, {
      messages: [{ role: 'user', content: '/loop 시작' }]
    })

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    expect(loopsEvents.length).toBeGreaterThanOrEqual(1)

    const lastLoops = loopsEvents[loopsEvents.length - 1]
    if (lastLoops.loops.length > 0) {
      const loop = lastLoops.loops[0] as unknown as Record<string, unknown>
      expect(loop['cron']).toBeUndefined()
      expect(loop['recurring']).toBeUndefined()
      expect(loop['raw']).toBeUndefined()
      expect(loop['id']).toBeDefined()
      expect(loop['summary']).toBeDefined()
    }
  })
})

describe('LT5 — 단발 경로 회귀 0', () => {
  it('text→Bash→tool_result→done 시퀀스에서 loops 이벤트 0개', async () => {
    const queryFn: QueryFn = async function* (_p) {
      yield mkAssistant('안녕하세요')
      yield mkBashToolUse('bash-1', 'echo hello')
      yield mkToolResult('bash-1', 'hello')
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const events = await collectEvents(backend, {
      messages: [{ role: 'user', content: '안녕' }]
    })

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    expect(loopsEvents.length).toBe(0)
  })

  it('text→done 단순 시퀀스에서 loops 이벤트 0개', async () => {
    const queryFn: QueryFn = async function* (_p) {
      yield mkAssistant('단순 응답입니다')
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const events = await collectEvents(backend, {
      messages: [{ role: 'user', content: '안녕' }]
    })

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    expect(loopsEvents.length).toBe(0)
  })

  it('done 이벤트와 text 이벤트는 여전히 정상 emit됨(기존 이벤트 회귀 0)', async () => {
    const queryFn: QueryFn = async function* (_p) {
      yield mkAssistant('응답 텍스트')
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const events = await collectEvents(backend, {
      messages: [{ role: 'user', content: '테스트' }]
    })

    expect(events.some(e => e.type === 'text')).toBe(true)
    expect(events.some(e => e.type === 'done')).toBe(true)
  })
})

describe('LT6 — abort 시 loops clear', () => {
  it('CronCreate 후 abort → 등록 loops 이벤트 실수집 + post-abort loops:[] 정리 이벤트 실단언', async () => {
    let resolveHold!: () => void
    const holdPromise = new Promise<void>((r) => { resolveHold = r })

    const queryFn: QueryFn = async function* (_p) {
      yield mkCronCreateToolUse('tool-ab', '어보트 루프')
      yield mkCronCreateToolResult('tool-ab', 'ab1234cd', 'Every minute')
      await holdPromise
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '/loop 어보트 테스트' }]
    })

    const events: AgentEvent[] = []
    let threw = false
    let abortedOnce = false

    try {
      for await (const e of run.events) {
        events.push(e)
        if (!abortedOnce && e.type === 'loops' && (e as AgentEventLoops).loops.length > 0) {
          abortedOnce = true
          run.abort()
          resolveHold()
        }
      }
    } catch {
      threw = true
    }

    resolveHold()

    expect(threw).toBe(false)
    expect(abortedOnce).toBe(true)

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    const registeredIdx = loopsEvents.findIndex((e) => e.loops.length > 0)
    expect(registeredIdx).toBeGreaterThanOrEqual(0)
    expect(loopsEvents[registeredIdx].loops[0].id).toBe('ab1234cd')

    const clearedAfterRegistration = loopsEvents
      .slice(registeredIdx + 1)
      .some((e) => e.loops.length === 0)
    expect(clearedAfterRegistration).toBe(true)

    expect(() => run.abort()).not.toThrow()
  })
})
