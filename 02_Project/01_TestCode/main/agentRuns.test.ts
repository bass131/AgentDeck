import { describe, it, expect } from 'vitest'
import { createRunManager } from '../../../02_Project/00_Source/main/00_ipc/agentRuns'
import type { AgentBackend, AgentRun, AgentRunInput } from '../../../02_Project/00_Source/main/01_agents/AgentBackend'
import type { AgentEvent, AgentEventLoops } from '../../../02_Project/00_Source/shared/agentEvents'
import type { BackendId } from '../../../02_Project/00_Source/shared/ipcContract'

function makeFakeRun(events: AgentEvent[], abortCallback?: () => void): AgentRun {
  let aborted = false
  const abortFn = () => {
    aborted = true
    abortCallback?.()
  }

  const iterable: AsyncIterable<AgentEvent> = {
    [Symbol.asyncIterator]() {
      let index = 0
      return {
        async next() {
          if (aborted || index >= events.length) {
            return { value: undefined as unknown as AgentEvent, done: true }
          }
          return { value: events[index++], done: false }
        },
        async return() {
          aborted = true
          return { value: undefined as unknown as AgentEvent, done: true }
        }
      }
    }
  }

  return {
    events: iterable,
    abort: abortFn,
    interrupt: () => {},
    push: () => {},
    respond: () => {}
  }
}

function makeFakeBackend(events: AgentEvent[]): AgentBackend {
  return {
    id: 'claude-code' as BackendId,
    isAvailable: async () => true,
    version: async () => '1.0.0',
    latestVersion: async () => null,
    start: (_req: AgentRunInput): AgentRun => makeFakeRun(events),
    listSupportedCommands: () => []
  }
}

describe('createRunManager', () => {
  it('start()는 고유한 runId를 반환한다', async () => {
    const manager = createRunManager()
    const events: AgentEvent[] = [{ type: 'done' }]
    const backend = makeFakeBackend(events)

    const collectedEvents: AgentEvent[] = []
    const runId = await manager.start(backend, { messages: [] }, (e) => collectedEvents.push(e))

    expect(typeof runId).toBe('string')
    expect(runId.length).toBeGreaterThan(0)
  })

  it('두 번의 start()는 서로 다른 runId를 반환한다', async () => {
    const manager = createRunManager()
    const backend = makeFakeBackend([{ type: 'done' }])

    const id1 = await manager.start(backend, { messages: [] }, () => {})
    const id2 = await manager.start(backend, { messages: [] }, () => {})

    expect(id1).not.toBe(id2)
  })

  it('이벤트 콜백으로 AgentEvent를 수신한다', async () => {
    const manager = createRunManager()
    const fakeEvents: AgentEvent[] = [
      { type: 'text', delta: 'hello' },
      { type: 'text', delta: ' world' },
      { type: 'done' }
    ]
    const backend = makeFakeBackend(fakeEvents)
    const received: AgentEvent[] = []

    const runId = await manager.start(backend, { messages: [] }, (e) => received.push(e))

    await new Promise<void>((resolve) => setTimeout(resolve, 50))

    expect(received.length).toBe(3)
    expect(received[0]).toEqual({ type: 'text', delta: 'hello' })
    expect(received[2]).toEqual({ type: 'done' })
    expect(runId).toBeTruthy()
  })

  it('abort()는 진행 중인 run을 중단한다', async () => {
    const manager = createRunManager()
    let abortCalled = false

    const run = makeFakeRun(
      [{ type: 'text', delta: 'streaming...' }, { type: 'done' }],
      () => { abortCalled = true }
    )

    const backend: AgentBackend = {
      id: 'claude-code' as BackendId,
      isAvailable: async () => true,
      version: async () => null,
      latestVersion: async () => null,
      start: () => run,
      listSupportedCommands: () => []
    }

    const runId = await manager.start(backend, { messages: [] }, () => {})
    const accepted = manager.abort(runId)

    expect(accepted).toBe(true)
    await new Promise<void>((resolve) => setTimeout(resolve, 50))
    expect(abortCalled).toBe(true)
  })

  it('abort()는 존재하지 않는 runId에 false를 반환한다', () => {
    const manager = createRunManager()
    const accepted = manager.abort('nonexistent-run-id')
    expect(accepted).toBe(false)
  })

  it('완료된 run에 abort()를 호출하면 false를 반환한다', async () => {
    const manager = createRunManager()
    const backend = makeFakeBackend([{ type: 'done' }])

    const runId = await manager.start(backend, { messages: [] }, () => {})

    await new Promise<void>((resolve) => setTimeout(resolve, 100))

    const accepted = manager.abort(runId)
    expect(accepted).toBe(false)
  })

  it('onEvent 콜백은 자기 run의 runId를 인자로 받는다 (첫 이벤트 포함)', async () => {
    const manager = createRunManager()
    const backend = makeFakeBackend([{ type: 'text', delta: 'a' }, { type: 'done' }])
    const seen: string[] = []

    const runId = await manager.start(backend, { messages: [] }, (_e, rid) => seen.push(rid))
    await new Promise<void>((resolve) => setTimeout(resolve, 50))

    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((r) => r === runId)).toBe(true)
  })

  it('동시 2개 run — 각 콜백이 자기 runId만 받는다 (멀티 동시실행 토대)', async () => {
    const manager = createRunManager()
    const backend = makeFakeBackend([{ type: 'text', delta: 'x' }, { type: 'done' }])
    const got1: string[] = []
    const got2: string[] = []

    const id1 = await manager.start(backend, { messages: [] }, (_e, rid) => got1.push(rid))
    const id2 = await manager.start(backend, { messages: [] }, (_e, rid) => got2.push(rid))
    await new Promise<void>((resolve) => setTimeout(resolve, 60))

    expect(id1).not.toBe(id2)
    expect(got1.length).toBeGreaterThan(0)
    expect(got2.length).toBeGreaterThan(0)
    expect(got1.every((r) => r === id1)).toBe(true)
    expect(got2.every((r) => r === id2)).toBe(true)
    expect(got1).not.toContain('')
    expect(got2).not.toContain('')
  })

  it('error 이벤트도 콜백으로 전달된다', async () => {
    const manager = createRunManager()
    const fakeEvents: AgentEvent[] = [
      { type: 'error', message: 'something went wrong' }
    ]
    const backend = makeFakeBackend(fakeEvents)
    const received: AgentEvent[] = []

    await manager.start(backend, { messages: [] }, (e) => received.push(e))
    await new Promise<void>((resolve) => setTimeout(resolve, 50))

    const errors = received.filter((e) => e.type === 'error')
    expect(errors.length).toBe(1)
    expect((errors[0] as { type: 'error'; message: string }).message).toBe('something went wrong')
  })
})

