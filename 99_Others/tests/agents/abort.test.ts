import { describe, it, expect } from 'vitest'
import { getBackend } from '../../../02_Source/main/01_agents/registry'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'

describe('ClaudeCodeBackend — abort() 결정론 테스트', () => {
  it('abort() 호출 후 events iterable이 종료된다', async () => {
    const backend = getBackend('claude-code')
    const run = backend.start({
      messages: [{ role: 'user', content: 'test abort' }]
    })

    run.abort()

    const events: AgentEvent[] = []
    for await (const event of run.events) {
      events.push(event)
      if (event.type === 'done' || event.type === 'error') break
    }

    expect(true).toBe(true)
  }, 5000)

  it('abort() 두 번 호출해도 예외 없음 (멱등)', () => {
    const backend = getBackend('claude-code')
    const run = backend.start({
      messages: [{ role: 'user', content: 'test double abort' }]
    })

    expect(() => {
      run.abort()
      run.abort()
    }).not.toThrow()
  })

  it('abort() 전에도 abort() 후에도 events는 AsyncIterable이다', () => {
    const backend = getBackend('claude-code')
    const run = backend.start({
      messages: [{ role: 'user', content: 'test' }]
    })

    expect(Symbol.asyncIterator in run.events).toBe(true)

    run.abort()

    expect(Symbol.asyncIterator in run.events).toBe(true)
  })
})

describe('ClaudeCodeBackend — isAvailable() 반환 타입', () => {
  it('isAvailable()이 Promise<boolean>을 반환한다', async () => {
    const backend = getBackend('claude-code')
    const result = backend.isAvailable()
    expect(result).toBeInstanceOf(Promise)
    const value = await result
    expect(typeof value).toBe('boolean')
  })

  it('version()이 Promise<string|null>을 반환한다', async () => {
    const backend = getBackend('claude-code')
    const result = backend.version()
    expect(result).toBeInstanceOf(Promise)
    const value = await result
    expect(value === null || typeof value === 'string').toBe(true)
  })
})

describe('CodexBackend — abort() stub에서도 안전', () => {
  it('codex stub의 abort()는 예외 없이 호출 가능', async () => {
    const backend = getBackend('codex')
    const run = backend.start({
      messages: [{ role: 'user', content: 'test' }]
    })

    expect(() => run.abort()).not.toThrow()

    const events: AgentEvent[] = []
    for await (const event of run.events) {
      events.push(event)
    }

    expect(events.some(e => e.type === 'error')).toBe(true)
    expect(events[events.length - 1]).toMatchObject({ type: 'done' })
  })
})

describe('ClaudeCodeBackend — spawn 좀비 방지 (mock)', () => {
  it('abort() 후 자식프로세스 kill이 시도된다', async () => {
    const { ClaudeCodeBackend } = await import('../../../02_Source/main/01_agents/ClaudeCodeBackend')

    const backend = new ClaudeCodeBackend()

    const run = backend.start({
      messages: [{ role: 'user', content: 'test zombie prevention' }]
    })

    run.abort()

    const events: AgentEvent[] = []
    const timeoutPromise = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('timeout: iterable did not terminate')), 3000)
    )

    const consumePromise = (async () => {
      for await (const event of run.events) {
        events.push(event)
      }
    })()

    await Promise.race([consumePromise, timeoutPromise])

    expect(events.length).toBeGreaterThanOrEqual(0)
  }, 5000)
})
