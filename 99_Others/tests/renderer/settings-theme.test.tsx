// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const KEY = 'agentdeck.theme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

async function openThemePane(): Promise<void> {
  const { SettingsModal } = await import('../../../02_Source/renderer/src/components/00_shell/SettingsModal')
  render(<SettingsModal onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: '테마' }))
}

describe('SettingsModal — 테마 토글 (F6-01)', () => {
  it('테마 섹션에 다크/라이트 2 옵션을 렌더한다 (placeholder 없음)', async () => {
    await openThemePane()
    expect(screen.getByRole('button', { name: /다크/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /라이트/ })).toBeTruthy()
    expect(screen.queryByText(/다음 업데이트/)).toBeNull()
  })

  it('라이트 클릭 → data-theme=light + localStorage 영속', async () => {
    await openThemePane()
    fireEvent.click(screen.getByRole('button', { name: /라이트/ }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem(KEY)).toBe('light')
  })

  it('다크 클릭 → data-theme=dark + localStorage 영속', async () => {
    localStorage.setItem(KEY, 'light')
    await openThemePane()
    fireEvent.click(screen.getByRole('button', { name: /다크/ }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(KEY)).toBe('dark')
  })

  it('현재 선택 테마 옵션이 aria-pressed=true — 라이트 저장 시 라이트가 활성', async () => {
    localStorage.setItem(KEY, 'light')
    await openThemePane()
    expect(screen.getByRole('button', { name: /라이트/, pressed: true })).toBeTruthy()
    expect(screen.getByRole('button', { name: /다크/, pressed: false })).toBeTruthy()
  })

  it('선택 변경 시 활성 표시가 따라간다 (라이트 클릭 후 라이트 활성)', async () => {
    await openThemePane()
    expect(screen.getByRole('button', { name: /라이트/, pressed: false })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /라이트/ }))
    expect(screen.getByRole('button', { name: /라이트/, pressed: true })).toBeTruthy()
  })
})
