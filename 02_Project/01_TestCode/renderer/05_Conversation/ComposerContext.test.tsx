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
      <ContextStrip lastUsage={{ inputTokens: 60_000, outputTokens: 40_000 }} lastContextWindow={200_000} />
    )
    expect(container.querySelector('.cc-pct')?.textContent).toBe('50%')
  })

  it('첫 턴 전(창 미상)에는 기본 창 하나', () => {
    const a = render(<ContextStrip lastUsage={{ inputTokens: 100_000, outputTokens: 0 }} />)
    expect(a.container.querySelector('.cc-pct')?.textContent).toBe('10%')
  })

  // M11 G2 — M06 Backlog 27. 컨텍스트 칩에 SDK 자동 압축 상태를 보인다.
  it('자동 압축이 켜져 있으면 문턱을, 꺼져 있으면 꺼짐을 컨텍스트 칩에 보인다', () => {
    const on = render(<ContextStrip lastUsage={{ inputTokens: 100_000, outputTokens: 0 }} lastContextWindow={1_000_000} autoCompact={{ enabled: true, thresholdTokens: 967_000 }} />)
    expect(on.container.querySelector('.ctx-chip [data-auto-compact]')?.textContent).toBe('자동 압축 967K')
    const off = render(<ContextStrip autoCompact={{ enabled: false }} />)
    expect(off.container.querySelector('.ctx-chip [data-auto-compact]')?.textContent).toBe('자동 압축 꺼짐')
    const unknown = render(<ContextStrip />)
    expect(unknown.container.querySelector('[data-auto-compact]')).toBeNull()
  })

  // M11 G2 — M06 Backlog 15. 쓰지 않던 selectedModel 받기를 지웠다 — 넘기면 타입 오류다.
  it('ContextStrip은 selectedModel을 받지 않는다', () => {
    // @ts-expect-error selectedModel은 ContextStrip의 prop이 아니다
    const el = <ContextStrip selectedModel="claude-opus-5-5" />
    expect(el).toBeTruthy()
  })
})
