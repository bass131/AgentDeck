/**
 * agent-runs.test.ts — AgentRunManager 단위 테스트
 *
 * electron을 import하지 않음 → 콜백 주입형 구조로 node 환경에서 실행 가능.
 * mock AgentBackend(가짜 AsyncIterable) 주입 → 이벤트 콜백 수신·runId·abort 동작 검증.
 */

import { describe, it, expect } from 'vitest'
import { createRunManager } from '../../src/main/ipc/agent-runs'
import type { AgentBackend, AgentRun, AgentRunInput } from '../../src/main/agents/AgentBackend'
import type { AgentEvent } from '../../src/shared/agent-events'
import type { BackendId } from '../../src/shared/ipc-contract'

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
    abort: abortFn
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
    start: (_req: AgentRunInput): AgentRun => makeFakeRun(events)
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
      start: () => run
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
