/**
 * claude-backend-systemprompt.test.ts — ClaudeCodeBackend systemPrompt append 단위 테스트
 * (Phase 30 TDD 원안 + UC1-P02 갱신, ADR-032 ④)
 *
 * 검증 범위 (AC §5.1 + UC1-P02 갱신):
 *   S1: systemPrompt 있음 → sdkOptions.systemPrompt = {type:'preset',preset:'claude_code',append:...}
 *       append에는 사용자 문구가 **포함**된다(가이드 상시 합성으로 문구 단독과의 완전일치는 깨짐).
 *   S2: 미전달/빈문자열/공백만 → append **키는 항상 존재**한다(ORCHESTRATION_SYSTEM_GUIDE
 *       상시 합성, UC1-P02 — held-open 세션은 systemPrompt를 세션 생성 시 한 번만 고정하므로
 *       가이드를 orchestration 여부와 무관하게 항상 넣는다). 사용자 문구가 없으면 append는
 *       가이드 문자열과 정확히 동일.
 *
 * 신뢰경계: SDK 고유 형상(preset/append)은 ClaudeCodeBackend 내부에만.
 * 엔진 추상화(ADR-003): 외부 계약(AgentRunInput)에는 string만 전달.
 */

import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend, ORCHESTRATION_SYSTEM_GUIDE } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'

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

  describe('S1: systemPrompt 있으면 append 에 포함(가이드 상시 합성으로 완전일치 아님, UC1-P02)', () => {
    it('systemPrompt="Respond only in French" → sdkOptions.systemPrompt.append 에 포함', async () => {
      const sysProm = 'Respond only in French'
      const opt = await getSystemPromptOption(sysProm)

      expect(opt).toBeDefined()
      expect(opt?.type).toBe('preset')
      expect(opt?.preset).toBe('claude_code')
      expect(opt?.append).toContain(sysProm)
      expect(opt?.append).toContain(ORCHESTRATION_SYSTEM_GUIDE)
    })

    it('결정적 마커 포함 systemPrompt → sdkOptions.systemPrompt.append에 마커 포함', async () => {
      const sysProm = 'You must begin EVERY response with the exact marker ###FR### and then answer only in French.'
      const opt = await getSystemPromptOption(sysProm)

      expect(opt?.type).toBe('preset')
      expect(opt?.preset).toBe('claude_code')
      expect(opt?.append).toContain(sysProm)
    })
  })

  describe('S2: 미전달/빈문자열/공백만 → append는 가이드만(사용자 문구 없음, UC1-P02 상시 합성)', () => {
    it('systemPrompt 미전달 → sdkOptions.systemPrompt.append == ORCHESTRATION_SYSTEM_GUIDE(가이드만)', async () => {
      const opt = await getSystemPromptOption(undefined)

      expect(opt).toBeDefined()
      expect(opt?.type).toBe('preset')
      expect(opt?.preset).toBe('claude_code')
      // UC1-P02(ADR-032 ④): 가이드가 orchestration 여부와 무관하게 상시 합성되므로,
      // 사용자 systemPrompt가 없어도 append 키는 항상 존재하며 가이드 문자열과 정확히 같다.
      expect(opt?.append).toBe(ORCHESTRATION_SYSTEM_GUIDE)
    })

    it('systemPrompt="" (빈문자열) → append == 가이드만(사용자 문구 미포함)', async () => {
      const opt = await getSystemPromptOption('')

      expect(opt?.type).toBe('preset')
      expect(opt?.preset).toBe('claude_code')
      expect(opt?.append).toBe(ORCHESTRATION_SYSTEM_GUIDE)
    })

    it("systemPrompt='   ' (공백만) → append == 가이드만 (trim 후 빈 체크는 유지, 가이드는 상시)", async () => {
      const opt = await getSystemPromptOption('   ')

      expect(opt?.type).toBe('preset')
      expect(opt?.preset).toBe('claude_code')
      expect(opt?.append).toBe(ORCHESTRATION_SYSTEM_GUIDE)
    })
  })

  describe('원본 미러: systemPrompt?.trim() 조건부 spread', () => {
    it('앞뒤 공백 있는 systemPrompt → trim된 값이 append에 포함(가이드와 합성)', async () => {
      const opt = await getSystemPromptOption('  hello world  ')

      expect(opt?.append).toContain('hello world')
      expect(opt?.append).toContain(ORCHESTRATION_SYSTEM_GUIDE)
    })
  })
})
