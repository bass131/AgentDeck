// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { PaneSplitter } from '../../../02_Source/renderer/src/components/00_shell/PaneSplitter'

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
