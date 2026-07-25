// @vitest-environment jsdom
/**
 * ProviderBrandIcon.test.tsx — TG1 P09: 공통 렌더 컴포넌트(단순 아이콘 슬롯 소비처용).
 *
 * SettingsModal 엔진 탭·현재 엔진 카드·GitModal AI 커밋 버튼처럼 조건부 wrapper
 * className이 필요 없는 "그냥 아이콘 하나" 자리에서 lib/providerBrand.ts descriptor를
 * 실제로 그리는 유일한 지점. Codex 분기는 dormant — 여기서만 exercise한다(라이브
 * 소비처는 전부 provider 미지정=기본값 'claude-code'만 사용).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ProviderBrandIcon } from '../../../02.Source/renderer/src/components/common/ProviderBrandIcon'

afterEach(() => cleanup())

describe('PBI1 — provider 미지정(기본값) → Claude Spark 공식 로고 img', () => {
  it('provider 미지정 → <img> 렌더(공식 로고)', () => {
    const { container } = render(<ProviderBrandIcon size={20} />)
    expect(container.querySelector('img')).toBeTruthy()
  })
})

describe('PBI2 — provider="codex"(dormant) → 로고 img(단위테스트 전용 exercise)', () => {
  it('provider="codex" → <img> 렌더(OpenAI Blossom)', () => {
    const { container } = render(<ProviderBrandIcon provider="codex" size={20} />)
    expect(container.querySelector('img')).toBeTruthy()
  })
})

describe('PBI3 — 미지 provider → 폴백 아이콘(svg, 로고 오귀속 금지)', () => {
  it('미지 provider → img 없음, svg(IconClaude 폴백) 렌더', () => {
    const { container } = render(<ProviderBrandIcon provider="future-engine" size={20} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).toBeTruthy()
  })
})
