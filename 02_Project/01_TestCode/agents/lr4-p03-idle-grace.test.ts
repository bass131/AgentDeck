import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type {
  AgentEvent,
  AgentEventDone,
  AgentEventAutonomyStatus,
  AutonomyEndedReason,
} from '../../../02_Project/00_Source/shared/agentEvents'

const MAX_CONSECUTIVE_AUTONOMOUS_TURNS = 100

const GRACE_PROBE_MS = 100

const EXPIRE_MS = 10_000

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

async function driveCheckpoints(probe: GraceProbe, consume: Promise<void>, bound: number): Promise<void> {
  for (let i = 0; i < bound; i++) {
    const gotCheckpoint = await Promise.race([
      probe.waitForCheckpoint().then(() => true as const),
      consume.then(() => false as const),
    ])
    if (!gotCheckpoint) break
    await vi.advanceTimersByTimeAsync(GRACE_PROBE_MS)
    await Promise.resolve()
    probe.release()
  }
}

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

function mkInit(sessionId = 'sess-test') {
  return {
    type: 'system' as const,
    subtype: 'init' as const,
    session_id: sessionId,
    apiKeySource: 'none' as const,
    cwd: '/tmp',
    tools: [],
    mcp_servers: [],
    model: 'claude-haiku-4-5-20251001',
    permissionMode: 'default' as const,
    slash_commands: [],
    uuid: 'uuid-init-0000-0000-0000-000000000002' as `${string}-${string}-${string}-${string}-${string}`,
  }
}

