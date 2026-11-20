// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { FullscreenOverlay } from '@renderer/02_Common/FullscreenOverlay'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

if (typeof window !== 'undefined' && !(window as unknown as Record<string, unknown>).api) {
  (window as unknown as Record<string, unknown>).api = adaptFlatApi({})
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

  it('[M11-G4 22] 다른 모달이 위에 오르면 Esc는 위 모달만 닫고 전체 화면 보기는 남는다', async () => {
    const { pushModalLayer } = await import('@renderer/02_Common/modalStack')
    const onClose = vi.fn()
    const over = vi.fn()
    render(<FullscreenOverlay onClose={onClose}><div>내용</div></FullscreenOverlay>)
    const close = pushModalLayer({ onEscape: over })
    try {
      fireEvent.keyDown(document, { key: 'Escape' })
    } finally {
      close()
    }
    expect([over.mock.calls.length, onClose.mock.calls.length]).toEqual([1, 0])
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
