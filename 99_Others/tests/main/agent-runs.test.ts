/**
 * agent-runs.test.ts — AgentRunManager 단위 테스트
 *
 * electron을 import하지 않음 → 콜백 주입형 구조로 node 환경에서 실행 가능.
 * mock AgentBackend(가짜 AsyncIterable) 주입 → 이벤트 콜백 수신·runId·abort 동작 검증.
 */

import { describe, it, expect } from 'vitest'
import { createRunManager } from '../../../02.Source/main/00_ipc/agent-runs'
import type { AgentBackend, AgentRun, AgentRunInput } from '../../../02.Source/main/01_agents/AgentBackend'
import type { AgentEvent, AgentEventLoops } from '../../../02.Source/shared/agent-events'
import type { BackendId } from '../../../02.Source/shared/ipc-contract'

// ── Mock 헬퍼 ─────────────────────────────────────────────────────────────────

/**
 * 가짜 AsyncIterable<AgentEvent> 생성.
 * events 배열의 이벤트를 순서대로 yield하고 종료.
 */
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
    // ADR-024 (0): AgentRun 계약에 interrupt 추가. 이 fake는 턴 중단을 검증하지 않으므로 no-op.
    interrupt: () => {},
    // ADR-024 (2): AgentRun 계약에 push 추가. 이 fake는 지속세션을 검증하지 않으므로 no-op.
    push: () => {},
    // Phase 24c: AgentRun 계약에 respond 추가. 이 fake는 권한 흐름을 검증하지 않으므로 no-op.
    respond: () => {}
  }
}

/**
 * 가짜 AgentBackend 생성.
 * start() 호출 시 fakeFun을 실행하여 AgentRun을 반환.
 */
