import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import { MAX_CONSECUTIVE_AUTONOMOUS_TURNS } from '../../../02_Project/00_Source/main/01_agents/claudeAgentRun'
import type {
  AgentEvent,
  AgentEventDone,
  AgentEventAutonomyStatus,
  AgentEventLoops,
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

function mkErrorDuringExecutionResult(numTurns = 2) {
  return {
    type: 'result' as const,
    subtype: 'error_during_execution' as const,
    is_error: true,
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: numTurns,
    total_cost_usd: 0,
    permission_denials: [],
    errors: [],
    uuid: 'uuid-err-0000-0000-0000-000000000099' as `${string}-${string}-${string}-${string}-${string}`,
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

function mkAssistantToolUse(id: string, name: string, input: unknown) {
  return {
    type: 'assistant' as const,
    message: {
      role: 'assistant' as const,
      content: [{ type: 'tool_use', id, name, input }],
    },
    parent_tool_use_id: null,
  }
}

function mkWakeupToolUse(toolUseId: string, delaySeconds: number, reason: string, prompt = '') {
  return {
    type: 'assistant' as const,
    message: {
      id: `msg_${toolUseId}`,
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'tool_use', id: toolUseId, name: 'ScheduleWakeup', input: { delaySeconds, reason, prompt } }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    parent_tool_use_id: null,
    uuid: `uuid-asst-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

function mkWakeupToolResult(toolUseId: string, content: string) {
  return {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content }],
    },
    parent_tool_use_id: null,
    uuid: `uuid-user-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

function mkReplayUser(toolUseId = 'toolu_replayed_001') {
  return {
    type: 'user' as const,
    isReplay: true,
    parent_tool_use_id: null,
    tool_use_result: { ok: true },
    uuid: 'uuid-replay-0000-0000-000000000009' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
    message: {
      role: 'user' as const,
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content: [{ type: 'text', text: 'replayed output' }] }],
    },
  }
}

function dones(events: AgentEvent[]): AgentEventDone[] {
  return events.filter((e): e is AgentEventDone => e.type === 'done')
}
function doneOrigins(events: AgentEvent[]): Array<'user' | 'cron' | undefined> {
  return dones(events).map((e) => e.origin)
}
function autonomy(events: AgentEvent[]): AgentEventAutonomyStatus[] {
  return events.filter((e): e is AgentEventAutonomyStatus => e.type === 'autonomy_status')
}
function loopsEvents(events: AgentEvent[]): AgentEventLoops[] {
  return events.filter((e): e is AgentEventLoops => e.type === 'loops')
}

async function flushMicrotasks(times = 16): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

async function settle(pred: () => boolean, rounds = 400): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    if (pred()) return
    await Promise.resolve()
  }
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

async function driveCheckpoints(barrier: Barrier, consume: Promise<void>, bound: number): Promise<void> {
  for (let i = 0; i < bound; i++) {
    const gotCheckpoint = await Promise.race([
      barrier.waitForCheckpoint().then(() => true as const),
      consume.then(() => false as const),
    ])
    if (!gotCheckpoint) break
    await vi.advanceTimersByTimeAsync(GRACE_PROBE_MS)
    await Promise.resolve()
    barrier.release()
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('불변식 ① — 자율 A done이 B token 완료 불가 (B origin 보존·조기 close 0)', () => {
  it('①a [delivered→owned 앵커] B가 A late done 前 pull(delivered)돼도 A가 B token 완료 불가 — B 첫 스트림 후 B done이 자기 token 완료', async () => {
    const barrier = new Barrier()
    const pull: { bPulled: boolean } = { bPulled: false }
    let closeObserved = 0

    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const bootstrap = await inputIter.next()
      if (bootstrap.done) return
      yield mkResult('bootstrap')
      yield ss('running')
      await barrier.checkpoint()
      const second = await inputIter.next()
      pull.bPulled = !second.done
      yield mkResult('A')
      yield mkAssistantText('B 첫 스트림 — B 턴 시작', 'msg_b')
      yield mkResult('B')
      await barrier.checkpoint()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '앵커 재현' }], persistent: true })
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

    const observed = { origins: doneOrigins(events), close: closeObserved, bPulled: pull.bPulled }

    run.abort()
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()
    await consume

    expect(observed).toEqual({ origins: ['user', 'cron', 'user'], close: 0, bPulled: true })
  })

  it('①b [pull-after-done 변형] B가 A late done 後 pull돼도 A가 B token 완료 불가', async () => {
    const barrier = new Barrier()
    const pull: { bPulled: boolean } = { bPulled: false }
    let closeObserved = 0

    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const bootstrap = await inputIter.next()
      if (bootstrap.done) return
      yield mkResult('bootstrap')
      await barrier.checkpoint()
      yield mkResult('A')
      const second = await inputIter.next()
      pull.bPulled = !second.done
      yield mkAssistantText('B 첫 스트림', 'msg_b')
      yield mkResult('B')
      await barrier.checkpoint()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '변형 재현' }], persistent: true })
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

    const observed = { origins: doneOrigins(events), close: closeObserved, bPulled: pull.bPulled }

    run.abort()
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()
    await consume

    expect(observed).toEqual({ origins: ['user', 'cron', 'user'], close: 0, bPulled: true })
  })
})

