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

describe('ClaudeCodeBackend — skillOverridesProvider 주입 (P5a)', () => {
  describe('A. provider가 {foo:"off"}를 반환할 때', () => {
    it('sdkOptions.settings.skillOverrides === {foo:"off"}', async () => {
      const captured: { options: CapturedOptions | null } = { options: null }
      const query = makeCapturingQuery(captured)

      const overrides: Record<string, 'off'> = { foo: 'off' }
      const backend = new ClaudeCodeBackend(query, () => overrides)
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      for await (const _ of run.events) { }

      expect(captured.options).not.toBeNull()
      const settings = (captured.options as CapturedOptions).settings as Record<string, unknown>
      expect(settings).toBeDefined()
      expect(settings['skillOverrides']).toEqual({ foo: 'off' })
    })

    it('여러 disabled 스킬이 모두 포함된다', async () => {
      const captured: { options: CapturedOptions | null } = { options: null }
      const query = makeCapturingQuery(captured)

      const overrides: Record<string, 'off'> = { alpha: 'off', beta: 'off', gamma: 'off' }
      const backend = new ClaudeCodeBackend(query, () => overrides)
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      for await (const _ of run.events) { }

      const settings = (captured.options as CapturedOptions).settings as Record<string, unknown>
      expect(settings['skillOverrides']).toEqual({ alpha: 'off', beta: 'off', gamma: 'off' })
    })
  })

  describe('B. provider가 null을 반환할 때', () => {
    it('settings에 skillOverrides 키가 존재하지 않는다', async () => {
      const captured: { options: CapturedOptions | null } = { options: null }
      const query = makeCapturingQuery(captured)

      const backend = new ClaudeCodeBackend(query, () => null)
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      for await (const _ of run.events) { }

      expect(captured.options).not.toBeNull()
      const settings = (captured.options as CapturedOptions).settings as Record<string, unknown>
      expect(settings).toBeDefined()
      expect('skillOverrides' in settings).toBe(false)
    })

    it('undefined 반환도 키가 없다(방어)', async () => {
      const captured: { options: CapturedOptions | null } = { options: null }
      const query = makeCapturingQuery(captured)

      const backend = new ClaudeCodeBackend(query, (() => null) as () => Record<string, 'off'> | null)
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      for await (const _ of run.events) { }

      const settings = (captured.options as CapturedOptions).settings as Record<string, unknown>
      expect('skillOverrides' in settings).toBe(false)
    })
  })

  describe('C. 기존 settings.permissions.defaultMode 보존(회귀 0)', () => {
    it('skillOverrides 있을 때도 permissions.defaultMode가 유지된다', async () => {
      const captured: { options: CapturedOptions | null } = { options: null }
      const query = makeCapturingQuery(captured)

      const backend = new ClaudeCodeBackend(query, () => ({ mySkill: 'off' }))
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }], mode: 'normal' })
      for await (const _ of run.events) { }

      const settings = (captured.options as CapturedOptions).settings as Record<string, unknown>
      const permissions = settings['permissions'] as Record<string, unknown>
      expect(permissions).toBeDefined()
      expect(permissions['defaultMode']).toBeDefined()
      expect(settings['skillOverrides']).toEqual({ mySkill: 'off' })
    })

    it('skillOverrides null일 때도 permissions.defaultMode가 유지된다', async () => {
      const captured: { options: CapturedOptions | null } = { options: null }
      const query = makeCapturingQuery(captured)

      const backend = new ClaudeCodeBackend(query, () => null)
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      for await (const _ of run.events) { }

      const settings = (captured.options as CapturedOptions).settings as Record<string, unknown>
      const permissions = settings['permissions'] as Record<string, unknown>
      expect(permissions).toBeDefined()
      expect(permissions['defaultMode']).toBeDefined()
    })
  })

  describe('D. skillOverridesProvider 미전달 시 기본 동작', () => {
    it('provider 미전달 시 인스턴스 생성이 성공하고 이벤트가 흐른다', async () => {
      const captured: { options: CapturedOptions | null } = { options: null }
      const query = makeCapturingQuery(captured)

      expect(() => new ClaudeCodeBackend(query)).not.toThrow()
    })
  })
})
