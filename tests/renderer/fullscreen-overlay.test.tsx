// @vitest-environment jsdom
/**
 * fullscreen-overlay.test.tsx — FullscreenOverlay 컴포넌트 단위 테스트 (TDD)
 *
 * 검증:
 *   FO1: children 렌더
 *   FO2: Esc 키 → onClose 호출
 *   FO3: 오버레이 바깥 클릭 → onClose 호출
 *   FO4: 내부 콘텐츠 클릭 → onClose 미호출 (stopPropagation)
 *   FO5: title prop 있으면 표시
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { FullscreenOverlay } from '../../src/renderer/src/components/FullscreenOverlay'

if (typeof window !== 'undefined' && !(window as unknown as Record<string, unknown>).api) {
  (window as unknown as Record<string, unknown>).api = {}
}

afterEach(() => cleanup())

describe('FullscreenOverlay', () => {
  it('FO1: children 렌더', () => {
    const onClose = vi.fn()
    render(
      <FullscreenOverlay onClose={onClose}>
        <div data-testid="child">내용</div>
      </FullscreenOverlay>
    )
    expect(screen.getByTestId('child')).not.toBeNull()
  })

  it('FO2: Esc 키 → onClose 호출', () => {
    const onClose = vi.fn()
    render(
      <FullscreenOverlay onClose={onClose}>
        <div>내용</div>
      </FullscreenOverlay>
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('FO3: 오버레이 바깥 영역(backdrop) 클릭 → onClose 호출', () => {
    const onClose = vi.fn()
    const { container } = render(
      <FullscreenOverlay onClose={onClose}>
        <div>내용</div>
      </FullscreenOverlay>
    )
    // backdrop은 최외곽 overlay div
    const overlay = container.querySelector('.fs-overlay')
    expect(overlay).not.toBeNull()
    fireEvent.mouseDown(overlay!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('FO4: 내부 콘텐츠 클릭 → onClose 미호출', () => {
    const onClose = vi.fn()
    const { container } = render(
      <FullscreenOverlay onClose={onClose}>
        <div data-testid="inner">내용</div>
      </FullscreenOverlay>
    )
    const panel = container.querySelector('.fs-panel')
    expect(panel).not.toBeNull()
    fireEvent.mouseDown(panel!)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('FO5: title prop 있으면 헤더에 표시', () => {
    const onClose = vi.fn()
    render(
      <FullscreenOverlay onClose={onClose} title="오케스트레이션 상세">
        <div>내용</div>
      </FullscreenOverlay>
    )
    expect(screen.getByText('오케스트레이션 상세')).not.toBeNull()
  })
})
