// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'

afterEach(() => cleanup())

describe('useGlobalShortcuts — 백쿼트 사이드바 토글', () => {
  it('백쿼트(`) 키 → toggleSidebar 콜백 호출', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Source/renderer/src/lib/useGlobalShortcuts')
    const toggleSidebar = vi.fn()
    renderHook(() => useGlobalShortcuts({ toggleSidebar }))
    await act(async () => {
      fireKeyDown('`')
    })
    expect(toggleSidebar).toHaveBeenCalledOnce()
  })
})

describe('useGlobalShortcuts — Esc 콜백', () => {
  it('Esc 키 → onEscape 콜백 호출', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Source/renderer/src/lib/useGlobalShortcuts')
    const onEscape = vi.fn()
    renderHook(() => useGlobalShortcuts({ onEscape }))
    await act(async () => {
      fireKeyDown('Escape')
    })
    expect(onEscape).toHaveBeenCalledOnce()
  })

  it('Esc → preventDefault 호출 안 함(모달 Esc 우선 보장)', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Source/renderer/src/lib/useGlobalShortcuts')
    renderHook(() => useGlobalShortcuts({}))
    const e = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true })
    document.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
  })
})

describe('useGlobalShortcuts — 입력 포커스 시 텍스트 단축키 무시', () => {
  it('textarea 포커스 시 백쿼트 → toggleSidebar 무시', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Source/renderer/src/lib/useGlobalShortcuts')
    const toggleSidebar = vi.fn()
    renderHook(() => useGlobalShortcuts({ toggleSidebar }))

    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    ta.focus()

    await act(async () => {
      const e = new KeyboardEvent('keydown', { key: '`', cancelable: true, bubbles: true })
      ta.dispatchEvent(e)
    })
    expect(toggleSidebar).not.toHaveBeenCalled()
    document.body.removeChild(ta)
  })

  it('input 포커스 시 Ctrl+N → no-op(콜백 없음 시 오류 없음)', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Source/renderer/src/lib/useGlobalShortcuts')
    renderHook(() => useGlobalShortcuts({}))
    const inp = document.createElement('input')
    document.body.appendChild(inp)
    inp.focus()
    expect(() => {
      const e = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, cancelable: true, bubbles: true })
      inp.dispatchEvent(e)
    }).not.toThrow()
    document.body.removeChild(inp)
  })
})

describe('useGlobalShortcuts — Ctrl+N/O/F 골격', () => {
  it('Ctrl+N → onNewChat 콜백(있으면)', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Source/renderer/src/lib/useGlobalShortcuts')
    const onNewChat = vi.fn()
    renderHook(() => useGlobalShortcuts({ onNewChat }))
    await act(async () => {
      fireKeyDown('n', { ctrlKey: true })
    })
    expect(onNewChat).toHaveBeenCalledOnce()
  })

  it('콜백 미주입 시 no-op(오류 없음)', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Source/renderer/src/lib/useGlobalShortcuts')
    renderHook(() => useGlobalShortcuts({}))
    expect(() => {
      fireKeyDown('`')
      fireKeyDown('Escape')
    }).not.toThrow()
  })
})

function fireKeyDown(key: string, extra: Partial<KeyboardEventInit> = {}): void {
  const e = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...extra })
  document.dispatchEvent(e)
}
