/**
 * tg1-p09-provider-brand.test.ts — TG1 P09: provider→브랜드 로고 단일소스 매핑 모듈.
 *
 * 배경(01.Phases/18_TG1-thinking-gui/09-provider-brand-logos.md 작업1): Welcome 히어로·
 * SettingsModal 엔진 탭/현재 엔진 카드·GitModal AI 커밋 버튼·대화 아바타(Conversation/
 * PanelView/MessageBubble) 5곳에 흩어져 있던 "provider→로고" 하드코딩 분기를 이 모듈
 * 하나로 수렴한다. 모듈은 순수 descriptor만 반환(JSX 렌더는 소비처/공통 컴포넌트 몫).
 *
 * 잠그는 계약(3분기 + 테마 2변형):
 *   PB1: 'claude-code' → kind:'logo', Claude Spark 에셋(테마 무관 — Clay 단색 공용).
 *   PB2: 'codex'(dormant — 라이브 소비처 0, 단위테스트로만 exercise) + theme='light'
 *        → OpenAI Blossom Black(라이트 배경용).
 *   PB3: 'codex' + theme='dark' → OpenAI Blossom White(다크 배경용) — PB2와 다른 에셋
 *        (재채색 금지 → 테마별 스왑만 허용, SOURCE.md 고지).
 *   PB4: 미지/미래 provider(예: 'future-engine') → kind:'fallback'(로고 없음 — 잘못된
 *        로고 오귀속 금지, 소비처가 자체 폴백 아이콘을 그린다).
 */
import { describe, it, expect } from 'vitest'
import { getProviderBrand } from '../../../02.Source/renderer/src/lib/providerBrand'
import claudeSparkClay from '../../../02.Source/renderer/src/assets/brand/claude-spark-clay.svg'
import openaiBlossomBlack from '../../../02.Source/renderer/src/assets/brand/openai-blossom-black.svg'
import openaiBlossomWhite from '../../../02.Source/renderer/src/assets/brand/openai-blossom-white.svg'

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
