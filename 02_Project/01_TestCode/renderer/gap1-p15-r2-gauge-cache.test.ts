import { describe, it, expect } from 'vitest'
import { calcGauge } from '../../../02_Project/00_Source/renderer/src/lib/gaugeCalc'

describe('GAP1 P15-R2 T3 — calcGauge 캐시 토큰 합산 (RED)', () => {
  it('cacheReadTokens 반영: {input 9, cacheRead 45000, output 1200} → used=46209 (현행 1209)', () => {
    const r = calcGauge({ inputTokens: 9, outputTokens: 1_200, cacheReadTokens: 45_000 }, 'opus')
    expect(r.used).toBe(46_209)
  })

  it('cacheCreationTokens도 프롬프트 측 점유로 합산: {input 9, cacheCreation 2500, cacheRead 45000, output 1200} → used=48709', () => {
    const r = calcGauge(
      { inputTokens: 9, outputTokens: 1_200, cacheCreationTokens: 2_500, cacheReadTokens: 45_000 },
      'opus'
    )
    expect(r.used).toBe(48_709)
  })

  it('pct도 캐시 포함 used 기준: 46209 / 200K(contextWindow 3rd arg) → 23% (현행 1%)', () => {
    const r = calcGauge(
      { inputTokens: 9, outputTokens: 1_200, cacheReadTokens: 45_000 },
      'opus',
      200_000
    )
    expect(r.window).toBe(200_000)
    expect(r.pct).toBe(23)
  })
})

describe('GAP1 P15-R2 T3 — 비캐시(비REPL) 회귀 핀 (GREEN 불변)', () => {
  it('캐시 필드 없는 usage → used = input + output 그대로 (기존 거동)', () => {
    const r = calcGauge({ inputTokens: 500, outputTokens: 300 }, 'opus')
    expect(r.used).toBe(800)
    expect(r.window).toBe(1_000_000)
  })

  it('usage undefined → used=0, pct=0 (기존 거동)', () => {
    const r = calcGauge(undefined, 'opus')
    expect(r.used).toBe(0)
    expect(r.pct).toBe(0)
  })
})
