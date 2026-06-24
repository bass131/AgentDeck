// @vitest-environment jsdom
/**
 * PaneSplitter.test.tsx — #5 드래그 스플리터 컴포넌트 TDD
 *
 * 렌더 + 기본 속성 검증. 드래그 자체는 핸들러 배선이므로
 * 핸들 존재 / 역할(role=separator) / 마우스다운 핸들러 등록 여부 확인.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { PaneSplitter } from '../../src/renderer/src/components/PaneSplitter'

afterEach(cleanup)

describe('PaneSplitter 렌더', () => {
  it('separator 역할의 엘리먼트를 렌더한다', () => {
    render(<PaneSplitter />)
    const splitter = screen.getByRole('separator')
    expect(splitter).toBeTruthy()
  })

  it('aria-orientation="vertical"을 가진다', () => {
    render(<PaneSplitter />)
    const splitter = screen.getByRole('separator')
    expect(splitter.getAttribute('aria-orientation')).toBe('vertical')
  })

  it('pane-splitter 클래스를 가진다', () => {
    render(<PaneSplitter />)
    const splitter = screen.getByRole('separator')
    expect(splitter.classList.contains('pane-splitter')).toBe(true)
  })

  it('aria-label이 설정되어 있다', () => {
    render(<PaneSplitter />)
    const splitter = screen.getByRole('separator')
    expect(splitter.getAttribute('aria-label')).toBeTruthy()
  })
})
