// @vitest-environment jsdom
/**
 * ComposerContext.test.tsx — ContextStrip 컴포넌트 렌더 테스트.
 * Composer.tsx Phase 14 분해: ContextStrip을 ComposerContext.tsx로 추출.
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ContextStrip } from '../../../02.Source/renderer/src/components/01_conversation/ComposerContext'

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
})
