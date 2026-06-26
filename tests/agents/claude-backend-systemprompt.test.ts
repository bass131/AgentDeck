/**
 * claude-backend-systemprompt.test.ts — ClaudeCodeBackend systemPrompt append 단위 테스트 (Phase 30 TDD)
 *
 * 검증 범위 (AC §5.1):
 *   S1: systemPrompt 있음 → sdkOptions.systemPrompt = {type:'preset',preset:'claude_code',append:...}
 *   S2: 미전달 → {type:'preset',preset:'claude_code'} (append 키 없음, 회귀 0)
 *   S2: 빈문자열 → append 키 없음
 *   S2: 공백만('   ') → append 키 없음
 *
 * 신뢰경계: SDK 고유 형상(preset/append)은 ClaudeCodeBackend 내부에만.
 * 엔진 추상화(ADR-003): 외부 계약(AgentRunInput)에는 string만 전달.
 */

import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../src/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../src/main/01_agents/ClaudeCodeBackend'

// ── sdkOptions 캡처용 queryFn ─────────────────────────────────────────────────

/**
 * sdkOptions를 외부로 꺼내기 위한 캡처용 queryFn.
 * 호출 시 capturedOptions에 저장하고 즉시 종료(결과 메시지 없음).
 */
function makeCaptureQuery(capturedOptions: { value?: Record<string, unknown> }): QueryFn {
  return async function* (params: { prompt: string; options?: unknown }) {
    capturedOptions.value = params.options as Record<string, unknown>
    // 최소한의 result 메시지(없으면 error + done으로 빠질 수 있음)
    yield {
      type: 'result' as const,
      subtype: 'success' as const,
      is_error: false,
      duration_ms: 1,
      duration_api_ms: 1,
      num_turns: 0,
      result: '',
      stop_reason: 'end_turn',
      total_cost_usd: 0,
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      modelUsage: {},
      permission_denials: [],
      errors: [],
      uuid: 'uuid-0000-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
      session_id: 'test',
    }
  }
}

// ── 헬퍼: backend 실행 후 sdkOptions 추출 ─────────────────────────────────────

async function getSystemPromptOption(
  systemPrompt?: string
): Promise<Record<string, unknown> | undefined> {
  const captured: { value?: Record<string, unknown> } = {}
  const backend = new ClaudeCodeBackend(makeCaptureQuery(captured))
  const run = backend.start({
    messages: [{ role: 'user', content: 'hello' }],
    ...(systemPrompt !== undefined ? { systemPrompt } : {}),
  })
  // drain
  for await (const _ of run.events) { /* drain */ }
  return captured.value?.systemPrompt as Record<string, unknown> | undefined
}

// ── 테스트 ─────────────────────────────────────────────────────────────────────

describe('ClaudeCodeBackend — systemPrompt append (Phase 30)', () => {

  describe('S1: systemPrompt 있으면 append 포함', () => {
    it('systemPrompt="Respond only in French" → sdkOptions.systemPrompt.append 동일', async () => {
      const sysProm = 'Respond only in French'
      const opt = await getSystemPromptOption(sysProm)

      expect(opt).toBeDefined()
      expect(opt?.type).toBe('preset')
      expect(opt?.preset).toBe('claude_code')
      expect(opt?.append).toBe(sysProm)
    })

    it('결정적 마커 포함 systemPrompt → sdkOptions.systemPrompt.append에 마커 포함', async () => {
      const sysProm = 'You must begin EVERY response with the exact marker ###FR### and then answer only in French.'
      const opt = await getSystemPromptOption(sysProm)

      expect(opt?.type).toBe('preset')
      expect(opt?.preset).toBe('claude_code')
      expect(opt?.append).toBe(sysProm)
    })
  })

  describe('S2: 미전달/빈문자열/공백만 → append 키 없음 (회귀 0)', () => {
    it('systemPrompt 미전달 → sdkOptions.systemPrompt = {type:preset,preset:claude_code} (append 없음)', async () => {
      const opt = await getSystemPromptOption(undefined)

      expect(opt).toBeDefined()
      expect(opt?.type).toBe('preset')
      expect(opt?.preset).toBe('claude_code')
      // append 키가 존재해서는 안 됨
      expect('append' in (opt ?? {})).toBe(false)
    })

    it('systemPrompt="" (빈문자열) → append 키 없음', async () => {
      const opt = await getSystemPromptOption('')

      expect(opt?.type).toBe('preset')
      expect(opt?.preset).toBe('claude_code')
      expect('append' in (opt ?? {})).toBe(false)
    })

    it("systemPrompt='   ' (공백만) → append 키 없음 (trim 후 빈 체크)", async () => {
      const opt = await getSystemPromptOption('   ')

      expect(opt?.type).toBe('preset')
      expect(opt?.preset).toBe('claude_code')
      expect('append' in (opt ?? {})).toBe(false)
    })
  })

  describe('원본 미러: systemPrompt?.trim() 조건부 spread', () => {
    it('앞뒤 공백 있는 systemPrompt → trim된 값이 append', async () => {
      const opt = await getSystemPromptOption('  hello world  ')

      expect(opt?.append).toBe('hello world')
    })
  })
})
