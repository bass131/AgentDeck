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
 *   FO6: 오버레이는 document.body 직속 포털로 렌더 (fixed containing-block 함정 회귀 방어)
 *
 * NOTE: 오버레이는 createPortal(document.body)로 렌더되므로 RTL container 밖에 있다.
 *       → 오버레이 DOM 조회는 container.querySelector가 아니라 document.querySelector.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { FullscreenOverlay } from '../../../02.Source/renderer/src/components/common/FullscreenOverlay'

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
    // backdrop은 최외곽 overlay div — 포털이라 document 기준 조회
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
    // 포털이라 document 기준 조회
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
    // 회귀 방어: fixed 오버레이가 transform/backdrop-filter 조상에 갇혀 잘리던 버그를
    // document.body 포털로 해소했다. container에는 없고 body 직속이어야 한다.
    const onClose = vi.fn()
    const { container } = render(
      <FullscreenOverlay onClose={onClose}>
        <div>내용</div>
      </FullscreenOverlay>
    )
    // RTL container 내부에는 오버레이가 없어야 함(포털로 빠져나감)
    expect(container.querySelector('.fs-overlay')).toBeNull()
    // 오버레이는 document.body의 직속 자식으로 존재
    const overlay = document.querySelector('.fs-overlay')
    expect(overlay).not.toBeNull()
    expect(overlay!.parentElement).toBe(document.body)
  })
})
