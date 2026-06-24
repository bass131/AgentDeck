/**
 * orchestration-send-args.test.ts — buildAgentRunArgs orchestration 전파 단위 테스트 (Phase 37 TDD RED)
 *
 * 검증 범위:
 *   B1: buildAgentRunArgs([], { orchestration:true })  → 결과.orchestration === true
 *   B2: buildAgentRunArgs([])(opts 없음)                → 결과.orchestration === undefined
 *   B3: buildAgentRunArgs([], { orchestration:false }) → 결과.orchestration === false
 *   B4: 기존 picker/sysPrompt 전파 무파손 회귀
 *
 * 순수 함수 테스트 — window.api / Node / fs 호출 없음.
 * Vitest node 환경에서 바로 실행 가능.
 *
 * 현재 RED 예상 이유:
 *  - SendOptions 에 orchestration 필드 없음 (TypeScript 컴파일 에러)
 *  - AgentRunRequest 에 orchestration 필드 없음 (TypeScript 컴파일 에러)
 *  - buildAgentRunArgs 가 orchestration 을 전파하지 않음 (단정 실패)
 */

import { describe, it, expect } from 'vitest'
import { buildAgentRunArgs } from '../../src/renderer/src/store/panelSession'

// ── B1: orchestration=true 전파 ──────────────────────────────────────────────────

describe('buildAgentRunArgs — orchestration 전파 (Phase 37)', () => {

  it('B1: opts.orchestration=true → 결과.orchestration === true', () => {
    const result = buildAgentRunArgs([], {
      orchestration: true,
    })

    expect(result.orchestration).toBe(true)
  })

  it('B2: opts 없음 → 결과.orchestration === undefined', () => {
    const result = buildAgentRunArgs([])

    expect(result.orchestration).toBeUndefined()
  })

  it('B3: opts.orchestration=false → 결과.orchestration === false', () => {
    const result = buildAgentRunArgs([], {
      orchestration: false,
    })

    expect(result.orchestration).toBe(false)
  })
})

// ── B4: 기존 picker/sysPrompt 전파 무파손 회귀 ────────────────────────────────────

describe('buildAgentRunArgs — 기존 필드 전파 회귀 (Phase 37)', () => {

  it('B4: picker/sysPrompt/orchestration 전부 전파 — 기존 필드 무파손', () => {
    const history = [{ role: 'user' as const, content: 'x' }]

    const result = buildAgentRunArgs(history, {
      picker: { model: 'opus', effort: 'high', mode: 'normal' },
      sysPrompt: 'y',
      orchestration: true,
    })

    // 기존 필드 회귀 0
    expect(result.messages).toEqual(history)
    expect(result.model).toBe('opus')
    expect(result.effort).toBe('high')
    expect(result.mode).toBe('normal')
    expect(result.systemPrompt).toBe('y')

    // 신규 orchestration 전파
    expect(result.orchestration).toBe(true)
  })
})
