// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { SubAgentModelBadge } from '../../../02_Project/00_Source/renderer/src/features/agent/SubAgentModelBadge'

afterEach(() => cleanup())

describe('MB1 — model 없음 → 미렌더', () => {
  it('undefined → null', () => {
    const { container } = render(<SubAgentModelBadge model={undefined} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('MB2 — 알려진 모델 → 라벨 + 패밀리 색 도트', () => {
  it('claude-opus-4-8 → "Opus 4.8" + violet 토큰 도트', () => {
    const { container } = render(<SubAgentModelBadge model="claude-opus-4-8" />)
    const badge = container.querySelector('.sa-model-badge')
    expect(badge).toBeTruthy()
    expect(badge!.textContent).toContain('Opus 4.8')
    const dot = container.querySelector('.sa-model-dot') as HTMLElement
    expect(dot.style.background).toBe('var(--violet)')
  })

  it('claude-fable-5 → "Fable 5"(마이너 없음) + gold 토큰 도트', () => {
    const { container } = render(<SubAgentModelBadge model="claude-fable-5" />)
    expect(container.querySelector('.sa-model-badge')!.textContent).toContain('Fable 5')
    const dot = container.querySelector('.sa-model-dot') as HTMLElement
    expect(dot.style.background).toBe('var(--gold)')
  })

  it('claude-sonnet-5(현행 sonnet 별칭 결과, SDK 0.3.201 bump 실측) → "Sonnet 5" + blue 토큰 도트', () => {
    const { container } = render(<SubAgentModelBadge model="claude-sonnet-5" />)
    expect(container.querySelector('.sa-model-badge')!.textContent).toContain('Sonnet 5')
    const dot = container.querySelector('.sa-model-dot') as HTMLElement
    expect(dot.style.background).toBe('var(--blue)')
  })
})

describe('MB3 — 미지 모델 ID → 원문 그대로, 배지는 렌더', () => {
  it('future-model-x1 → 원문 라벨, 도트는 무색(인라인 style 없음)', () => {
    const { container } = render(<SubAgentModelBadge model="future-model-x1" />)
    expect(container.querySelector('.sa-model-badge')!.textContent).toContain('future-model-x1')
    const dot = container.querySelector('.sa-model-dot') as HTMLElement
    expect(dot.style.background).toBe('')
  })
})

describe('MB4/MB5 — running 변주(모션은 기존 ag-pulse 재사용, 클래스 계약만 고정)', () => {
  it('running=true → .running 클래스', () => {
    const { container } = render(<SubAgentModelBadge model="claude-sonnet-5" running />)
    expect(container.querySelector('.sa-model-badge.running')).toBeTruthy()
  })

  it('running=false(완료) → .running 클래스 없음(정적 배지로 안착)', () => {
    const { container } = render(<SubAgentModelBadge model="claude-sonnet-5" running={false} />)
    expect(container.querySelector('.sa-model-badge.running')).toBeNull()
  })
})

describe('MB6 — compact 변주(인라인 카드용, 라벨 축약 금지)', () => {
  it('compact여도 라벨 텍스트는 그대로(넘버링 유지)', () => {
    const { container } = render(<SubAgentModelBadge model="claude-haiku-4-5-20251001" compact />)
    const badge = container.querySelector('.sa-model-badge.compact')
    expect(badge).toBeTruthy()
    expect(badge!.textContent).toContain('Haiku 4.5')
  })
})

describe('MB7 — 조기 별칭(버전 없음) → 미렌더(모델 미확정 취급, CP1 렌더러 후속)', () => {
  it('model="opus"(버전 없는 조기 별칭) → null', () => {
    const { container } = render(<SubAgentModelBadge model="opus" />)
    expect(container.firstChild).toBeNull()
  })

  it('model="sonnet"/"haiku"/"fable"도 동일하게 미렌더', () => {
    for (const alias of ['sonnet', 'haiku', 'fable']) {
      const { container, unmount } = render(<SubAgentModelBadge model={alias} />)
      expect(container.firstChild).toBeNull()
      unmount()
    }
  })

  it('실측 원시 ID 도착 시(예: claude-opus-4-8) 정상적으로 배지가 등장(전환 확인)', () => {
    const { container } = render(<SubAgentModelBadge model="claude-opus-4-8" />)
    expect(container.querySelector('.sa-model-badge')).toBeTruthy()
    expect(container.querySelector('.sa-model-badge')!.textContent).toContain('Opus 4.8')
  })
})