function makeFakeBackend(events: AgentEvent[]): AgentBackend {
  return {
    id: 'claude-code' as BackendId,
    isAvailable: async () => true,
    version: async () => '1.0.0',
    latestVersion: async () => null,
    start: (_req: AgentRunInput): AgentRun => makeFakeRun(events),
    // ADR-019: AgentBackend 인터페이스 정합 — fake도 구현 필수 (typecheck 강제)
    listSupportedCommands: () => []
  }
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

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

    // 비동기 소비가 끝날 때까지 잠시 대기
    await new Promise<void>((resolve) => setTimeout(resolve, 50))

    expect(received.length).toBe(3)
    expect(received[0]).toEqual({ type: 'text', delta: 'hello' })
    expect(received[2]).toEqual({ type: 'done' })
    // runId 매개변수는 반환된 runId와 일치해야 함
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

    // 완료까지 대기
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

    // 모든 이벤트(첫 이벤트 포함)가 반환된 runId로 태깅된다 — '' 또는 undefined 없음
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((r) => r === runId)).toBe(true)
  })

  it('동시 2개 run — 각 콜백이 자기 runId만 받는다 (멀티 동시실행 토대)', async () => {
    const manager = createRunManager()
    const backend = makeFakeBackend([{ type: 'text', delta: 'x' }, { type: 'done' }])
    const got1: string[] = []
    const got2: string[] = []

    // 거의 동시에 두 run 시작 — 이벤트가 잘못된 runId로 새지 않아야 함
    const id1 = await manager.start(backend, { messages: [] }, (_e, rid) => got1.push(rid))
    const id2 = await manager.start(backend, { messages: [] }, (_e, rid) => got2.push(rid))
    await new Promise<void>((resolve) => setTimeout(resolve, 60))

    expect(id1).not.toBe(id2)
    expect(got1.length).toBeGreaterThan(0)
    expect(got2.length).toBeGreaterThan(0)
    // 각 콜백은 자기 run의 runId만 — 교차 오염 0, '' 없음
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

// ── respond() 라우팅 테스트 ────────────────────────────────────────────────────

import type { RunResponse } from '../../../02.Source/main/01_agents/AgentBackend'

describe('RunManager.respond()', () => {
  it('활성 run에 respond()를 호출하면 run.respond가 호출되고 true를 반환한다', async () => {
    const manager = createRunManager()
    const respondCalls: Array<{ requestId: string; response: RunResponse }> = []

    const run: AgentRun = {
      // 완료 전에 respond 호출 테스트를 위해 느리게 이벤트를 emit
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
    // done 이벤트가 소비되어 activeRuns에서 제거될 때까지 대기
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

// ── closeAll() — 앱 종료(before-quit) 시 좀비 0 (ADR-024 (4a)) ──────────────────

/**
 * 종료될 때까지 열려있는(held-open) 가짜 run. next()가 abort까지 블록 →
 * 지속세션처럼 레지스트리에 살아있음. abort()가 블록을 해제(좀비 누수 0).
 */
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
    // 배경 소비자가 next()에 진입해 release를 설정하도록 잠깐 대기
    await new Promise<void>((r) => setTimeout(r, 20))

    const count = manager.closeAll()

    expect(count).toBe(2)
    expect(aborted.sort()).toEqual(['persist', 'single'])
    // 정리 후 — 같은 runId에 abort()는 false(이미 done) → 레지스트리 비워짐
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

// ── abort 후 정리 이벤트(loops) 통과 — BF2-mini P1 이벤트 드롭 근본수리 ──────────

/**
 * 실 백엔드 abort 시나리오를 모델링하는 제어형 가짜 run.
 *
 * 기존 makeFakeRun은 abort()가 aborted 플래그로 스트림을 *즉시* 종료해버려,
 * "abort 처리의 마지막에 정리 스냅샷(loops:[])을 방출한 뒤 스트림이 닫히는" 실 거동
 * (LR2-03 라이브 실측)을 재현하지 못한다. 이 헬퍼는 emit()/close()로 스트림 방출을
 * 외부에서 완전 제어해 abort *이후* 도착하는 이벤트를 시나리오별로 주입할 수 있게 한다.
 *
 * run.abort()는 abortCalls만 증가(스트림에 개입하지 않음) — 매니저측 cleanup(done=true)와
 * 백엔드측 방출을 독립적으로 검증하기 위함. 실제 종료 시점은 close()로 명시 제어한다.
 */
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
          // 큐가 빌 때까지 대기(닫혀도 큐에 남은 이벤트는 소진 후 종료).
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

    // 스트림 진행 — text 방출·수신 확인(소비 루프 워밍업)
    emit({ type: 'text', delta: 'streaming...' })
    await tick()
    expect(received.some((e) => e.type === 'text')).toBe(true)

    // abort — 매니저는 cleanup(done=true) 후 run.abort() 호출.
    // 백엔드는 abort 처리의 마지막에 정리 스냅샷 loops:[] 를 방출한 뒤 스트림을 닫는다.
    expect(manager.abort(runId)).toBe(true)
    emit({ type: 'loops', loops: [] })
    close()
    await tick()

    // 이 loops 이벤트가 renderer 표시 진실을 복구한다 — 삼켜지면 안 된다(BF2 드롭 결함).
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
    // abort 이후 스트림에 잔여 비-loops 이벤트가 새어나오는 상황(정리 스냅샷이 아님)
    emit({ type: 'text', delta: 'STRAY' })
    emit({ type: 'done' })
    close()
    await tick()

    // 잔여 비-loops는 전부 차단 — text는 pre-abort 1개뿐, done은 0(이중 done 방지)
    expect(received.filter((e) => e.type === 'text')).toHaveLength(1)
    expect(received.some((e) => e.type === 'done')).toBe(false)
  })

  it('abort 후 스트림 자연종료 → 레지스트리에서 제거된다 (cleanup 멱등)', async () => {
    const manager = createRunManager()
    const { run, emit, close } = makeControlledRun()
    const runId = await manager.start(backendFromRun(run), { messages: [] }, () => {})

    emit({ type: 'text', delta: 'x' })
    await tick()

    expect(manager.abort(runId)).toBe(true) // 최초 abort 수락
    emit({ type: 'loops', loops: [] })
    close()
    await tick()

    // 스트림 자연종료 후 — 이미 done → 재abort false(레지스트리 비워짐, cleanup 멱등).
    // interrupt/respond도 미존재·완료 run에 no-op(false)로 일관.
    expect(manager.abort(runId)).toBe(false)
    expect(manager.interrupt(runId)).toBe(false)
    expect(manager.respond(runId, 'req', { kind: 'permission', behavior: 'allow' })).toBe(false)
  })
})