import type { RunResponse } from '../../../02_Project/00_Source/main/01_agents/AgentBackend'

describe('RunManager.respond()', () => {
  it('활성 run에 respond()를 호출하면 run.respond가 호출되고 true를 반환한다', async () => {
    const manager = createRunManager()
    const respondCalls: Array<{ requestId: string; response: RunResponse }> = []

    const run: AgentRun = {
      events: (async function* () {
        await new Promise<void>((r) => setTimeout(r, 200))
        yield { type: 'done' } as AgentEvent
      })(),
      abort: () => {},
      interrupt: () => {},
      push: () => {},
      respond: (requestId, response) => respondCalls.push({ requestId, response })
    }

    const backend: AgentBackend = {
      id: 'claude-code' as BackendId,
      isAvailable: async () => true,
      version: async () => null,
      latestVersion: async () => null,
      start: () => run,
      listSupportedCommands: () => []
    }

    const runId = await manager.start(backend, { messages: [] }, () => {})

    const permResponse: RunResponse = { kind: 'permission', behavior: 'allow' }
    const result = manager.respond(runId, 'req-001', permResponse)

    expect(result).toBe(true)
    expect(respondCalls).toHaveLength(1)
    expect(respondCalls[0]).toEqual({ requestId: 'req-001', response: permResponse })
  })

  it('미존재 runId에 respond()를 호출하면 false를 반환한다', () => {
    const manager = createRunManager()
    const result = manager.respond('nonexistent-run', 'req-001', {
      kind: 'permission',
      behavior: 'deny'
    })
    expect(result).toBe(false)
  })

  it('완료된 run에 respond()를 호출하면 false를 반환한다(done 이후 no-op)', async () => {
    const manager = createRunManager()
    const respondCalls: Array<unknown> = []

    const run: AgentRun = {
      events: (async function* () {
        yield { type: 'done' } as AgentEvent
      })(),
      abort: () => {},
      interrupt: () => {},
      push: () => {},
      respond: (requestId, response) => respondCalls.push({ requestId, response })
    }

    const backend: AgentBackend = {
      id: 'claude-code' as BackendId,
      isAvailable: async () => true,
      version: async () => null,
      latestVersion: async () => null,
      start: () => run,
      listSupportedCommands: () => []
    }

    const runId = await manager.start(backend, { messages: [] }, () => {})
    await new Promise<void>((r) => setTimeout(r, 100))

    const result = manager.respond(runId, 'req-001', { kind: 'permission', behavior: 'allow' })

    expect(result).toBe(false)
    expect(respondCalls).toHaveLength(0)
  })

  it('respond()는 permission kind를 그대로 run.respond에 전달한다', async () => {
    const manager = createRunManager()
    const respondCalls: Array<{ requestId: string; response: RunResponse }> = []

    const run: AgentRun = {
      events: (async function* () {
        await new Promise<void>((r) => setTimeout(r, 300))
        yield { type: 'done' } as AgentEvent
      })(),
      abort: () => {},
      interrupt: () => {},
      push: () => {},
      respond: (requestId, response) => respondCalls.push({ requestId, response })
    }

    const backend: AgentBackend = {
      id: 'claude-code' as BackendId,
      isAvailable: async () => true,
      version: async () => null,
      latestVersion: async () => null,
      start: () => run,
      listSupportedCommands: () => []
    }

    const runId = await manager.start(backend, { messages: [] }, () => {})

    manager.respond(runId, 'req-perm', { kind: 'permission', behavior: 'allow_always' })

    expect(respondCalls).toHaveLength(1)
    expect(respondCalls[0].requestId).toBe('req-perm')
    expect(respondCalls[0].response).toEqual({ kind: 'permission', behavior: 'allow_always' })
  })
})

