// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ContextStrip } from '@renderer/05_Conversation/ComposerContext'

describe('ContextStrip', () => {
  it('ctx-chip 3개 렌더 (컨텍스트·5h·주간)', () => {
    const { container } = render(<ContextStrip />)
    expect(container.querySelectorAll('.ctx-chip').length).toBe(3)
  })

  it('각 칩에 cc-ring + cc-label + cc-pct 렌더', () => {
    const { container } = render(<ContextStrip />)
    expect(container.querySelectorAll('.cc-ring').length).toBe(3)
    expect(container.querySelectorAll('.cc-label').length).toBe(3)
  })

  it('lastUsage 미전달 → pct "—" 또는 숫자', () => {
    const { container } = render(<ContextStrip />)
    const pcts = container.querySelectorAll('.cc-pct')
    expect(pcts.length).toBeGreaterThan(0)
  })

  it('ctx-strip 클래스 루트 렌더', () => {
    const { container } = render(<ContextStrip />)
    expect(container.querySelector('.ctx-strip')).toBeTruthy()
  })

  // M06 G4: 계기 창은 모델 ID가 아니라 턴 결과의 contextWindow에서 온다 — 모델 값과 무관하다.
  it('턴 뒤 계기는 결과의 contextWindow 기준이다 — 100K/200K → 50%', () => {
    const { container } = render(
      <ContextStrip lastUsage={{ inputTokens: 60_000, outputTokens: 40_000 }} selectedModel="claude-opus-5-5" lastContextWindow={200_000} />
    )
    expect(container.querySelector('.cc-pct')?.textContent).toBe('50%')
  })

  it('첫 턴 전(창 미상)에는 기본 창 하나 — 모델이 무엇이든 같은 값', () => {
    const a = render(<ContextStrip lastUsage={{ inputTokens: 100_000, outputTokens: 0 }} selectedModel="claude-haiku-4-5" />)
    const b = render(<ContextStrip lastUsage={{ inputTokens: 100_000, outputTokens: 0 }} selectedModel="claude-opus-5-5" />)
    expect(a.container.querySelector('.cc-pct')?.textContent).toBe('10%')
    expect(b.container.querySelector('.cc-pct')?.textContent).toBe('10%')
  })
})
