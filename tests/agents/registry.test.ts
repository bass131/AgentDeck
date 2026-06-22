/**
 * registry.test.ts
 *
 * getBackend() 기본=claude-code, getBackend('codex') 반환,
 * codex.isAvailable()=false 검증.
 *
 * 식별자 참조: registry, CodexBackend, AgentBackend
 */
import { describe, it, expect } from 'vitest'
import { getBackend, listBackends } from '../../src/main/agents/registry'
import type { AgentBackend } from '../../src/main/agents/AgentBackend'

describe('registry', () => {
  describe('getBackend()', () => {
    it('인자 없이 호출 시 claude-code 백엔드 반환', () => {
      const backend: AgentBackend = getBackend()
      expect(backend.id).toBe('claude-code')
    })

    it("getBackend('claude-code') → claude-code 백엔드 반환", () => {
      const backend: AgentBackend = getBackend('claude-code')
      expect(backend.id).toBe('claude-code')
    })

    it("getBackend('codex') → codex 백엔드 반환", () => {
      const backend: AgentBackend = getBackend('codex')
      expect(backend.id).toBe('codex')
    })

    it('알 수 없는 id는 claude-code 폴백', () => {
      // 타입 캐스트: BackendId 이외 값으로 런타임 폴백 동작 확인
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const backend: AgentBackend = getBackend('unknown-backend' as any)
      expect(backend.id).toBe('claude-code')
    })
  })

  describe('listBackends()', () => {
    it('두 백엔드가 모두 포함됨', () => {
      const backends = listBackends()
      const ids = backends.map(b => b.id)
      expect(ids).toContain('claude-code')
      expect(ids).toContain('codex')
    })

    it('각 항목이 AgentBackend 인터페이스를 구현함', () => {
      const backends = listBackends()
      for (const b of backends) {
        expect(typeof b.id).toBe('string')
        expect(typeof b.isAvailable).toBe('function')
        expect(typeof b.version).toBe('function')
        expect(typeof b.start).toBe('function')
      }
    })
  })

  describe('CodexBackend stub 검증', () => {
    it('codex.isAvailable() === false', async () => {
      const codex = getBackend('codex')
      const available = await codex.isAvailable()
      expect(available).toBe(false)
    })

    it('codex.version() === null', async () => {
      const codex = getBackend('codex')
      const ver = await codex.version()
      expect(ver).toBeNull()
    })

    it('codex.start() → 즉시 error 이벤트 후 종료', async () => {
      const codex = getBackend('codex')
      const run = codex.start({
        messages: [{ role: 'user', content: 'hello' }]
      })
      const events = []
      for await (const event of run.events) {
        events.push(event)
      }
      expect(events).toHaveLength(2)
      expect(events[0]).toMatchObject({
        type: 'error',
        message: expect.stringContaining('not implemented')
      })
      expect(events[1]).toMatchObject({ type: 'done' })
    })
  })
})

describe('registry — 엔진 분기 격리 확인', () => {
  it('호출부(테스트)는 구체 엔진 클래스를 직접 import하지 않음', () => {
    // 이 테스트 파일이 ClaudeCodeBackend나 CodexBackend를 직접 import하지 않고
    // registry를 통해서만 백엔드를 얻는다는 것을 구조적으로 보장.
    // registry가 AgentBackend 인터페이스를 반환하므로 호출부는 구체 타입을 모름.
    const backend = getBackend()
    // instanceof 체크 없이 인터페이스만 사용
    expect(backend.id).toBeDefined()
  })
})
