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

function dones(events: AgentEvent[]): AgentEventDone[] {
  return events.filter((e): e is AgentEventDone => e.type === 'done')
}
function autonomy(events: AgentEvent[]): AgentEventAutonomyStatus[] {
  return events.filter((e): e is AgentEventAutonomyStatus => e.type === 'autonomy_status')
}
function graceExpiredEnded(events: AgentEvent[]): AgentEventAutonomyStatus[] {
  return autonomy(events).filter((e) => e.status === 'ended' && e.reason === 'grace-expired')
}
function sessionStates(events: AgentEvent[]): AgentEvent[] {
  return events.filter((e) => e.type === 'session_state')
}

async function flushMicrotasks(times = 12): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

class GraceProbe {
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

async function snapshotThenAbort(
  run: { abort(): void },
  consume: Promise<void>,
  events: AgentEvent[],
  pull: { secondPullDone: boolean | undefined }
): Promise<{ graceExpired: number; endedTotal: number; secondPullDoneBeforeAbort: boolean | undefined }> {
  await vi.advanceTimersByTimeAsync(EXPIRE_MS)
  await flushMicrotasks()
  const snap = {
    graceExpired: graceExpiredEnded(events).length,
    endedTotal: autonomy(events).filter((e) => e.status === 'ended').length,
    secondPullDoneBeforeAbort: pull.secondPullDone,
  }
  run.abort()
  await consume
  return snap
}

describe('핵심RED — 최신 session_state=running이면 큐 empty라도 idle-close 예약 안 함(권위 소비)', () => {
  it('running 신호 수신 후 큐 empty done → grace 예약 안 됨(hold): grace-expired 0 · 입력 스트림 미종료', async () => {
    const pull: { secondPullDone: boolean | undefined } = { secondPullDone: undefined }
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield ss('running')
      yield mkResult('turn1')
      const second = await inputIter.next()
      pull.secondPullDone = second.done
      if (!second.done) yield mkResult('turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'session_state 권위 소비' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    const snap = await snapshotThenAbort(run, consume, events, pull)

    expect(sessionStates(events)).toContainEqual({ type: 'session_state', state: 'running' })
    expect(snap.graceExpired).toBe(0)
    expect(snap.secondPullDoneBeforeAbort).not.toBe(true)
  })
})

describe('S1[안전불변식] — idle 신호가 있어도 대기 입력(pendingSends>0)이 있으면 idle-close 강제 안 함', () => {
  it('turn1 경계에 pending push 존재 → turn2 처리(로컬 큐 우선) · turn1 경계에서 조기 close 없음', async () => {
    const probe = new GraceProbe()
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield ss('idle')
      await probe.checkpoint()
      yield mkResult('turn1')
      const second = await inputIter.next()
      if (second.done) return
      yield mkResult('turn2')
      const third = await inputIter.next()
      if (!third.done) yield mkResult('turn3-unexpected')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '초기 대화' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await probe.waitForCheckpoint()
    run.push('대기 중 사용자 입력')
    probe.release()
    await flushMicrotasks()
    const earlyGraceExpired = graceExpiredEnded(events).length

    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await flushMicrotasks()
    run.abort()
    await consume

    expect(earlyGraceExpired).toBe(0)
    const userDones = dones(events).filter((e) => e.origin === 'user')
    expect(userDones.length).toBeGreaterThanOrEqual(2)
  })
})

describe('S2[RED] — latest-wins: idle 뒤 running이 오면 최신=running → idle-close 예약 안 함', () => {
  it('idle→running 순서 수신 후 큐 empty done → grace 예약 안 됨(hold): grace-expired 0 · 스트림 미종료', async () => {
    const pull: { secondPullDone: boolean | undefined } = { secondPullDone: undefined }
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield ss('idle')
      yield ss('running')
      yield mkResult('turn1')
      const second = await inputIter.next()
      pull.secondPullDone = second.done
      if (!second.done) yield mkResult('turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'latest-wins 검증' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    const snap = await snapshotThenAbort(run, consume, events, pull)

    expect(sessionStates(events)).toEqual([
      { type: 'session_state', state: 'idle' },
      { type: 'session_state', state: 'running' },
    ])
    expect(snap.graceExpired).toBe(0)
    expect(snap.secondPullDoneBeforeAbort).not.toBe(true)
  })
})

describe('S3[안전불변식] — session_state 0건 세션은 기존 pendingSends grace fallback 그대로', () => {
  it('신호 미수신 무활동 done → grace 만료 → ended(grace-expired) + 입력 스트림 닫힘', async () => {
    let secondPullDone: boolean | undefined = undefined
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')
      const second = await inputIter.next()
      secondPullDone = second.done
      if (!second.done) yield mkResult('unexpected-turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '신호 없는 대화' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    expect(sessionStates(events).length).toBe(0)
    expect(secondPullDone).toBe(true)
    expect(graceExpiredEnded(events).length).toBeGreaterThanOrEqual(1)
    expect(dones(events).length).toBe(1)
    expect(dones(events)[0].origin).toBe('user')
  })
})

describe('S4[RED] — 최신 session_state=requires_action이면 idle-close 금지(권한 대기 생존)', () => {
  it('requires_action 수신 후 큐 empty done → grace 예약 안 됨(hold): grace-expired 0 · 스트림 미종료', async () => {
    const pull: { secondPullDone: boolean | undefined } = { secondPullDone: undefined }
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield ss('requires_action')
      yield mkResult('turn1')
      const second = await inputIter.next()
      pull.secondPullDone = second.done
      if (!second.done) yield mkResult('turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '권한 대기 세션' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    const snap = await snapshotThenAbort(run, consume, events, pull)

    expect(sessionStates(events)).toContainEqual({ type: 'session_state', state: 'requires_action' })
    expect(snap.graceExpired).toBe(0)
    expect(snap.secondPullDoneBeforeAbort).not.toBe(true)
  })
})

describe('S5[안전불변식] — running 신호 잔존에도 abort는 최우선으로 세션을 종료한다', () => {
  it('running 수신 후 abort → 입력 스트림 즉시 종료(consume 자연 해소) · error 없음', async () => {
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield ss('running')
      yield mkResult('turn1')
      const second = await inputIter.next()
      if (!second.done) yield mkResult('turn2-unexpected')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'abort 최우선' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await flushMicrotasks()
    run.abort()
    await consume

    expect(sessionStates(events)).toContainEqual({ type: 'session_state', state: 'running' })
    expect(events.some((e) => e.type === 'error')).toBe(false)
    expect(dones(events).length).toBe(1)
  })
})

describe('S6[안전불변식] — grace 대기 중 idle 신호가 grace 타이밍을 바꾸지 않고 continuation 흡수 불변', () => {
  it('turn1 grace 예약 → grace 창 안에 idle 신호+continuation 도착 → active 방출 · 즉시 close 없음', async () => {
    const probe = new GraceProbe()
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')

      let closed = false
      const pending = inputIter.next()
      void pending.then((r) => {
        if (r.done) closed = true
      })
      await probe.checkpoint()
      if (closed) return
      yield ss('idle')
      yield mkResult('turn2')
      const third = await inputIter.next()
      if (!third.done) yield mkResult('turn3-unexpected')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '목표까지 자율 진행' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    const gotCheckpoint = await Promise.race([
      probe.waitForCheckpoint().then(() => true as const),
      consume.then(() => false as const),
    ])
    expect(gotCheckpoint).toBe(true)
    await vi.advanceTimersByTimeAsync(GRACE_PROBE_MS)
    await Promise.resolve()
    probe.release()
    await flushMicrotasks()

    const endedBeforeExpire = graceExpiredEnded(events).length
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    expect(endedBeforeExpire).toBe(0)
    const actives = autonomy(events).filter((e) => e.status === 'active')
    expect(actives.length).toBeGreaterThanOrEqual(1)
    expect(dones(events).length).toBeGreaterThanOrEqual(2)
    expect(graceExpiredEnded(events).length).toBeGreaterThanOrEqual(1)
    expect(events.some((e) => e.type === 'error')).toBe(false)
  })
})

describe('실순서RED — running→result(done)→idle(done 뒤)이면 후행 idle이 grace 재트리거 → 결국 close', () => {
  it('running→turn1 done(큐 empty)→idle(done 뒤!) 순서 → idle 관찰이 grace 재트리거 → grace-close: grace-expired≥1 · 입력 스트림 done:true', async () => {
    const pull: { secondPullDone: boolean | undefined } = { secondPullDone: undefined }
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield ss('running')
      yield mkResult('turn1')
      yield ss('idle')
      const second = await inputIter.next()
      pull.secondPullDone = second.done
      if (!second.done) yield mkResult('turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '실 SDK 순서 idle-close' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    const snap = await snapshotThenAbort(run, consume, events, pull)

    expect(sessionStates(events)).toEqual([
      { type: 'session_state', state: 'running' },
      { type: 'session_state', state: 'idle' },
    ])
    expect(snap.graceExpired).toBeGreaterThanOrEqual(1)
    expect(snap.secondPullDoneBeforeAbort).toBe(true)
  })
})

describe('실순서+continuation RED — 후행 idle이 grace를 켜도 continuation이 흡수(active) · 이후 무활동에서 close', () => {
  it('running→turn1 done→idle(done 뒤)→continuation turn2 흡수(active) → 최종 grace-close', async () => {
    const probe = new GraceProbe()
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield ss('running')
      yield mkResult('turn1')
      yield ss('idle')

      let closed = false
      const pending = inputIter.next()
      void pending.then((r) => {
        if (r.done) closed = true
      })
      await probe.checkpoint()
      if (closed) return
      yield mkResult('turn2')
      const third = await inputIter.next()
      if (!third.done) yield mkResult('turn3-unexpected')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '실 순서 continuation 흡수' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    const gotCheckpoint = await Promise.race([
      probe.waitForCheckpoint().then(() => true as const),
      consume.then(() => false as const),
    ])
    expect(gotCheckpoint).toBe(true)
    await vi.advanceTimersByTimeAsync(GRACE_PROBE_MS)
    await Promise.resolve()
    probe.release()
    await flushMicrotasks()

    const endedBeforeExpire = graceExpiredEnded(events).length
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    expect(sessionStates(events)).toContainEqual({ type: 'session_state', state: 'running' })
    expect(sessionStates(events)).toContainEqual({ type: 'session_state', state: 'idle' })
    expect(endedBeforeExpire).toBe(0)
    const actives = autonomy(events).filter((e) => e.status === 'active')
    expect(actives.length).toBeGreaterThanOrEqual(1)
    expect(dones(events).length).toBeGreaterThanOrEqual(2)
    expect(graceExpiredEnded(events).length).toBeGreaterThanOrEqual(1)
    expect(events.some((e) => e.type === 'error')).toBe(false)
  })
})
