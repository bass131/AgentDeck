// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { FullscreenOverlay } from '../../../02_Source/renderer/src/components/common/FullscreenOverlay'

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
    render(
      <FullscreenOverlay onClose={onClose}>
        <div>내용</div>
      </FullscreenOverlay>
    )
    const overlay = document.querySelector('.fs-overlay')
    expect(overlay).not.toBeNull()
    fireEvent.mouseDown(overlay!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('FO4: 내부 콘텐츠 클릭 → onClose 미호출', () => {
    const onClose = vi.fn()
    render(
      <FullscreenOverlay onClose={onClose}>
        <div data-testid="inner">내용</div>
      </FullscreenOverlay>
    )
    const panel = document.querySelector('.fs-panel')
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

  it('FO6: 오버레이는 RTL container 밖(document.body 직속)에 포털 렌더', () => {
    const onClose = vi.fn()
    const { container } = render(
      <FullscreenOverlay onClose={onClose}>
        <div>내용</div>
      </FullscreenOverlay>
    )
    expect(container.querySelector('.fs-overlay')).toBeNull()
    const overlay = document.querySelector('.fs-overlay')
    expect(overlay).not.toBeNull()
    expect(overlay!.parentElement).toBe(document.body)
  })
})