function makeHeldRun(abortCallback?: () => void): AgentRun {
  let release: (() => void) | null = null
  const abortFn = (): void => {
    abortCallback?.()
    release?.()
  }
  const iterable: AsyncIterable<AgentEvent> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<AgentEvent>> {
          await new Promise<void>((resolve) => {
            release = resolve
          })
          return { value: undefined as unknown as AgentEvent, done: true }
        },
        async return(): Promise<IteratorResult<AgentEvent>> {
          release?.()
          return { value: undefined as unknown as AgentEvent, done: true }
        }
      }
    }
  }
  return { events: iterable, abort: abortFn, interrupt: () => {}, push: () => {}, respond: () => {} }
}

function makeHeldBackend(abortCallback?: () => void): AgentBackend {
  return {
    id: 'claude-code' as BackendId,
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    start: () => makeHeldRun(abortCallback),
    listSupportedCommands: () => []
  }
}

describe('RunManager.closeAll()', () => {
  it('closeAll()은 모든 활성 run(지속세션+단발)을 abort하고 정리한다 — 좀비 0', async () => {
    const manager = createRunManager()
    const aborted: string[] = []

    const idP = await manager.start(
      makeHeldBackend(() => aborted.push('persist')),
      { messages: [{ role: 'user', content: 'a' }], persistent: true, sessionKey: 'sess-1' },
      () => {}
    )
    const idS = await manager.start(
      makeHeldBackend(() => aborted.push('single')),
      { messages: [{ role: 'user', content: 'b' }] },
      () => {}
    )
    await new Promise<void>((r) => setTimeout(r, 20))

    const count = manager.closeAll()

    expect(count).toBe(2)
    expect(aborted.sort()).toEqual(['persist', 'single'])
    expect(manager.abort(idP)).toBe(false)
    expect(manager.abort(idS)).toBe(false)
  })

  it('closeAll()은 활성 run이 없으면 0을 반환한다', () => {
    const manager = createRunManager()
    expect(manager.closeAll()).toBe(0)
  })

  it('closeAll()은 멱등 — 두 번째 호출은 0', async () => {
    const manager = createRunManager()
    await manager.start(
      makeHeldBackend(),
      { messages: [{ role: 'user', content: 'a' }], persistent: true, sessionKey: 's' },
      () => {}
    )
    await new Promise<void>((r) => setTimeout(r, 20))

    expect(manager.closeAll()).toBe(1)
    expect(manager.closeAll()).toBe(0)
  })
})

