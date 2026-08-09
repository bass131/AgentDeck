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

async function captureSdkOptions(
  input: Parameters<ClaudeCodeBackend['start']>[0]
): Promise<Record<string, unknown>> {
  const captured: { value?: Record<string, unknown> } = {}
  const backend = new ClaudeCodeBackend(makeCaptureQuery(captured))
  const run = backend.start(input)
  for await (const _ of run.events) { }
  return captured.value ?? {}
}

describe('ClaudeCodeBackend — orchestration OFF → disallowedTools 부재(UC1-P02, ADR-032 ④)', () => {

  it('O1: orchestration 미전달 → disallowedTools 부재(Workflow 상시 노출)', async () => {
    const opts = await captureSdkOptions({
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect('disallowedTools' in opts).toBe(false)
  })

  it('O2: orchestration=false → disallowedTools 부재(Workflow 상시 노출)', async () => {
    const opts = await captureSdkOptions({
      messages: [{ role: 'user', content: 'hello' }],
      orchestration: false,
    })

    expect('disallowedTools' in opts).toBe(false)
  })
})

describe('ClaudeCodeBackend — orchestration ON → disallowedTools["Workflow"] 제거 (Phase 37)', () => {

  it('O3: orchestration=true → disallowedTools 미정의 이거나 "Workflow" 미포함', async () => {
    const opts = await captureSdkOptions({
      messages: [{ role: 'user', content: 'hello' }],
      orchestration: true,
    })

    const disallowedTools = opts['disallowedTools']
    if (disallowedTools !== undefined) {
      expect(Array.isArray(disallowedTools)).toBe(true)
      expect(disallowedTools).not.toContain('Workflow')
    }
  })
})

describe('ClaudeCodeBackend — orchestration ON → systemPrompt.append 고지 합성', () => {

  it('O4: orchestration=true → sdkOptions.systemPrompt.append 에 WORKFLOW_GATE_NOTICE 포함', async () => {
    const opts = await captureSdkOptions({
      messages: [{ role: 'user', content: 'hello' }],
      orchestration: true,
    })

    const sysProm = opts['systemPrompt'] as Record<string, unknown> | undefined
    expect(sysProm).toBeDefined()
    expect(sysProm?.['type']).toBe('preset')
    expect(sysProm?.['preset']).toBe('claude_code')

    const append = sysProm?.['append']
    expect(typeof append).toBe('string')
    expect(append as string).toContain(WORKFLOW_GATE_NOTICE)
  })

  it('O5: orchestration=true + 사용자 systemPrompt → append 에 사용자 문구 AND 고지 둘 다 포함', async () => {
    const userPrompt = '프랑스어로만 답해'
    const opts = await captureSdkOptions({
      messages: [{ role: 'user', content: 'hello' }],
      systemPrompt: userPrompt,
      orchestration: true,
    })

    const sysProm = opts['systemPrompt'] as Record<string, unknown> | undefined
    const append = sysProm?.['append']
    expect(typeof append).toBe('string')

    const appendStr = append as string
    expect(appendStr).toContain(userPrompt)
    expect(appendStr).toContain(WORKFLOW_GATE_NOTICE)
  })
})

describe('ClaudeCodeBackend — orchestration OFF + 사용자 systemPrompt 병존', () => {

  it('O6: orchestration 미전달 + systemPrompt="프랑스어로만 답해" → append 에 사용자 문구 AND 고지 둘 다 포함, disallowedTools 부재', async () => {
    const userPrompt = '프랑스어로만 답해'
    const opts = await captureSdkOptions({
      messages: [{ role: 'user', content: 'hello' }],
      systemPrompt: userPrompt,
    })

    const sysProm = opts['systemPrompt'] as Record<string, unknown> | undefined
    expect(sysProm?.['type']).toBe('preset')
    expect(sysProm?.['preset']).toBe('claude_code')

    const append = sysProm?.['append']
    expect(typeof append).toBe('string')
    const appendStr = append as string
    expect(appendStr).toContain(userPrompt)
    expect(appendStr).toContain(WORKFLOW_GATE_NOTICE)

    expect('disallowedTools' in opts).toBe(false)
  })
})
