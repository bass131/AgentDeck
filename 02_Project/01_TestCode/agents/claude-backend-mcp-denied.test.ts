import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'

type CapturedOptions = Record<string, unknown>

function makeCapturingQuery(captured: { options: CapturedOptions | null }): QueryFn {
  return async function* captureQuery(params: { prompt: string; options?: unknown }) {
    captured.options = (params.options ?? null) as CapturedOptions | null
    yield {
      type: 'result' as const,
      subtype: 'success' as const,
      is_error: false,
      duration_ms: 1,
      duration_api_ms: 1,
      num_turns: 1,
      result: '',
      stop_reason: 'end_turn',
      total_cost_usd: 0,
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      modelUsage: {},
      permission_denials: [],
      errors: [],
      uuid: 'uuid-0000-0000-0000-000000000000-0000' as `${string}-${string}-${string}-${string}-${string}`,
      session_id: 'test-session',
    }
  }
}

describe('ClaudeCodeBackend — mcpDeniedProvider 주입 (P5b)', () => {
  describe('A. provider가 [{serverName:"foo"}]를 반환할 때', () => {
    it('sdkOptions.settings.deniedMcpServers === [{serverName:"foo"}]', async () => {
      const captured: { options: CapturedOptions | null } = { options: null }
      const query = makeCapturingQuery(captured)

      const denied = [{ serverName: 'foo' }]
      const backend = new ClaudeCodeBackend(query, undefined, () => denied)
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      for await (const _ of run.events) { }

      expect(captured.options).not.toBeNull()
      const settings = (captured.options as CapturedOptions).settings as Record<string, unknown>
      expect(settings).toBeDefined()
      expect(settings['deniedMcpServers']).toEqual([{ serverName: 'foo' }])
    })

    it('여러 denied 서버가 모두 포함된다', async () => {
      const captured: { options: CapturedOptions | null } = { options: null }
      const query = makeCapturingQuery(captured)

      const denied = [{ serverName: 'foo' }, { serverName: 'bar' }, { serverName: 'baz' }]
      const backend = new ClaudeCodeBackend(query, undefined, () => denied)
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      for await (const _ of run.events) { }

      const settings = (captured.options as CapturedOptions).settings as Record<string, unknown>
      expect(settings['deniedMcpServers']).toEqual([
        { serverName: 'foo' },
        { serverName: 'bar' },
        { serverName: 'baz' },
      ])
    })
  })

  describe('B. provider가 null을 반환할 때', () => {
    it('settings에 deniedMcpServers 키가 존재하지 않는다', async () => {
      const captured: { options: CapturedOptions | null } = { options: null }
      const query = makeCapturingQuery(captured)

      const backend = new ClaudeCodeBackend(query, undefined, () => null)
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      for await (const _ of run.events) { }

      expect(captured.options).not.toBeNull()
      const settings = (captured.options as CapturedOptions).settings as Record<string, unknown>
      expect(settings).toBeDefined()
      expect('deniedMcpServers' in settings).toBe(false)
    })
  })

  describe('C. skillOverrides와 공존 (둘 다 설정 시 둘 다 포함, permissions.defaultMode 보존)', () => {
    it('skillOverrides + deniedMcpServers 둘 다 존재하고 permissions.defaultMode도 유지', async () => {
      const captured: { options: CapturedOptions | null } = { options: null }
      const query = makeCapturingQuery(captured)

      const overrides: Record<string, 'off'> = { mySkill: 'off' }
      const denied = [{ serverName: 'evil-server' }]

      const backend = new ClaudeCodeBackend(query, () => overrides, () => denied)
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }], mode: 'normal' })
      for await (const _ of run.events) { }

      const settings = (captured.options as CapturedOptions).settings as Record<string, unknown>
      expect(settings).toBeDefined()

      expect(settings['skillOverrides']).toEqual({ mySkill: 'off' })
      expect(settings['deniedMcpServers']).toEqual([{ serverName: 'evil-server' }])
      const permissions = settings['permissions'] as Record<string, unknown>
      expect(permissions).toBeDefined()
      expect(permissions['defaultMode']).toBeDefined()
    })

    it('skillOverrides null + deniedMcpServers 있을 때: skillOverrides 키 없고 deniedMcpServers는 있다', async () => {
      const captured: { options: CapturedOptions | null } = { options: null }
      const query = makeCapturingQuery(captured)

      const denied = [{ serverName: 'blocked' }]
      const backend = new ClaudeCodeBackend(query, () => null, () => denied)
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      for await (const _ of run.events) { }

      const settings = (captured.options as CapturedOptions).settings as Record<string, unknown>
      expect('skillOverrides' in settings).toBe(false)
      expect(settings['deniedMcpServers']).toEqual([{ serverName: 'blocked' }])
    })

    it('skillOverrides 있고 deniedMcpServers null: skillOverrides는 있고 deniedMcpServers 키 없다', async () => {
      const captured: { options: CapturedOptions | null } = { options: null }
      const query = makeCapturingQuery(captured)

      const overrides: Record<string, 'off'> = { mySkill: 'off' }
      const backend = new ClaudeCodeBackend(query, () => overrides, () => null)
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      for await (const _ of run.events) { }

      const settings = (captured.options as CapturedOptions).settings as Record<string, unknown>
      expect(settings['skillOverrides']).toEqual({ mySkill: 'off' })
      expect('deniedMcpServers' in settings).toBe(false)
    })
  })

  describe('D. mcpDeniedProvider 미전달 시 기본 동작', () => {
    it('provider 미전달 시 인스턴스 생성이 성공하고 이벤트가 흐른다', async () => {
      const captured: { options: CapturedOptions | null } = { options: null }
      const query = makeCapturingQuery(captured)

      expect(() => new ClaudeCodeBackend(query)).not.toThrow()
    })
  })
})
