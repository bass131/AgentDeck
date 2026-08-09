import { describe, it, expect } from 'vitest'
import { buildAgentRunArgs } from '../../../02_Project/00_Source/renderer/src/store/panelSession'

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

describe('buildAgentRunArgs — 기존 필드 전파 회귀 (Phase 37)', () => {

  it('B4: picker/sysPrompt/orchestration 전부 전파 — 기존 필드 무파손', () => {
    const history = [{ role: 'user' as const, content: 'x' }]

    const result = buildAgentRunArgs(history, {
      picker: { model: 'opus', effort: 'high', mode: 'normal' },
      sysPrompt: 'y',
      orchestration: true,
    })

    expect(result.messages).toEqual(history)
    expect(result.model).toBe('opus')
    expect(result.effort).toBe('high')
    expect(result.mode).toBe('normal')
    expect(result.systemPrompt).toBe('y')

    expect(result.orchestration).toBe(true)
  })
})
