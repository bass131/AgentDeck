import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Project/00_Source/main/01_agents/queryFn'
import type { AgentEvent } from '../../../02_Project/00_Source/shared/agentEvents'

const REJECT_MARKER = 'S1-interrupt-reject-p15r1'

function mkAssistantText(text: string, id = 'm1'): Record<string, unknown> {
  return {
    type: 'assistant',
    message: {
      id,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    },
    parent_tool_use_id: null,
    uuid: `uuid-asst-${id}`,
    session_id: 'sess-s1',
  }
}

function mkResult(): Record<string, unknown> {
  return {
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: 1,
    result: 'done',
    stop_reason: 'end_turn',
    total_cost_usd: 0,
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    errors: [],
    uuid: 'uuid-0000-0000-0000-0000-0000000000s1',
    session_id: 'sess-s1',
  }
}

function makeRejectingInterruptQueryFn(): {
  queryFn: QueryFn
  started: Promise<void>
  release: () => void
} {
  let releaseFn: () => void = () => {}
  let startedResolve: () => void = () => {}
  const started = new Promise<void>((r) => { startedResolve = r })

  const queryFn: QueryFn = function () {
    const gen = (async function* () {
      yield mkAssistantText('스트리밍 진행 중…')
      startedResolve()
      await new Promise<void>((r) => { releaseFn = r })
      yield mkResult()
    })()
    ;(gen as unknown as Record<string, unknown>)['interrupt'] = () =>
      Promise.reject(new Error(REJECT_MARKER))
    return gen as AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
  }

  return { queryFn, started, release: () => releaseFn() }
}

async function countMarkerUnhandledRejections(fn: () => Promise<void>): Promise<number> {
  const captured: unknown[] = []
  const previous = process.listeners('unhandledRejection')
  process.removeAllListeners('unhandledRejection')
  const capture = (reason: unknown): void => { captured.push(reason) }
  process.on('unhandledRejection', capture)
  try {
    await fn()
    await new Promise((r) => setTimeout(r, 20))
    await new Promise((r) => setTimeout(r, 20))
  } finally {
    process.removeAllListeners('unhandledRejection')
    for (const l of previous) process.on('unhandledRejection', l)
  }
  return captured.filter(
    (reason) => reason instanceof Error && reason.message.includes(REJECT_MARKER)
  ).length
}

describe('GAP1 P15-R1 S1 — queryHandle.interrupt() reject 흡수 (RED)', () => {
  it('interrupt() 경로: 핸들 interrupt가 reject해도 unhandledRejection 미발생(.catch 흡수 계약)', async () => {
    const { queryFn, started, release } = makeRejectingInterruptQueryFn()
    const backend = new ClaudeCodeBackend(queryFn)

    const count = await countMarkerUnhandledRejections(async () => {
      const run = backend.start({ messages: [{ role: 'user', content: 'S1 interrupt 경로' }] })
      const events: AgentEvent[] = []
      const consumed = (async () => {
        for await (const e of run.events) events.push(e)
      })()
      await started
      run.interrupt()
      await new Promise((r) => setTimeout(r, 10))
      release()
      await consumed
    })

    expect(count).toBe(0)
  })

  it('abort() 경로: 핸들 interrupt가 reject해도 unhandledRejection 미발생(.catch 흡수 계약)', async () => {
    const { queryFn, started, release } = makeRejectingInterruptQueryFn()
    const backend = new ClaudeCodeBackend(queryFn)

    const count = await countMarkerUnhandledRejections(async () => {
      const run = backend.start({ messages: [{ role: 'user', content: 'S1 abort 경로' }] })
      const events: AgentEvent[] = []
      const consumed = (async () => {
        for await (const e of run.events) events.push(e)
      })()
      await started
      run.abort()
      await new Promise((r) => setTimeout(r, 10))
      release()
      await consumed
    })

    expect(count).toBe(0)
  })
})