describe('불변식 ② — 연속 push 2건이 각 user done과 1:1 완료 (회귀 잠금, GREEN now)', () => {
  it('bootstrap + push×2 = user done 3개(순수 사용자 인터리브)', async () => {
    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')
      const s2 = await inputIter.next()
      if (s2.done) return
      yield mkResult('turn2')
      const s3 = await inputIter.next()
      if (s3.done) return
      yield mkResult('turn3')
      await inputIter.next()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '순수 사용자 턴' }], persistent: true })

    const events: AgentEvent[] = []
    let pushCount = 0
    const consume = (async () => {
      for await (const e of run.events) {
        events.push(e)
        if (e.type === 'done' && pushCount < 2) {
          pushCount++
          run.push(pushCount === 1 ? 'B1' : 'B2')
        }
      }
    })()

    await settle(() => dones(events).length >= 3)
    const origins = doneOrigins(events)

    run.abort()
    await flushMicrotasks()
    await consume

    expect(origins).toEqual(['user', 'user', 'user'])
  })
})

describe('불변식 ③ — pending push 중 자율 done = 무토큰·cron (오분류 봉합 핵심, RED 예상)', () => {
  it('done_A는 push(B) 이후에 도착해도 B token을 완료하지 않고 origin=cron', async () => {
    const barrier = new Barrier()

    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('bootstrap')
      await barrier.checkpoint()
      yield mkResult('A')
      await barrier.checkpoint()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '자율 done' }], persistent: true })

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

    expect(origins).toEqual(['user', 'cron'])
  })
})

describe('불변식 ④ — interrupt 경로 token 회계 (회귀 잠금, GREEN now)', () => {
  it('④a interrupt-result(is_error emit)는 error 억제 + 귀속(user) token 1회 완료', async () => {
    let resolveWait: (() => void) | null = null
    let readyResolve: (() => void) | null = null
    const ready = new Promise<void>((r) => {
      readyResolve = r
    })

    const queryFn: QueryFn = function (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const gen = (async function* () {
        const first = await inputIter.next()
        if (first.done) return
        yield mkAssistantText('작업 진행 중...', 'msg_prog')
        await new Promise<void>((resolve) => {
          resolveWait = resolve
          readyResolve?.()
        })
        yield mkErrorDuringExecutionResult()
        const second = await inputIter.next()
        if (!second.done) yield mkResult('turn2')
      })()
      ;(gen as unknown as Record<string, unknown>)['interrupt'] = async () => {
        const r = resolveWait
        resolveWait = null
        r?.()
      }
      return gen as AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '긴 작업' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await ready
    run.interrupt()
    await settle(() => dones(events).length >= 1)

    const observed = { origins: doneOrigins(events), hasError: events.some((e) => e.type === 'error') }

    run.abort()
    await flushMicrotasks()
    await consume

    expect(observed).toEqual({ origins: ['user'], hasError: false })
  })

  it('④b interrupt throw 경로 = done 1개(무origin)·error 미표면화·잔여 autonomy 신호 0(잔여 token 0)', async () => {
    let rejectRef: ((e: Error) => void) | null = null
    let readyResolve: (() => void) | null = null
    const ready = new Promise<void>((r) => {
      readyResolve = r
    })

    const queryFn: QueryFn = function (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const gen = (async function* () {
        const first = await inputIter.next()
        if (first.done) return
        yield mkAssistantToolUse('tool-1', 'Bash', { command: 'sleep 100' })
        await new Promise<void>((_resolve, reject) => {
          rejectRef = reject
          readyResolve?.()
        })
      })()
      ;(gen as unknown as Record<string, unknown>)['interrupt'] = async () => {
        const r = rejectRef
        rejectRef = null
        r?.(new Error('Claude Code process exited with code 143'))
      }
      return gen as AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '도구 작업' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await ready
    run.interrupt()
    await settle(() => dones(events).length >= 1)

    const observed = {
      doneCount: dones(events).length,
      hasError: events.some((e) => e.type === 'error'),
      autonomyEnded: autonomy(events).filter((e) => e.status === 'ended').length,
    }

    run.abort()
    await flushMicrotasks()
    await consume

    expect(observed).toEqual({ doneCount: 1, hasError: false, autonomyEnded: 0 })
  })
})

describe('불변식 ⑤ — resume·미수신 fallback token 보존 (회귀 잠금, GREEN now)', () => {
  it('⑤a resume(resumeSessionId) 모드에서 push token이 정확히 완료(user)', async () => {
    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')
      const second = await inputIter.next()
      if (second.done) return
      yield mkResult('turn2')
      await inputIter.next()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: 'resume 후속' }],
      persistent: true,
      resumeSessionId: 'resume-sess-abc',
    })

    const events: AgentEvent[] = []
    let pushed = false
    const consume = (async () => {
      for await (const e of run.events) {
        events.push(e)
        if (e.type === 'done' && !pushed) {
          pushed = true
          run.push('resume 후속 메시지')
        }
      }
    })()

    await settle(() => dones(events).length >= 2)
    const origins = doneOrigins(events)

    run.abort()
    await flushMicrotasks()
    await consume

    expect(origins).toEqual(['user', 'user'])
  })

  it('⑤b 신호 미수신(session_state 무방출) fallback에서 자율 턴이 무토큰·cron으로 보존', async () => {
    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')
      yield mkResult('turn2')
      yield mkResult('turn3')
      await inputIter.next()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '미수신 fallback' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await settle(() => dones(events).length >= 3)
    const origins = doneOrigins(events)

    run.abort()
    await flushMicrotasks()
    await consume

    expect(origins).toEqual(['user', 'cron', 'cron'])
  })
})

