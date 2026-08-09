import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../../02_Project/00_Source/shared/agentEvents'

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

function mkErrorDuringExecutionResult() {
  return {
    type: 'result' as const,
    subtype: 'error_during_execution' as const,
    is_error: true,
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: 1,
    total_cost_usd: 0,
    permission_denials: [],
    errors: [],
    uuid: 'uuid-err-0000-0000-0000-000000000099' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

function mkAssistantText(text: string, id = 'msg_txt') {
  return {
    type: 'assistant' as const,
    message: {
      id,
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'text', text }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: `uuid-asst-${id}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

function mkWakeupToolUse(toolUseId: string, delaySeconds: number, reason: string) {
  return {
    type: 'assistant' as const,
    message: {
      id: `msg_${toolUseId}`,
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'tool_use', id: toolUseId, name: 'ScheduleWakeup', input: { delaySeconds, reason, prompt: '' } }],
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

function mkWakeupToolResult(toolUseId: string, content: string) {
  return {
    type: 'user' as const,
    message: { role: 'user' as const, content: [{ type: 'tool_result', tool_use_id: toolUseId, content }] },
    parent_tool_use_id: null,
    uuid: `uuid-user-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

function describeEvents(events: AgentEvent[]): string {
  if (events.length === 0) return '(이벤트 0개)'
  return events
    .map((e, i) => {
      const rec = e as unknown as Record<string, unknown>
      switch (e.type) {
        case 'error': return `[${i}]error(${JSON.stringify(rec['message'])})`
        case 'done': return `[${i}]done(origin=${JSON.stringify(rec['origin'])})`
        case 'loops': return `[${i}]loops(${JSON.stringify((rec['loops'] as unknown[]).map((l) => (l as { id: string }).id))})`
        case 'text': return `[${i}]text(${JSON.stringify(rec['delta'])})`
        default: return `[${i}]${e.type}`
      }
    })
    .join(' → ')
}

function makeSelfRearmInterruptQueryFn(): {
  queryFn: QueryFn
  ready: Promise<void>
  advanceTurn3: () => void
} {
  let resolveInterruptWait: (() => void) | null = null
  let readyResolve: (() => void) | null = null
  const ready = new Promise<void>((r) => { readyResolve = r })
  let resolveTurn3Gate: (() => void) | null = null

  const queryFn: QueryFn = function (p) {
    const promptIterable = (p.prompt as unknown) as AsyncIterable<unknown>

    const gen = (async function* () {
      const inputIter = promptIterable[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return

      yield mkWakeupToolUse('wk-1', 270, '초기 무장')
      yield mkWakeupToolResult('wk-1', 'Next wakeup scheduled (in 270s).')
      yield mkAssistantText('턴1 진행 중...', 'm1')
      yield mkResult('turn1')

      yield mkWakeupToolUse('wk-2', 270, '재무장')
      yield mkWakeupToolResult('wk-2', 'Next wakeup scheduled (in 270s).')
      yield mkAssistantText('턴2 진행 중...', 'm2')

      await new Promise<void>((resolve) => {
        resolveInterruptWait = resolve
        readyResolve?.()
      })

      yield mkErrorDuringExecutionResult()

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 50)
        resolveTurn3Gate = () => { clearTimeout(timer); resolve() }
      })

      yield mkAssistantText('턴3 진행 중...', 'm3')
      yield mkResult('turn3-after-interrupt')
    })()

    ;(gen as unknown as Record<string, unknown>)['interrupt'] = async () => {
      if (resolveInterruptWait) {
        const r = resolveInterruptWait
        resolveInterruptWait = null
        r()
      }
    }

    return gen as AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
  }

  return { queryFn, ready, advanceTurn3: () => resolveTurn3Gate?.() }
}

describe('FB2-P01 진단 증거 — interrupt()는 self-re-arm(세션 스코프 반복)을 해제하지 못한다', () => {
  it('턴2를 interrupt해도 armed wakeup 슬롯이 살아남아 턴3(자율, push 없음)이 실제로 도착한다', async () => {
    const { queryFn, ready, advanceTurn3 } = makeSelfRearmInterruptQueryFn()
    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '반복 작업 시작' }],
      persistent: true,
      sessionKey: 'fb2-p01-selfrearm-1',
    })

    const events: AgentEvent[] = []
    for await (const e of run.events) {
      events.push(e)
      if (e.type === 'text' && (e as { delta: string }).delta === '턴2 진행 중...') {
        await ready
        run.interrupt()
      }
      if (e.type === 'done' && (e as { origin?: string }).origin === 'cron') {
        advanceTurn3()
      }
    }

    const types = events.map((e) => e.type)

    expect(types, describeEvents(events)).not.toContain('error')

    const doneCount = types.filter((t) => t === 'done').length
    expect(doneCount, describeEvents(events)).toBe(3)

    const loopsEvents = events.filter(
      (e): e is Extract<AgentEvent, { type: 'loops' }> => e.type === 'loops'
    )
    expect(loopsEvents.length, describeEvents(events)).toBe(3)
    expect(
      loopsEvents[0].loops.some((l) => l.id === 'wakeup'),
      '턴1 최초 무장 스냅샷에 wakeup 없음 — 픽스처 오류 의심'
    ).toBe(true)
    expect(
      loopsEvents[1].loops.some((l) => l.id === 'wakeup'),
      `턴2 재무장(interrupt 직전 성공) 스냅샷에 wakeup이 없음 — 실제: ${describeEvents(events)}`
    ).toBe(true)
    expect(loopsEvents[2].loops.length, describeEvents(events)).toBe(0)
  })
})

describe('FB2-P01 대조군 — abort()는(interrupt와 달리) self-re-arm 체인을 확실히 끊는다', () => {
  it('턴2 interrupt 직후 abort()하면 턴3(자율)이 도착하기 전에 스트림이 끝난다', async () => {
    const { queryFn, ready } = makeSelfRearmInterruptQueryFn()
    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '반복 작업 시작' }],
      persistent: true,
      sessionKey: 'fb2-p01-selfrearm-2',
    })

    const events: AgentEvent[] = []
    for await (const e of run.events) {
      events.push(e)
      if (e.type === 'text' && (e as { delta: string }).delta === '턴2 진행 중...') {
        await ready
        run.interrupt()
      }
      if (e.type === 'done' && (e as { origin?: string }).origin === 'cron') {
        run.abort()
      }
    }

    const types = events.map((e) => e.type)
    const texts = events
      .filter((e): e is Extract<AgentEvent, { type: 'text' }> => e.type === 'text')
      .map((e) => e.delta)

    expect(texts, describeEvents(events)).not.toContain('턴3 진행 중...')
    const doneCount = types.filter((t) => t === 'done').length
    expect(doneCount, describeEvents(events)).toBeLessThanOrEqual(2)
  })
})
