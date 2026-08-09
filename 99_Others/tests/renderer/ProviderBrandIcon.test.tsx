// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ProviderBrandIcon } from '../../../02_Source/renderer/src/components/common/ProviderBrandIcon'

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
