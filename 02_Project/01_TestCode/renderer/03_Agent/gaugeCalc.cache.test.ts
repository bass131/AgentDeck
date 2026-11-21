// calcGauge는 모델 ID를 받지 않는다 — 창은 턴 결과의 contextWindow, 첫 턴 전엔 기본값 하나다.
import { describe, it, expect } from 'vitest'
import { calcGauge } from '@renderer/03_Agent/gaugeCalc'

describe('GAP1 P15-R2 T3 — calcGauge 캐시 토큰 합산', () => {
  it('cacheReadTokens 반영: {input 9, cacheRead 45000, output 1200} → used=46209', () => {
    const r = calcGauge({ inputTokens: 9, outputTokens: 1_200, cacheReadTokens: 45_000 })
    expect(r.used).toBe(46_209)
  })

  it('cacheCreationTokens도 프롬프트 측 점유로 합산: → used=48709', () => {
    const r = calcGauge({ inputTokens: 9, outputTokens: 1_200, cacheCreationTokens: 2_500, cacheReadTokens: 45_000 })
    expect(r.used).toBe(48_709)
  })

  it('pct도 캐시 포함 used 기준: 46209 / 200K(contextWindow) → 23%', () => {
    const r = calcGauge({ inputTokens: 9, outputTokens: 1_200, cacheReadTokens: 45_000 }, 200_000)
    expect(r.window).toBe(200_000)
    expect(r.pct).toBe(23)
  })
})

describe('GAP1 P15-R2 T3 — 비캐시(비REPL) 회귀 핀', () => {
  it('캐시 필드 없는 usage → used = input + output 그대로, 창은 기본값', () => {
    const r = calcGauge({ inputTokens: 500, outputTokens: 300 })
    expect(r.used).toBe(800)
    expect(r.window).toBe(1_000_000)
  })

  it('usage undefined → used=0, pct=0', () => {
    const r = calcGauge(undefined)
    expect(r.used).toBe(0)
    expect(r.pct).toBe(0)
  })
})
