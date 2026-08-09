import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type {
  AgentEvent,
  AgentEventDone,
  AgentEventAutonomyStatus,
} from '../../../02_Project/00_Source/shared/agentEvents'

const GRACE_PROBE_MS = 100

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
    session_id: 'sess-p12c',
  }
}

type AgentEventError = Extract<AgentEvent, { type: 'error' }>

function dones(events: AgentEvent[]): AgentEventDone[] {
  return events.filter((e): e is AgentEventDone => e.type === 'done')
}
function errorsIn(events: AgentEvent[]): AgentEventError[] {
  return events.filter((e): e is AgentEventError => e.type === 'error')
}
function autonomy(events: AgentEvent[]): AgentEventAutonomyStatus[] {
  return events.filter((e): e is AgentEventAutonomyStatus => e.type === 'autonomy_status')
}
function graceExpired(events: AgentEvent[]): AgentEventAutonomyStatus[] {
  return autonomy(events).filter((e) => e.status === 'ended' && e.reason === 'grace-expired')
}

async function flushMicrotasks(times = 32): Promise<void> {
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
  vi.restoreAllMocks()
})

describe('§1 B-1 — grace pending 중 stream throw: error/done만, grace-expired 오방출 0 (현행 RED)', () => {
  it('turn1 done(grace 예약) 직후 스트림 throw → error 1 · done 2 · grace-expired 0', async () => {
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')
      throw new Error('SDK stream failure (P12 c fixture)')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: 'throw 경로 오방출 재현' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    const observed = {
      doneCount: dones(events).length,
      firstDoneOrigin: dones(events)[0]?.origin,
      errorCount: errorsIn(events).length,
      errorMentionsCause: errorsIn(events)[0]?.message.includes('SDK stream failure') === true,
      graceExpiredCount: graceExpired(events).length,
    }

    expect(observed).toEqual({
      doneCount: 2,
      firstDoneOrigin: 'user',
      errorCount: 1,
      errorMentionsCause: true,
      graceExpiredCount: 0,
    })
  })
})

describe('§2 B-2 — companion: grace pending 중 스트림 자연종료 → grace-expired 1 보존 (GREEN 핀)', () => {
  it('turn1 done(grace 예약) 직후 스트림 자연종료(return) → grace-expired 정확히 1 · error 0', async () => {
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')
      return
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '자연종료 companion' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    const observed = {
      doneCount: dones(events).length,
      firstDoneOrigin: dones(events)[0]?.origin,
      errorCount: errorsIn(events).length,
      graceExpiredCount: graceExpired(events).length,
    }

    expect(observed).toEqual({
      doneCount: 1,
      firstDoneOrigin: 'user',
      errorCount: 0,
      graceExpiredCount: 1,
    })
  })
})

describe('§3 C-1(i) — 무토큰 epoch 자율 continuation 흡수: active 정확히 1회 (거동 보존 핀, GREEN)', () => {
  it('turn1 done → grace 창 안 자율 turn2 흡수 → active === 1 · turn2 origin cron', async () => {
    const barrier = new Barrier()
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')

      let closed = false
      const pull = inputIter.next()
      void pull.then((r) => {
        if (r.done) closed = true
      })
      await barrier.checkpoint()
      if (closed) return
      yield mkResult('turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '자율 진행 origin 핀' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await barrier.waitForCheckpoint()
    await vi.advanceTimersByTimeAsync(GRACE_PROBE_MS)
    await Promise.resolve()
    barrier.release()
    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    const actives = autonomy(events).filter((e) => e.status === 'active')
    const observed = {
      doneOrigins: dones(events).map((e) => e.origin),
      activeCount: actives.length,
      errorCount: errorsIn(events).length,
    }

    expect(observed).toEqual({
      doneOrigins: ['user', 'cron'],
      activeCount: 1,
      errorCount: 0,
    })
  })
})

describe("§4 C-2 — _inputQueue/_queuedSendSeqs desync 주입: console.warn('[agents]…desync…') 1회 + 폴백 유지 (warn 현행 RED)", () => {
  it('desync 상태에서 user 메시지 pull → [agents] desync warn 1회 · 메시지는 token-less로 전달 · 크래시 없음', async () => {
    const barrier = new Barrier()
    const received: unknown[] = []

    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      await barrier.checkpoint()
      const first = await inputIter.next()
      if (first.done) return
      received.push(first.value)
      yield mkResult('desync-turn')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: 'desync 시나리오 입력' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()
    await barrier.waitForCheckpoint()

    const internals = run as unknown as { _inputQueue: string[]; _queuedSendSeqs: number[] }
    expect(internals._inputQueue.length).toBe(1)
    expect(internals._queuedSendSeqs.length).toBe(1)
    internals._queuedSendSeqs.length = 0

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    barrier.release()
    await flushMicrotasks()
    await consume

    const desyncWarns = warnSpy.mock.calls.filter((args) => {
      const joined = args.map((a) => String(a)).join(' ')
      return joined.includes('[agents]') && joined.includes('desync')
    })

    const observed = {
      desyncWarnCount: desyncWarns.length,
      deliveredCount: received.length,
      deliveredContainsInput: JSON.stringify(received[0] ?? null).includes('desync 시나리오 입력'),
      doneOrigins: dones(events).map((e) => e.origin),
      errorCount: errorsIn(events).length,
    }

    expect(observed).toEqual({
      desyncWarnCount: 1,
      deliveredCount: 1,
      deliveredContainsInput: true,
      doneOrigins: ['cron'],
      errorCount: 0,
    })
  })
})
