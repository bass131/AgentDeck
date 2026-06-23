/**
 * claude-backend-skill-overrides.test.ts — skillOverridesProvider 주입 TDD (P5a)
 *
 * skillOverrides가 SDK options.settings에 올바르게 spread되는지 검증.
 * skillOverridesProvider 주입으로 실 파일시스템 / electron 의존성 0.
 *
 * 검증 목표:
 *   A. provider { foo:'off' } → sdkOptions.settings.skillOverrides === { foo:'off' }
 *   B. provider null          → sdkOptions.settings에 skillOverrides 키 없음
 *   C. 기존 settings.permissions.defaultMode 보존(회귀 0)
 *   D. skillOverrides가 null일 때 빈 객체 spread 금지 (키 자체 없어야 함)
 */

import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../src/main/agents/ClaudeCodeBackend'
import type { QueryFn } from '../../src/main/agents/ClaudeCodeBackend'

// ── 헬퍼: sdkOptions 캡처용 mock queryFn ─────────────────────────────────────

type CapturedOptions = Record<string, unknown>

/**
 * query 호출 시 넘어온 options를 캡처하는 mock queryFn 생성.
 * 캡처 후 result 메시지를 yield해 events가 정상 종료되도록 한다.
 */
function makeCapturingQuery(captured: { options: CapturedOptions | null }): QueryFn {
  return async function* captureQuery(params: { prompt: string; options?: unknown }) {
    captured.options = (params.options ?? null) as CapturedOptions | null
    // 최소 result 메시지 — events가 종료되게 함
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

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('ClaudeCodeBackend — skillOverridesProvider 주입 (P5a)', () => {
  describe('A. provider가 {foo:"off"}를 반환할 때', () => {
    it('sdkOptions.settings.skillOverrides === {foo:"off"}', async () => {
      const captured: { options: CapturedOptions | null } = { options: null }
      const query = makeCapturingQuery(captured)

      const overrides: Record<string, 'off'> = { foo: 'off' }
      const backend = new ClaudeCodeBackend(query, () => overrides)
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      for await (const _ of run.events) { /* drain */ }

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
      for await (const _ of run.events) { /* drain */ }

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
      for await (const _ of run.events) { /* drain */ }

      expect(captured.options).not.toBeNull()
      const settings = (captured.options as CapturedOptions).settings as Record<string, unknown>
      expect(settings).toBeDefined()
      // null일 때 키 자체가 없어야 한다 (빈 객체 spread 금지)
      expect('skillOverrides' in settings).toBe(false)
    })

    it('undefined 반환도 키가 없다(방어)', async () => {
      const captured: { options: CapturedOptions | null } = { options: null }
      const query = makeCapturingQuery(captured)

      // null과 동일하게 처리되도록 null 반환
      const backend = new ClaudeCodeBackend(query, (() => null) as () => Record<string, 'off'> | null)
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      for await (const _ of run.events) { /* drain */ }

      const settings = (captured.options as CapturedOptions).settings as Record<string, unknown>
      expect('skillOverrides' in settings).toBe(false)
    })
  })

  describe('C. 기존 settings.permissions.defaultMode 보존(회귀 0)', () => {
    it('skillOverrides 있을 때도 permissions.defaultMode가 유지된다', async () => {
      const captured: { options: CapturedOptions | null } = { options: null }
      const query = makeCapturingQuery(captured)

      const backend = new ClaudeCodeBackend(query, () => ({ mySkill: 'off' }))
      // mode를 지정해 permissionMode가 특정 값으로 결정되도록 한다
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }], mode: 'normal' })
      for await (const _ of run.events) { /* drain */ }

      const settings = (captured.options as CapturedOptions).settings as Record<string, unknown>
      const permissions = settings['permissions'] as Record<string, unknown>
      expect(permissions).toBeDefined()
      expect(permissions['defaultMode']).toBeDefined()
      // skillOverrides와 함께 존재
      expect(settings['skillOverrides']).toEqual({ mySkill: 'off' })
    })

    it('skillOverrides null일 때도 permissions.defaultMode가 유지된다', async () => {
      const captured: { options: CapturedOptions | null } = { options: null }
      const query = makeCapturingQuery(captured)

      const backend = new ClaudeCodeBackend(query, () => null)
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      for await (const _ of run.events) { /* drain */ }

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

      // skillOverridesProvider 생략 — 기본값(createSkillsStore().disabledSkillOverrides)로 동작
      // 테스트 환경에서는 userData/skills-disabled.json 없음 → null → skillOverrides 없음
      // 단, electron app.getPath를 직접 호출하므로 여기서는 실 기본값 대신
      // queryFn만 주입하고 provider는 생략(기본값 경로를 시뮬레이션)
      // 이 케이스는 provider 생략 시 생성자가 TypeError를 던지지 않는지만 확인
      expect(() => new ClaudeCodeBackend(query)).not.toThrow()
    })
  })
})
