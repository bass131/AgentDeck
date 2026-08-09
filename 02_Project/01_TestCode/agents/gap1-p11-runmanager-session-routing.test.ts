import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRunManager } from '../../../02_Project/00_Source/main/00_ipc/agentRuns'
import { ClaudeCodeBackend } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import { IDLE_CLOSE_GRACE_MS } from '../../../02_Project/00_Source/main/01_agents/claudeAgentRun'
import type { AgentBackend, AgentRun, AgentRunInput, RunResponse } from '../../../02_Project/00_Source/main/01_agents/AgentBackend'
import type { AgentEvent, AgentEventDone, AgentEventSessionState } from '../../../02_Project/00_Source/shared/agentEvents'

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
function doneOrigins(events: AgentEvent[]): Array<'user' | 'cron' | undefined> {
  return dones(events).map((e) => e.origin)
}
function sessionStates(events: AgentEvent[]): AgentEventSessionState[] {
  return events.filter((e): e is AgentEventSessionState => e.type === 'session_state')
}

async function flushMicrotasks(times = 16): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
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

interface FakeRunHandle {
  run: AgentRun
  pushed: string[]
  fireClosing: () => void
  end: () => void
}

function makeFakeRun(): FakeRunHandle {
  let closingCb: (() => void) | null = null
  const pushed: string[] = []
  const ended = deferred()
  const run: AgentRun = {
    events: (async function* () {
      await ended.promise
      yield* []
    })(),
    abort() {
      ended.resolve()
    },
    interrupt() {},
    push(content: string) {
      pushed.push(content)
    },
    setOrchestration() {},
    onSessionClosing(cb: () => void) {
      closingCb = cb
    },
    respond(_requestId: string, _response: RunResponse) {},
  }
  return {
    run,
    pushed,
    fireClosing: () => closingCb?.(),
    end: () => ended.resolve(),
  }
}

function makeStubBackend() {
  const runs: FakeRunHandle[] = []
  let startCount = 0
  const backend: AgentBackend = {
    id: 'claude-code',
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    listSupportedCommands: () => [],
    start: (_req: AgentRunInput) => {
      startCount++
      const h = makeFakeRun()
      runs.push(h)
      return h.run
    },
  }
  return {
    backend,
    runs,
    get startCount() {
      return startCount
    },
    endAll() {
      runs.forEach((r) => r.end())
    },
  }
}

describe('§1 RunManager 라우팅 계약 — close 발화 여부가 backend.start 횟수를 가른다 (stub, GREEN)', () => {
  it('(a) held-open 세션이 살아있으면 동일 sessionKey 후속 전송이 기존 run으로 라우팅 — backend.start 1회', async () => {
    const stub = makeStubBackend()
    const manager = createRunManager()
    const onEvent = (_e: AgentEvent, _runId: string): void => {}
    const KEY = 'route-live-1'

    const runId1 = await manager.start(
      stub.backend,
      { messages: [{ role: 'user', content: 'turn1' }], persistent: true, sessionKey: KEY },
      onEvent,
    )
    await flushMicrotasks()

    const runId2 = await manager.start(
      stub.backend,
      { messages: [{ role: 'user', content: 'turn2' }], persistent: true, sessionKey: KEY },
      onEvent,
    )
    await flushMicrotasks()

    const observed = {
      startCount: stub.startCount,
      runIdsStable: runId1 === KEY && runId2 === KEY && runId1 === runId2,
      routedContent: stub.runs[0]?.pushed ?? [],
      runCount: stub.runs.length,
    }

    stub.endAll()
    manager.closeAll()
    await flushMicrotasks()

    expect(observed).toEqual({
      startCount: 1,
      runIdsStable: true,
      routedContent: ['turn2'],
      runCount: 1,
    })
  })

  it('(b) 조기 close(onSessionClosing 발화) 시 라우팅 소실 → 후속 전송이 새 run — backend.start 2회 (봉합 前 파급 기전)', async () => {
    const stub = makeStubBackend()
    const manager = createRunManager()
    const onEvent = (_e: AgentEvent, _runId: string): void => {}
    const KEY = 'route-closed-1'

    await manager.start(
      stub.backend,
      { messages: [{ role: 'user', content: 'turn1' }], persistent: true, sessionKey: KEY },
      onEvent,
    )
    await flushMicrotasks()

    stub.runs[0].fireClosing()
    await flushMicrotasks()

    await manager.start(
      stub.backend,
      { messages: [{ role: 'user', content: 'turn2' }], persistent: true, sessionKey: KEY },
      onEvent,
    )
    await flushMicrotasks()

    const observed = {
      startCount: stub.startCount,
      firstRunReceivedNoPush: (stub.runs[0]?.pushed ?? []).length === 0,
      runCount: stub.runs.length,
    }

    stub.endAll()
    manager.closeAll()
    await flushMicrotasks()

    expect(observed).toEqual({
      startCount: 2,
      firstRunReceivedNoPush: true,
      runCount: 2,
    })
  })
})

