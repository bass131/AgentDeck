import { describe, it, expect } from 'vitest'
import { getProviderBrand } from '../../../02_Project/00_Source/renderer/src/lib/providerBrand'
import claudeSparkClay from '../../../02_Project/00_Source/renderer/src/assets/brand/claude-spark-clay.svg'
import openaiBlossomBlack from '../../../02_Project/00_Source/renderer/src/assets/brand/openai-blossom-black.svg'
import openaiBlossomWhite from '../../../02_Project/00_Source/renderer/src/assets/brand/openai-blossom-white.svg'

describe('PB1 — claude-code → Claude Spark (테마 무관)', () => {
  it('light 테마 → logo descriptor, Claude Spark 에셋 + displayName', () => {
    const brand = getProviderBrand('claude-code', 'light')
    expect(brand.kind).toBe('logo')
    expect(brand.kind === 'logo' && brand.src).toBe(claudeSparkClay)
    expect(brand.kind === 'logo' && brand.displayName).toBe('Claude')
  })

  it('dark 테마여도 동일 에셋(Clay 단색은 테마 무관 공용)', () => {
    const brand = getProviderBrand('claude-code', 'dark')
    expect(brand.kind === 'logo' && brand.src).toBe(claudeSparkClay)
  })
})

describe('PB2/PB3 — codex(dormant) → OpenAI Blossom 테마별 스왑', () => {
  it('light 테마 → Blossom Black(라이트 배경용)', () => {
    const brand = getProviderBrand('codex', 'light')
    expect(brand.kind).toBe('logo')
    expect(brand.kind === 'logo' && brand.src).toBe(openaiBlossomBlack)
    expect(brand.kind === 'logo' && brand.displayName).toBe('Codex')
  })

  it('dark 테마 → Blossom White(다크 배경용) — light 변형과 다른 에셋', () => {
    const brand = getProviderBrand('codex', 'dark')
    expect(brand.kind).toBe('logo')
    expect(brand.kind === 'logo' && brand.src).toBe(openaiBlossomWhite)
    expect(brand.kind === 'logo' && brand.src).not.toBe(openaiBlossomBlack)
  })
})

describe('PB4 — 미지 provider → 자체 폴백(로고 오귀속 금지)', () => {
  it("미지 provider('future-engine') → fallback descriptor(로고 없음)", () => {
    const brand = getProviderBrand('future-engine', 'light')
    expect(brand.kind).toBe('fallback')
  })

  it('fallback descriptor에는 src가 없다(소비처가 자체 아이콘을 그림)', () => {
    const brand = getProviderBrand('future-engine', 'dark')
    expect((brand as { src?: string }).src).toBeUndefined()
  })
})