function makeControlledRun(): {
  run: AgentRun
  emit: (e: AgentEvent) => void
  close: () => void
  state: { abortCalls: number }
} {
  const queue: AgentEvent[] = []
  let closed = false
  let waiter: (() => void) | null = null
  const state = { abortCalls: 0 }
  const wake = (): void => {
    const w = waiter
    waiter = null
    w?.()
  }
  const emit = (e: AgentEvent): void => {
    queue.push(e)
    wake()
  }
  const close = (): void => {
    closed = true
    wake()
  }
  const iterable: AsyncIterable<AgentEvent> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<AgentEvent>> {
          while (queue.length === 0 && !closed) {
            await new Promise<void>((resolve) => {
              waiter = resolve
            })
          }
          if (queue.length > 0) return { value: queue.shift() as AgentEvent, done: false }
          return { value: undefined as unknown as AgentEvent, done: true }
        },
        async return(): Promise<IteratorResult<AgentEvent>> {
          closed = true
          return { value: undefined as unknown as AgentEvent, done: true }
        }
      }
    }
  }
  return {
    run: {
      events: iterable,
      abort: () => {
        state.abortCalls++
      },
      interrupt: () => {},
      push: () => {},
      respond: () => {}
    },
    emit,
    close,
    state
  }
}

function backendFromRun(run: AgentRun): AgentBackend {
  return {
    id: 'claude-code' as BackendId,
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    start: () => run,
    listSupportedCommands: () => []
  }
}

const tick = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('RunManager abort 후 정리 이벤트(loops) 통과 — BF2-mini P1', () => {
  it('abort 후 도착한 정리 스냅샷(loops:[])은 onEvent에 통과된다 (근본수리 핵심)', async () => {
    const manager = createRunManager()
    const { run, emit, close } = makeControlledRun()
    const received: AgentEvent[] = []
    const runId = await manager.start(backendFromRun(run), { messages: [] }, (e) => received.push(e))

    emit({ type: 'text', delta: 'streaming...' })
    await tick()
    expect(received.some((e) => e.type === 'text')).toBe(true)

    expect(manager.abort(runId)).toBe(true)
    emit({ type: 'loops', loops: [] })
    close()
    await tick()

    const loopsEvents = received.filter((e) => e.type === 'loops')
    expect(loopsEvents).toHaveLength(1)
    expect((loopsEvents[0] as AgentEventLoops).loops).toEqual([])
  })

  it('abort 후 도착한 비-loops 이벤트(text/done)는 onEvent에 전달되지 않는다 (이중 done·유령 모달 방지)', async () => {
    const manager = createRunManager()
    const { run, emit, close } = makeControlledRun()
    const received: AgentEvent[] = []
    const runId = await manager.start(backendFromRun(run), { messages: [] }, (e) => received.push(e))

    emit({ type: 'text', delta: 'pre-abort' })
    await tick()
    expect(received.filter((e) => e.type === 'text')).toHaveLength(1)

    expect(manager.abort(runId)).toBe(true)
    emit({ type: 'text', delta: 'STRAY' })
    emit({ type: 'done' })
    close()
    await tick()

    expect(received.filter((e) => e.type === 'text')).toHaveLength(1)
    expect(received.some((e) => e.type === 'done')).toBe(false)
  })

  it('abort 후 스트림 자연종료 → 레지스트리에서 제거된다 (cleanup 멱등)', async () => {
    const manager = createRunManager()
    const { run, emit, close } = makeControlledRun()
    const runId = await manager.start(backendFromRun(run), { messages: [] }, () => {})

    emit({ type: 'text', delta: 'x' })
    await tick()

    expect(manager.abort(runId)).toBe(true)
    emit({ type: 'loops', loops: [] })
    close()
    await tick()

    expect(manager.abort(runId)).toBe(false)
    expect(manager.interrupt(runId)).toBe(false)
    expect(manager.respond(runId, 'req', { kind: 'permission', behavior: 'allow' })).toBe(false)
  })
})