describe('§2 제품 파급 — 자율 done 실행 중 도착에도 세션 라우팅 보존 (실 sealed 백엔드, GREEN)', () => {
  it('bootstrap→자율 A(도중 push B)→done_A→running_B→stale idle_A: grace 만료해도 조기 close 0 · 동일 sessionKey 후속 전송 start 총 1회', async () => {
    const barrier = new Barrier()
    const pull: { bDone: boolean | undefined; afterBDone: boolean | undefined } = {
      bDone: undefined,
      afterBDone: undefined,
    }

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
      if (!third.done) yield mkResult('C-resend')
    }

    const claudeBackend = new ClaudeCodeBackend(queryFn)
    let backendStartCount = 0
    const countingBackend: AgentBackend = {
      id: 'claude-code',
      isAvailable: () => claudeBackend.isAvailable(),
      version: () => claudeBackend.version(),
      latestVersion: () => claudeBackend.latestVersion(),
      start: (req: AgentRunInput) => {
        backendStartCount++
        return claudeBackend.start(req)
      },
      listSupportedCommands: (workspaceRoot) => claudeBackend.listSupportedCommands(workspaceRoot),
    }

    const manager = createRunManager()
    const seen: AgentEvent[] = []
    const onEvent = (event: AgentEvent, _runId: string): void => {
      seen.push(event)
    }
    const KEY = 'conv-p11-companion'

    const runId1 = await manager.start(
      countingBackend,
      { messages: [{ role: 'user', content: 'bootstrap 턴' }], persistent: true, sessionKey: KEY },
      onEvent,
    )

    await barrier.waitForCheckpoint()
    await flushMicrotasks()
    const idleObservedBeforeDispatch = sessionStates(seen).some((e) => e.state === 'idle')

    const runId2 = await manager.start(
      countingBackend,
      { messages: [{ role: 'user', content: 'B' }], persistent: true, sessionKey: KEY },
      onEvent,
    )
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()

    await vi.advanceTimersByTimeAsync(IDLE_CLOSE_GRACE_MS + 50)
    await flushMicrotasks()

    const closedDuringGrace = pull.afterBDone === true
    const startCallsAfterGrace = backendStartCount

    const runId3 = await manager.start(
      countingBackend,
      { messages: [{ role: 'user', content: 'C-resend' }], persistent: true, sessionKey: KEY },
      onEvent,
    )
    await flushMicrotasks()

    const observed = {
      startCallsAfterGrace,
      startCallsAfterResend: backendStartCount,
      closedDuringGrace,
      bDone: pull.bDone,
      doneOrigins: doneOrigins(seen),
      runIdsStable: runId1 === KEY && runId2 === KEY && runId3 === KEY,
    }

    manager.closeAll()
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()

    const seenStates = sessionStates(seen).map((e) => e.state)
    expect(seenStates).toContain('running')
    expect(seenStates).toContain('idle')
    expect(idleObservedBeforeDispatch).toBe(true)

    expect(observed).toEqual({
      startCallsAfterGrace: 1,
      startCallsAfterResend: 1,
      closedDuringGrace: false,
      bDone: false,
      doneOrigins: ['user', 'cron'],
      runIdsStable: true,
    })
  })
})
