// @vitest-environment jsdom
/**
 * modal.test.tsx — F5-01 재사용 Modal 크롬 + SettingsModal.
 * backdrop + 카드 + 헤더 X, Esc/오버레이 닫기. 설정 = 좌nav + 콘텐츠(M5 placeholder).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Modal } from '../../src/renderer/src/components/Modal'
import { SettingsModal } from '../../src/renderer/src/components/SettingsModal'

afterEach(() => cleanup())

describe('Modal — 크롬 (F5-01)', () => {
  it('오버레이 + 카드 + 헤더(title/close) 렌더', () => {
    const { container } = render(<Modal title="설정" onClose={() => {}}>본문</Modal>)
    expect(container.querySelector('.modal-overlay')).toBeTruthy()
    expect(container.querySelector('.modal-card')).toBeTruthy()
    expect(screen.getByText('설정')).toBeTruthy()
    expect(screen.getByLabelText('닫기')).toBeTruthy()
    expect(screen.getByText('본문')).toBeTruthy()
  })

  it('Esc → onClose', () => {
    const onClose = vi.fn()
    render(<Modal title="t" onClose={onClose}>x</Modal>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('오버레이 클릭 → onClose, 카드 클릭 → 유지', () => {
    const onClose = vi.fn()
    const { container } = render(<Modal title="t" onClose={onClose}>x</Modal>)
    fireEvent.click(container.querySelector('.modal-card')!)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(container.querySelector('.modal-overlay')!)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('닫기 버튼 → onClose', () => {
    const onClose = vi.fn()
    render(<Modal title="t" onClose={onClose}>x</Modal>)
    fireEvent.click(screen.getByLabelText('닫기'))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('SettingsModal — 최소 소비자 (F5-01)', () => {
  it('좌 nav(정보/테마) + 콘텐츠 렌더', () => {
    const { container } = render(<SettingsModal onClose={() => {}} />)
    expect(container.querySelector('.set-nav')).toBeTruthy()
    expect(screen.getByText('정보')).toBeTruthy()
    expect(screen.getByText('테마')).toBeTruthy()
    expect(screen.getByText('AgentDeck')).toBeTruthy()
  })
})