function dones(events: AgentEvent[]): AgentEventDone[] {
  return events.filter((e): e is AgentEventDone => e.type === 'done')
}
function autonomy(events: AgentEvent[]): AgentEventAutonomyStatus[] {
  return events.filter((e): e is AgentEventAutonomyStatus => e.type === 'autonomy_status')
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('계약1 — goal 자멸 재현: 유예가 입력을 park시켜 자율 continuation 흡수(다중 스텝 생존)', () => {
  it('turn1 done 이후 continuation이 유예 창에 흡수돼 turn2까지 진행(done ≥2 + active)', async () => {
    const probe = new GraceProbe()
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
      await probe.checkpoint()

      if (closed) return
      yield mkResult('turn2')

    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '목표 달성까지 계속 진행해줘' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()
    await driveCheckpoints(probe, consume, 1)
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    expect(dones(events).length).toBeGreaterThanOrEqual(2)
    const actives = autonomy(events).filter((e) => e.status === 'active')
    expect(actives.length).toBeGreaterThanOrEqual(1)
    expect(events.some((e) => e.type === 'error')).toBe(false)
  })
})

describe('계약2 — 유예 만료: continuation 없으면 grace 경과 후 자연종료 + ended(grace-expired)', () => {
  it('무활동 done → 유예 만료 → 입력 스트림 닫힘 + ended(grace-expired) 방출', async () => {
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
    const run = backend.start({
      messages: [{ role: 'user', content: '활동 없는 대화' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    expect(secondPullDone).toBe(true)
    const ended = autonomy(events).filter((e) => e.status === 'ended')
    expect(ended.length).toBeGreaterThanOrEqual(1)
    const reason: AutonomyEndedReason = 'grace-expired'
    expect(ended.some((e) => e.reason === reason)).toBe(true)
    expect(dones(events).length).toBe(1)
    expect(dones(events)[0].origin).toBe('user')
  })
})

describe('계약3 — 상한: 연속 자율 턴이 상한을 넘으면 유계 강제종료 + ended(cap-reached)', () => {
  it('101 연속 자율(cron-origin) 턴 구동 → 무한이 아닌 유계 종료 + ended(cap-reached)', async () => {
    const attempts = MAX_CONSECUTIVE_AUTONOMOUS_TURNS + 1
    let autonomousYields = 0
    const probe = new GraceProbe()

    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('user-turn')

      for (let i = 0; i < attempts; i++) {
        let closed = false
        const pull = inputIter.next()
        void pull.then((r) => {
          if (r.done) closed = true
        })
        await probe.checkpoint()
        if (closed) return
        autonomousYields++
        yield mkResult(`cron-turn-${i}`)
      }
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '멈추라고 할 때까지 계속' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()
    await driveCheckpoints(probe, consume, attempts)
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    const cronDones = dones(events).filter((e) => e.origin === 'cron')
    expect(cronDones.length).toBeLessThanOrEqual(MAX_CONSECUTIVE_AUTONOMOUS_TURNS)
    expect(autonomousYields).toBeLessThan(attempts)
    const ended = autonomy(events).filter((e) => e.status === 'ended')
    const reason: AutonomyEndedReason = 'cap-reached'
    expect(ended.some((e) => e.reason === reason)).toBe(true)
  })

  it('자율 턴 몇 개 → 사용자 push 개입 → 카운터 리셋(다시 자율 여유 확보)', async () => {
    let pushed = false
    const preAutonomous = 3
    const probe = new GraceProbe()

    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('user-turn-1')

      for (let i = 0; i < preAutonomous; i++) {
        let closed = false
        const pull = inputIter.next()
        void pull.then((r) => {
          if (r.done) closed = true
        })
        await probe.checkpoint()
        if (closed) return
        yield mkResult(`cron-turn-${i}`)
      }

      const afterPush = await inputIter.next()
      if (afterPush.done) return
      yield mkResult('user-turn-2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '자율로 몇 번 돌려줘' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) {
        events.push(e)
        if (!pushed && e.type === 'done' && e.origin === 'cron') {
          pushed = true
          run.push('사용자 개입: 계속해')
        }
      }
    })()
    await driveCheckpoints(probe, consume, preAutonomous)
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    const userDones = dones(events).filter((e) => e.origin === 'user')
    expect(userDones.length).toBeGreaterThanOrEqual(2)
    const capEnded = autonomy(events).filter((e) => e.status === 'ended' && e.reason === 'cap-reached')
    expect(capEnded.length).toBe(0)
  })
})

describe('계약4 — 신호 방출 정합: active(흡수) → ended(reason) 순서 + reason 리터럴 계약 일치', () => {
  it('goal 세션: active가 ended보다 먼저 방출되고 ended.reason이 계약 리터럴과 일치', async () => {
    const probe = new GraceProbe()
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkInit('sess-lr4-p03-c4')
      yield mkResult('turn1')

      let closed = false
      const pull = inputIter.next()
      void pull.then((r) => {
        if (r.done) closed = true
      })
      await probe.checkpoint()
      if (closed) return
      yield mkResult('turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '목표까지 자율 진행' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()
    await driveCheckpoints(probe, consume, 1)
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    const statuses = autonomy(events)
    const firstActiveIdx = statuses.findIndex((e) => e.status === 'active')
    const firstEndedIdx = statuses.findIndex((e) => e.status === 'ended')
    expect(firstActiveIdx).toBeGreaterThanOrEqual(0)
    expect(firstEndedIdx).toBeGreaterThanOrEqual(0)
    expect(firstActiveIdx).toBeLessThan(firstEndedIdx)
    const active = statuses[firstActiveIdx]
    expect(active.reason).toBeUndefined()
    const ended = statuses[firstEndedIdx]
    const validReasons: AutonomyEndedReason[] = ['grace-expired', 'cap-reached']
    expect(ended.reason).toBeDefined()
    expect(validReasons).toContain(ended.reason!)
  })
})

describe('계약5 — origin-gate: 사용자 push continuation은 spurious active를 방출하지 않는다', () => {
  it('사용자 push continuation은 spurious active를 방출하지 않는다', async () => {
    let pushed = false

    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')

      const afterPush = await inputIter.next()
      if (afterPush.done) return
      yield mkResult('turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '초기 사용자 대화' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) {
        events.push(e)
        if (!pushed && e.type === 'done') {
          pushed = true
          run.push('사용자 후속')
        }
      }
    })()
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    expect(dones(events).length).toBeGreaterThanOrEqual(2)
    expect(dones(events).every((e) => e.origin === 'user')).toBe(true)
    expect(events.filter((e) => e.type === 'autonomy_status' && e.status === 'active').length).toBe(0)
  })
})