describe('불변식 ⑥ — isReplay 제거가 token/epoch 비진행 (회귀 잠금, GREEN now)', () => {
  it('push(B) 이후 isReplay 메시지가 끼어들어도 B token을 소비하지 않고 done_B=user', async () => {
    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')
      const second = await inputIter.next()
      if (second.done) return
      yield mkReplayUser()
      yield mkResult('turn2')
      await inputIter.next()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'replay 회계' }], persistent: true })

    const events: AgentEvent[] = []
    let pushed = false
    const consume = (async () => {
      for await (const e of run.events) {
        events.push(e)
        if (e.type === 'done' && !pushed) {
          pushed = true
          run.push('replay 이후 사용자 메시지')
        }
      }
    })()

    await settle(() => dones(events).length >= 2)
    const observed = {
      origins: doneOrigins(events),
      doneCount: dones(events).length,
    }

    run.abort()
    await flushMicrotasks()
    await consume

    expect(observed).toEqual({ origins: ['user', 'user'], doneCount: 2 })
  })
})

describe('불변식 ⑦a — done.origin 원장이 인터리브 전 구간에서 실제 token 소속을 반영 (RED 예상)', () => {
  it('bootstrap(user)→자율 A(cron)→user B(user)→자율 C(cron) 원장 정합', async () => {
    const barrier = new Barrier()

    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('bootstrap')
      await barrier.checkpoint()
      yield mkResult('A')
      const second = await inputIter.next()
      if (second.done) return
      yield mkResult('B')
      yield mkResult('C')
      await barrier.checkpoint()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '원장 정합' }], persistent: true })

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

    expect(origins).toEqual(['user', 'cron', 'user', 'cron'])
  })
})

describe('불변식 ⑦b — 자율 턴 done이 CronTracker 턴종료(ScheduleWakeup 체인) 판정을 오염시키지 않음 (RED 예상)', () => {
  it('armed wakeup 후 자율 턴이 재예약 없이 종료 → pending push가 있어도 loops:[] 제거가 발화(사용자 인터리빙 오판 X)', async () => {
    const barrier = new Barrier()

    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkWakeupToolUse('wk-1', 270, '모니터링 루프')
      yield mkWakeupToolResult('wk-1', 'Next wakeup scheduled (in 270s).')
      yield mkResult('turn1')
      await barrier.checkpoint()
      yield mkAssistantText('모니터링 종료 판단', 'msg_stop')
      yield mkResult('turn2')
      await barrier.checkpoint()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'wakeup 오염' }], persistent: true })

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

    const snapshot = loopsEvents(events)
    const observed = {
      armed: snapshot.filter((e) => e.loops.length > 0).length,
      removed: snapshot.filter((e) => e.loops.length === 0).length,
    }

    run.abort()
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()
    await consume

    expect(observed).toEqual({ armed: 1, removed: 1 })
  })
})

describe('불변식 ⑦c — 자율 연속 턴 cap 증감이 origin(cron) 기준으로 정확 (회귀 잠금, GREEN now)', () => {
  it('MAX+1 연속 자율(cron) 턴 → 정확히 cap 경계에서 유계 종료 + ended(cap-reached)', async () => {
    const attempts = MAX_CONSECUTIVE_AUTONOMOUS_TURNS + 1
    let autonomousYields = 0
    const barrier = new Barrier()

    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('user-turn')
      for (let i = 0; i < attempts; i++) {
        let closed = false
        const pull = inputIter.next()
        void pull.then((r) => {
          if (r.done) closed = true
        })
        await barrier.checkpoint()
        if (closed) return
        autonomousYields++
        yield mkResult(`cron-${i}`)
      }
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '무인 연속 자율' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await driveCheckpoints(barrier, consume, attempts)
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    const cronDones = dones(events).filter((e) => e.origin === 'cron')
    const capEnded = autonomy(events).filter((e) => e.status === 'ended' && e.reason === 'cap-reached')

    expect(cronDones.length).toBeLessThanOrEqual(MAX_CONSECUTIVE_AUTONOMOUS_TURNS)
    expect(capEnded.length).toBeGreaterThanOrEqual(1)
    expect(autonomousYields).toBeLessThan(attempts)
    expect(cronDones.length).toBe(dones(events).filter((e) => e.origin !== 'user').length)
  })
})
