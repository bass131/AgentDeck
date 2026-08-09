// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { UpdateNotes } from '../../../02_Source/renderer/src/features/notice'
import { WhatsNew, WN_SLIDES } from '../../../02_Source/renderer/src/features/whats-new'
import { UN_ITEMS } from '../../../02_Source/renderer/src/lib/updateNotesSampleData'

afterEach(() => cleanup())

describe('WhatsNew — open=false → 미렌더', () => {
  it('open=false → null (wn-overlay 없음)', () => {
    const { container } = render(<WhatsNew open={false} onClose={vi.fn()} />)
    expect(container.querySelector('.wn-overlay')).toBeFalsy()
  })
})

describe('WhatsNew — open=true', () => {
  function renderWN(onClose = vi.fn()) {
    const { container } = render(<WhatsNew open={true} onClose={onClose} />)
    return { container, onClose }
  }

  it('wn-overlay + wn-hero + wn-dock 렌더', () => {
    const { container } = renderWN()
    expect(container.querySelector('.wn-overlay')).toBeTruthy()
    expect(container.querySelector('.wn-hero')).toBeTruthy()
    expect(container.querySelector('.wn-dock')).toBeTruthy()
  })

  it('슬라이드 1: wn-eyebrow = "Introducing — v1.0"', () => {
    renderWN()
    expect(screen.getByText(/Introducing — v1.0/i)).toBeTruthy()
  })

  it('wn-dock 칩 수 = WN_SLIDES.length', () => {
    const { container } = renderWN()
    const chips = container.querySelectorAll('.wn-chip')
    expect(chips.length).toBe(WN_SLIDES.length)
  })

  it('첫 번째 칩 .on 클래스(활성)', () => {
    const { container } = renderWN()
    const chips = container.querySelectorAll('.wn-chip')
    expect(chips[0].classList.contains('on')).toBe(true)
    expect(chips[1].classList.contains('on')).toBe(false)
  })

  it('CTA "둘러보기" 클릭 → 슬라이드 2로 이동', () => {
    const { container } = renderWN()
    const cta = container.querySelector('.wn-cta') as HTMLButtonElement
    expect(cta.textContent).toBe('둘러보기')
    fireEvent.click(cta)
    const chips = container.querySelectorAll('.wn-chip')
    expect(chips[1].classList.contains('on')).toBe(true)
  })

  it('→ 키 → 다음 슬라이드', () => {
    const { container } = renderWN()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    const chips = container.querySelectorAll('.wn-chip')
    expect(chips[1].classList.contains('on')).toBe(true)
  })

  it('← 키(슬라이드 1) → 슬라이드 변화 없음 (0 이하 clamp)', () => {
    const { container } = renderWN()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    const chips = container.querySelectorAll('.wn-chip')
    expect(chips[0].classList.contains('on')).toBe(true)
  })

  it('wn-dock 칩 클릭 → 해당 슬라이드로 이동', () => {
    const { container } = renderWN()
    const chips = container.querySelectorAll('.wn-chip')
    fireEvent.click(chips[3])
    expect(chips[3].classList.contains('on')).toBe(true)
  })

  it('건너뛰기 버튼 클릭 → onClose 호출', () => {
    const onClose = vi.fn()
    const { container } = renderWN(onClose)
    const skip = container.querySelector('.wn-nav-cta') as HTMLButtonElement
    fireEvent.click(skip)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Esc 키 → onClose 호출', () => {
    const onClose = vi.fn()
    renderWN(onClose)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('마지막 슬라이드 CTA = "시작하기" → onClose 호출', () => {
    const onClose = vi.fn()
    const { container } = renderWN(onClose)
    const chips = container.querySelectorAll('.wn-chip')
    fireEvent.click(chips[WN_SLIDES.length - 1])
    const cta = container.querySelector('.wn-cta') as HTMLButtonElement
    expect(cta.textContent).toBe('시작하기')
    fireEvent.click(cta)
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('UpdateNotes — open=false → 미렌더', () => {
  it('open=false → null (un-overlay 없음)', () => {
    const { container } = render(<UpdateNotes open={false} onClose={vi.fn()} />)
    expect(container.querySelector('.un-overlay')).toBeFalsy()
  })
})

describe('UpdateNotes — open=true', () => {
  function renderUN(onClose = vi.fn()) {
    const { container } = render(<UpdateNotes open={true} onClose={onClose} />)
    return { container, onClose }
  }

  it('un-overlay + un-hero 렌더', () => {
    const { container } = renderUN()
    expect(container.querySelector('.un-overlay')).toBeTruthy()
    expect(container.querySelector('.un-hero')).toBeTruthy()
  })

  it('un-title = "WHAT\'S NEW"', () => {
    renderUN()
    expect(screen.getByText("WHAT'S NEW")).toBeTruthy()
  })

  it('un-eyebrow = "새 버전 · v1.1"', () => {
    renderUN()
    expect(screen.getByText('새 버전 · v1.1')).toBeTruthy()
  })

  it('un-list 존재', () => {
    const { container } = renderUN()
    expect(container.querySelector('.un-list')).toBeTruthy()
  })

  it('un-item 개수 = UN_ITEMS.length', () => {
    const { container } = renderUN()
    const items = container.querySelectorAll('.un-item')
    expect(items.length).toBe(UN_ITEMS.length)
  })

  it('un-num 텍스트 = 01, 02, 03, 04', () => {
    const { container } = renderUN()
    const nums = Array.from(container.querySelectorAll('.un-num')).map((el) => el.textContent?.trim())
    expect(nums).toContain('01')
    expect(nums).toContain('02')
    expect(nums).toContain('03')
    expect(nums).toContain('04')
  })

  it('un-cta "시작하기" 존재', () => {
    renderUN()
    expect(screen.getByText('시작하기')).toBeTruthy()
  })

  it('un-cta 클릭 → onClose 호출', () => {
    const onClose = vi.fn()
    renderUN(onClose)
    fireEvent.click(screen.getByText('시작하기'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Esc 키 → onClose 호출', () => {
    const onClose = vi.fn()
    renderUN(onClose)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('un-marquee 존재 (키워드 마퀴)', () => {
    const { container } = renderUN()
    expect(container.querySelector('.un-marquee')).toBeTruthy()
    expect(container.querySelector('.un-marquee-track')).toBeTruthy()
  })

  it('un-foot 존재', () => {
    const { container } = renderUN()
    expect(container.querySelector('.un-foot')).toBeTruthy()
  })
})
