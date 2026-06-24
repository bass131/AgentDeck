/**
 * orchestration-sdkoptions.test.ts — orchestration 토글 → sdkOptions 매핑 단위 테스트 (Phase 37 TDD RED)
 *
 * 검증 범위:
 *   O1: orchestration 미전달 → sdkOptions.disallowedTools 에 'Workflow' 포함
 *   O2: orchestration=false   → 동일하게 disallowedTools 에 'Workflow' 포함
 *   O3: orchestration=true    → disallowedTools 가 undefined 이거나 'Workflow' 미포함
 *   O4: orchestration=true    → sdkOptions.systemPrompt.append 에 ORCHESTRATION_SYSTEM_GUIDE 포함
 *   O5: orchestration=true + 사용자 systemPrompt → append 에 둘 다 포함(사용자 문구 AND 가이드)
 *   O6: orchestration 미전달 + 사용자 systemPrompt → append == 사용자 문구(가이드 미포함) + disallowedTools 에 Workflow 포함
 *
 * 신뢰경계: 실 SDK 호출 없음. 모든 queryFn은 mock.
 *
 * 현재 RED 예상 이유:
 *  - AgentRunInput에 orchestration 필드 없음 (TypeScript 컴파일 에러)
 *  - ClaudeCodeBackend 가 disallowedTools 주입 안 함
 *  - ORCHESTRATION_SYSTEM_GUIDE 상수 미존재
 */

import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend, ORCHESTRATION_SYSTEM_GUIDE } from '../../src/main/agents/ClaudeCodeBackend'
import type { QueryFn } from '../../src/main/agents/ClaudeCodeBackend'

// ── sdkOptions 캡처용 queryFn (claude-backend-systemprompt.test.ts 패턴 차용) ─

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

/** backend.start() 실행 후 sdkOptions 전체를 반환하는 헬퍼 */
async function captureSdkOptions(
  input: Parameters<ClaudeCodeBackend['start']>[0]
): Promise<Record<string, unknown>> {
  const captured: { value?: Record<string, unknown> } = {}
  const backend = new ClaudeCodeBackend(makeCaptureQuery(captured))
  const run = backend.start(input)
  for await (const _ of run.events) { /* drain */ }
  return captured.value ?? {}
}

// ── O1/O2: orchestration OFF → disallowedTools 에 'Workflow' 포함 ──────────────

describe('ClaudeCodeBackend — orchestration OFF → disallowedTools["Workflow"] (Phase 37)', () => {

  it('O1: orchestration 미전달 → disallowedTools 에 "Workflow" 포함', async () => {
    const opts = await captureSdkOptions({
      messages: [{ role: 'user', content: 'hello' }],
    })

    const disallowedTools = opts['disallowedTools']
    expect(Array.isArray(disallowedTools)).toBe(true)
    expect(disallowedTools).toContain('Workflow')
  })

  it('O2: orchestration=false → disallowedTools 에 "Workflow" 포함', async () => {
    const opts = await captureSdkOptions({
      messages: [{ role: 'user', content: 'hello' }],
      orchestration: false,
    })

    const disallowedTools = opts['disallowedTools']
    expect(Array.isArray(disallowedTools)).toBe(true)
    expect(disallowedTools).toContain('Workflow')
  })
})

// ── O3: orchestration=true → disallowedTools 에 'Workflow' 없음 ────────────────

describe('ClaudeCodeBackend — orchestration ON → disallowedTools["Workflow"] 제거 (Phase 37)', () => {

  it('O3: orchestration=true → disallowedTools 미정의 이거나 "Workflow" 미포함', async () => {
    const opts = await captureSdkOptions({
      messages: [{ role: 'user', content: 'hello' }],
      orchestration: true,
    })

    const disallowedTools = opts['disallowedTools']
    // disallowedTools 가 없거나, 있어도 'Workflow' 를 포함하지 않아야 함
    if (disallowedTools !== undefined) {
      expect(Array.isArray(disallowedTools)).toBe(true)
      expect(disallowedTools).not.toContain('Workflow')
    }
    // disallowedTools === undefined 이면 이미 조건 충족
  })
})

// ── O4: orchestration=true → systemPrompt.append 에 ORCHESTRATION_SYSTEM_GUIDE 포함 ──

describe('ClaudeCodeBackend — orchestration ON → systemPrompt.append 가이드 합성 (Phase 37)', () => {

  it('O4: orchestration=true → sdkOptions.systemPrompt.append 에 ORCHESTRATION_SYSTEM_GUIDE 포함', async () => {
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
    // ORCHESTRATION_SYSTEM_GUIDE 상수가 append 에 포함
    expect(append as string).toContain(ORCHESTRATION_SYSTEM_GUIDE)
  })

  it('O5: orchestration=true + 사용자 systemPrompt → append 에 사용자 문구 AND 가이드 둘 다 포함', async () => {
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
    // 사용자 문구와 가이드 상수 모두 substring 으로 존재해야 함
    expect(appendStr).toContain(userPrompt)
    expect(appendStr).toContain(ORCHESTRATION_SYSTEM_GUIDE)
  })
})

// ── O6: orchestration 미전달 + 사용자 systemPrompt → 가이드 미포함 회귀 ──────────

describe('ClaudeCodeBackend — orchestration OFF 회귀: 사용자 systemPrompt 단독 (Phase 37)', () => {

  it('O6: orchestration 미전달 + systemPrompt="프랑스어로만 답해" → append 는 사용자 문구만(가이드 미포함)', async () => {
    const userPrompt = '프랑스어로만 답해'
    const opts = await captureSdkOptions({
      messages: [{ role: 'user', content: 'hello' }],
      systemPrompt: userPrompt,
    })

    const sysProm = opts['systemPrompt'] as Record<string, unknown> | undefined
    expect(sysProm?.['type']).toBe('preset')
    expect(sysProm?.['preset']).toBe('claude_code')

    const append = sysProm?.['append']
    expect(append).toBe(userPrompt)

    // 가이드 상수는 append 에 없어야 함 (기존 M2 동작 회귀 0)
    if (typeof append === 'string') {
      expect(append).not.toContain(ORCHESTRATION_SYSTEM_GUIDE)
    }

    // disallowedTools 에도 Workflow 가 포함되어야 함 (OFF 상태이므로)
    const disallowedTools = opts['disallowedTools']
    expect(Array.isArray(disallowedTools)).toBe(true)
    expect(disallowedTools).toContain('Workflow')
  })
})
