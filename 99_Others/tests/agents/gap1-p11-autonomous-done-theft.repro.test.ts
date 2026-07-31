import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import { IDLE_CLOSE_GRACE_MS } from '../../../02_Source/main/01_agents/claudeAgentRun'
import type {
  AgentEvent,
  AgentEventDone,
  AgentEventSessionState,
  AgentEventAutonomyStatus,
} from '../../../02_Source/shared/agentEvents'

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
function dones(events: AgentEvent[]): AgentEventDone[] {
  return events.filter((e): e is AgentEventDone => e.type === 'done')
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

describe('RED 재현 — 자율턴 done 탈취로 실행중 B 세션 조기 idle-close (완전 역전 misfire)', () => {
  it('running_A→push(B)→done_A(pending 탈취)→running_B→stale idle_A→침묵: grace 만료가 세션을 조기 종료', async () => {
    const barrier = new Barrier()
    const pull: { bDone: boolean | undefined; afterBDone: boolean | undefined } = {
      bDone: undefined,
      afterBDone: undefined,
    }
    let closeObserved = 0

    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const bootstrap = await inputIter.next()
      if (bootstrap.done) return

      yield ss('running')
      yield mkResult('bootstrap')
      yield ss('idle')

      yield ss('running')

      await barrier.checkpoint()

      yield mkResult('A')

      const second = await inputIter.next()
      pull.bDone = second.done

      yield ss('running')
      yield ss('idle')

      const third = await inputIter.next()
      pull.afterBDone = third.done
      await barrier.checkpoint()
      if (!third.done) yield mkResult('C-unexpected')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '자율턴 done 탈취 재현' }],
      persistent: true,
    })
    run.onSessionClosing?.(() => {
      closeObserved++
    })

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

    await vi.advanceTimersByTimeAsync(IDLE_CLOSE_GRACE_MS - 1)
    await flushMicrotasks()
    const graceExpiredBeforeExpiry = graceExpiredEnded(events).length
    const closeBeforeExpiry = closeObserved

    await vi.advanceTimersByTimeAsync(2)
    await flushMicrotasks()

    const doneOrigins = dones(events).map((e) => e.origin)
    const graceExpiredCount = graceExpiredEnded(events).length
    const observed = {
      bDone: pull.bDone,
      doneOrigins,
      graceExpiredCount,
      closeObserved,
      afterBDone: pull.afterBDone === true,
    }

    run.abort()
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()
    await consume

    const seenStates = sessionStates(events).map((e) => e.state)
    expect(seenStates).toContain('running')
    expect(seenStates).toContain('idle')
    expect(idleObservedBeforeDispatch).toBe(true)
    expect(graceExpiredBeforeExpiry).toBe(0)
    expect(closeBeforeExpiry).toBe(0)

    expect(observed).toEqual({
      bDone: false,
      doneOrigins: ['user', 'cron'],
      graceExpiredCount: 0,
      closeObserved: 0,
      afterBDone: false,
    })
  })
})
