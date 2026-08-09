import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type {
  AgentEvent,
  AgentEventSessionState,
  AgentEventAutonomyStatus,
} from '../../../02_Source/shared/agentEvents'

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

function sessionStates(events: AgentEvent[]): AgentEventSessionState[] {
  return events.filter((e): e is AgentEventSessionState => e.type === 'session_state')
}
function autonomy(events: AgentEvent[]): AgentEventAutonomyStatus[] {
  return events.filter((e): e is AgentEventAutonomyStatus => e.type === 'autonomy_status')
}
function graceExpiredEnded(events: AgentEvent[]): AgentEventAutonomyStatus[] {
  return autonomy(events).filter((e) => e.status === 'ended' && e.reason === 'grace-expired')
}

async function flushMicrotasks(times = 12): Promise<void> {
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

describe('봉쇄잠금 — dispatch_B(push)가 stale idle_A grace를 봉쇄 → idle-close 미발동(완전 역전 misfire 부재)', () => {
  it('running_A→done_A→idle_A(grace 예약)→dispatch_B 침묵→grace 창 통과: graceExpired===0 · B는 실제 dispatch됨(미close)', async () => {
    const barrier = new Barrier()
    const pull: { secondDone: boolean | undefined } = { secondDone: undefined }
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield ss('running')
      yield mkResult('A')
      yield ss('idle')
      await barrier.checkpoint()
      const second = await inputIter.next()
      pull.secondDone = second.done
      const third = await inputIter.next()
      if (!third.done) yield mkResult('C-unexpected')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '완전 역전 봉쇄' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await barrier.waitForCheckpoint()
    await flushMicrotasks()
    const idleObservedBeforeDispatch = sessionStates(events).some((e) => e.state === 'idle')

    run.push('B')
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()

    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await flushMicrotasks()
    const graceExpired = graceExpiredEnded(events).length
    const secondDone = pull.secondDone

    run.abort()
    await consume

    const observed = sessionStates(events).map((e) => e.state)
    expect(observed).toContain('running')
    expect(observed).toContain('idle')
    expect(idleObservedBeforeDispatch).toBe(true)
    expect(secondDone).toBe(false)

    expect(graceExpired).toBe(0)
  })
})
