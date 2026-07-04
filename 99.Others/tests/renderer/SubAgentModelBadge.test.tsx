// @vitest-environment jsdom
/**
 * SubAgentModelBadge.test.tsx — 서브에이전트 모델 배지 공유 컴포넌트 (영호 육안 피드백 2026-07-04).
 *
 * "SubAgent 모델 표기가 너무 단순한데, 디자인도 너무 평범하고, 너무 텍스트에 정적인 표시
 * 위주라 별로네" — 회색 텍스트 병기(saf-role)를 기존 칩 문법(AgentPanel .ag-pill +
 * ComposerPicker .pick-dot) 재사용 배지로 격상. SubAgentFullscreen/Inline 양쪽 공유.
 *
 * MB1: model 없음(undefined) → 미렌더(null)
 * MB2: 알려진 모델 ID → 라벨(패밀리+버전) + 패밀리 색 도트(pickerOptions MODELS와 동일 토큰)
 * MB3: 미지 모델 ID → 원문 그대로 라벨(배지는 렌더), 도트는 무색 폴백(인라인 style 없음)
 * MB4/5: running 변주 — .running 클래스만 계약(실제 애니메이션은 CSS 소유, ag-pulse 재사용)
 * MB6: compact 변주 — 클래스만 축소, 라벨 텍스트는 절대 축약하지 않음(넘버링 유지)
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { SubAgentModelBadge } from '../../../02.Source/renderer/src/components/05_agent/SubAgentModelBadge'

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
