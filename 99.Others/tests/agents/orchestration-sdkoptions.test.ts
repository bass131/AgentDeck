/**
 * orchestration-sdkoptions.test.ts — orchestration 토글 → sdkOptions 매핑 단위 테스트
 * (Phase 37 TDD 원안 + UC1-P02 신규스펙 갱신, ADR-032 ④)
 *
 * 검증 범위(UC1-P02 갱신 — Workflow 상시 노출 + 가이드 상시 합성):
 *   O1: orchestration 미전달 → sdkOptions.disallowedTools **부재**(Workflow 상시 노출)
 *   O2: orchestration=false   → 동일하게 disallowedTools **부재**
 *   O3: orchestration=true    → disallowedTools 가 undefined 이거나 'Workflow' 미포함(여전히 성립)
 *   O4: orchestration=true    → sdkOptions.systemPrompt.append 에 ORCHESTRATION_SYSTEM_GUIDE 포함
 *   O5: orchestration=true + 사용자 systemPrompt → append 에 둘 다 포함(사용자 문구 AND 가이드)
 *   O6: orchestration 미전달 + 사용자 systemPrompt → append 에 **사용자 문구 AND 가이드 둘 다**
 *       포함(가이드 상시 합성) + disallowedTools **부재**
 *
 * 신뢰경계: 실 SDK 호출 없음. 모든 queryFn은 mock.
 *
 * UC1-P02 이전(Phase 37 원안)과의 차이: disallowedTools 계산이 sdkOptions.ts에서 완전히
 * 제거돼 orchestration 값과 무관하게 항상 부재하고, ORCHESTRATION_SYSTEM_GUIDE도 orchestration
 * 값과 무관하게 항상 합성된다(held-open 세션이 systemPrompt를 세션 생성 시 한 번만 고정하는
 * 제약 — ADR-032 ④). 실제 허용/거부는 canUseTool 게이트(permissionCoordinator.ts)가 턴별로
 * 라이브 판정한다.
 */

import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend, ORCHESTRATION_SYSTEM_GUIDE } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'

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

// ── O1/O2: orchestration OFF → disallowedTools 부재(UC1-P02: Workflow 상시 노출) ────

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

// ── O3: orchestration=true → disallowedTools 에 'Workflow' 없음 ────────────────

describe('ClaudeCodeBackend — orchestration ON → disallowedTools["Workflow"] 제거 (Phase 37)', () => {

  it('O3: orchestration=true → disallowedTools 미정의 이거나 "Workflow" 미포함', async () => {
    const opts = await captureSdkOptions({
      messages: [{ role: 'user', content: 'hello' }],
      orchestration: true,
    })

    // 오케스트레이션 ON = Workflow + Task 서브에이전트 "둘 다" 허용.
    // Workflow는 disallowedTools에서 제거(canUseTool 권한 게이트로 통제), Task는 READONLY 자동허용.
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

// ── O6: orchestration 미전달 + 사용자 systemPrompt → 가이드 상시 합성(UC1-P02) ──────

describe('ClaudeCodeBackend — orchestration OFF + 사용자 systemPrompt 병존(UC1-P02, ADR-032 ④)', () => {

  it('O6: orchestration 미전달 + systemPrompt="프랑스어로만 답해" → append 에 사용자 문구 AND 가이드 둘 다 포함, disallowedTools 부재', async () => {
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
    // ★ UC1-P02: 가이드는 orchestration 값과 무관하게 상시 합성된다(ADR-032 ④ — held-open
    // 세션의 systemPrompt는 세션 생성 시 한 번만 고정되므로, OFF 턴에도 가이드를 항상 넣고
    // 사용 조건을 문구로 서술한다. 실제 허용/거부는 canUseTool 게이트가 턴별로 판정).
    expect(appendStr).toContain(ORCHESTRATION_SYSTEM_GUIDE)

    // disallowedTools 계산 자체가 제거됐다 — Workflow 상시 노출.
    expect('disallowedTools' in opts).toBe(false)
  })
})
