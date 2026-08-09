import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent, AgentEventDone } from '../../../02_Source/shared/agentEvents'

const EXPIRE_MS = 10_000

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

function ss(state: 'idle' | 'running' | 'requires_action') {
  return {
    type: 'system' as const,
    subtype: 'session_state_changed' as const,
    state,
    uuid: '387c0f11-6230-424c-9f7f-edefffd2df6f',
    session_id: '29c6123d-7baf-485b-a694-413dfcee6ddb',
  }
}

function mkAssistantText(text: string, msgId = 'msg_txt') {
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
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    parent_tool_use_id: null,
    uuid: `uuid-asst-${msgId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

function dones(events: AgentEvent[]): AgentEventDone[] {
  return events.filter((e): e is AgentEventDone => e.type === 'done')
}
function doneOrigins(events: AgentEvent[]): Array<'user' | 'cron' | undefined> {
  return dones(events).map((e) => e.origin)
}

async function flushMicrotasks(times = 16): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

class Barrier {
  private arrivedCount = 0
  private consumedCount = 0
  private arrivedResolvers: Array<() => void> = []
  private releaseResolvers: Array<() => void> = []
  async checkpoint(): Promise<void> {
    this.arrivedCount++
    const resolvers = this.arrivedResolvers
    this.arrivedResolvers = []
    resolvers.forEach((r) => r())
    await new Promise<void>((resolve) => {
      this.releaseResolvers.push(resolve)
    })
  }
  async waitForCheckpoint(): Promise<void> {
    if (this.consumedCount < this.arrivedCount) {
      this.consumedCount++
      return
    }
    await new Promise<void>((resolve) => this.arrivedResolvers.push(resolve))
    this.consumedCount++
  }
  release(): void {
    const r = this.releaseResolvers.shift()
    if (r) r()
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('dogfood 재현 — inter-turn 늦은 idle의 turn epoch ANCHOR 선점 (RED 예상)', () => {
  it('running→result→idle(실측 순서) 후 push(B) → done_B는 user여야 한다(현행: cron 오분류)', async () => {
    const barrier = new Barrier()

    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const bootstrap = await inputIter.next()
      if (bootstrap.done) return
      yield ss('running')
      yield mkResult('turn1')
      yield ss('idle')
      await barrier.checkpoint()
      const second = await inputIter.next()
      if (second.done) return
      yield ss('running')
      yield mkAssistantText('B 응답', 'msg_b')
      yield mkResult('B')
      await barrier.checkpoint()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '늦은 idle 재현' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await barrier.waitForCheckpoint()
    await flushMicrotasks()
    run.push('B')
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()
    await barrier.waitForCheckpoint()
    await flushMicrotasks()

    const origins = doneOrigins(events)

    run.abort()
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()
    await consume

    expect(origins).toEqual(['user', 'user'])
  })
})

describe('dogfood 재현 — 좌초 token의 idle-close 영구 봉쇄 (RED 예상)', () => {
  it('B 턴 완료·최종 idle 후 유예 만료 → 세션이 idle-close 되어야 한다(현행: outstanding 1 잔존으로 미종료)', async () => {
    const barrier = new Barrier()
    let closeObserved = 0

    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const bootstrap = await inputIter.next()
      if (bootstrap.done) return
      yield ss('running')
      yield mkResult('turn1')
      yield ss('idle')
      await barrier.checkpoint()
      const second = await inputIter.next()
      if (second.done) return
      yield ss('running')
      yield mkAssistantText('B 응답', 'msg_b')
      yield mkResult('B')
      yield ss('idle')
      await barrier.checkpoint()
      await inputIter.next()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'idle-close 봉쇄 재현' }], persistent: true })
    run.onSessionClosing?.(() => {
      closeObserved++
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await barrier.waitForCheckpoint()
    await flushMicrotasks()
    run.push('B')
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()
    await barrier.waitForCheckpoint()
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()

    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await flushMicrotasks()

    const observed = { close: closeObserved, doneCount: dones(events).length }

    run.abort()
    await flushMicrotasks()
    await consume

    expect(observed).toEqual({ close: 1, doneCount: 2 })
  })
})
