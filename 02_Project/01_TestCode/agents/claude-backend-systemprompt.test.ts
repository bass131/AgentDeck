import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import { WORKFLOW_GATE_NOTICE } from '../../../02_Project/00_Source/main/01_agents/sdkOptions'
import type { QueryFn } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'

function makeCaptureQuery(capturedOptions: { value?: Record<string, unknown> }): QueryFn {
  return async function* (params: { prompt: string; options?: unknown }) {
    capturedOptions.value = params.options as Record<string, unknown>
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

async function getSystemPromptOption(
  systemPrompt?: string
): Promise<Record<string, unknown> | undefined> {
  const captured: { value?: Record<string, unknown> } = {}
  const backend = new ClaudeCodeBackend(makeCaptureQuery(captured))
  const run = backend.start({
    messages: [{ role: 'user', content: 'hello' }],
    ...(systemPrompt !== undefined ? { systemPrompt } : {}),
  })
  for await (const _ of run.events) { }
  return captured.value?.systemPrompt as Record<string, unknown> | undefined
}

describe('ClaudeCodeBackend — systemPrompt append (Phase 30)', () => {

  describe('S1: systemPrompt 있으면 append 에 포함(가이드 상시 합성으로 완전일치 아님, UC1-P02)', () => {
    it('systemPrompt="Respond only in French" → sdkOptions.systemPrompt.append 에 포함', async () => {
      const sysProm = 'Respond only in French'
      const opt = await getSystemPromptOption(sysProm)

      expect(opt).toBeDefined()
      expect(opt?.type).toBe('preset')
      expect(opt?.preset).toBe('claude_code')
      expect(opt?.append).toContain(sysProm)
      expect(opt?.append).toContain(WORKFLOW_GATE_NOTICE)
    })

    it('결정적 마커 포함 systemPrompt → sdkOptions.systemPrompt.append에 마커 포함', async () => {
      const sysProm = 'You must begin EVERY response with the exact marker ###FR### and then answer only in French.'
      const opt = await getSystemPromptOption(sysProm)

      expect(opt?.type).toBe('preset')
      expect(opt?.preset).toBe('claude_code')
      expect(opt?.append).toContain(sysProm)
    })
  })

  describe('S2: 미전달/빈문자열/공백만 → append는 고지만(사용자 문구 없음)', () => {
    it('systemPrompt 미전달 → sdkOptions.systemPrompt.append == WORKFLOW_GATE_NOTICE(고지만)', async () => {
      const opt = await getSystemPromptOption(undefined)

      expect(opt).toBeDefined()
      expect(opt?.type).toBe('preset')
      expect(opt?.preset).toBe('claude_code')
      expect(opt?.append).toBe(WORKFLOW_GATE_NOTICE)
    })

    it('systemPrompt="" (빈문자열) → append == 고지만(사용자 문구 미포함)', async () => {
      const opt = await getSystemPromptOption('')

      expect(opt?.type).toBe('preset')
      expect(opt?.preset).toBe('claude_code')
      expect(opt?.append).toBe(WORKFLOW_GATE_NOTICE)
    })

    it("systemPrompt='   ' (공백만) → append == 고지만 (trim 후 빈 체크는 유지, 고지는 상시)", async () => {
      const opt = await getSystemPromptOption('   ')

      expect(opt?.type).toBe('preset')
      expect(opt?.preset).toBe('claude_code')
      expect(opt?.append).toBe(WORKFLOW_GATE_NOTICE)
    })
  })

  describe('원본 미러: systemPrompt?.trim() 조건부 spread', () => {
    it('앞뒤 공백 있는 systemPrompt → trim된 값이 append에 포함(가이드와 합성)', async () => {
      const opt = await getSystemPromptOption('  hello world  ')

      expect(opt?.append).toContain('hello world')
      expect(opt?.append).toContain(WORKFLOW_GATE_NOTICE)
    })
  })
})
