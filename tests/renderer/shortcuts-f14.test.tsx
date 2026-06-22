// @vitest-environment jsdom
/**
 * shortcuts-f14.test.tsx — F14-03 useGlobalShortcuts 단위 테스트(renderer 부분).
 * TDD: 실패→구현 순서.
 * 제약 준수:
 * - 백쿼트 → 사이드바 토글 콜백
 * - Esc → Esc 콜백(모달 우선: 전역 Esc 무조건 preventDefault 금지)
 * - 입력 포커스 시 텍스트 단축키 무시
 * - 모달 오픈 시 Esc 모달 우선 회귀 0
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'

afterEach(() => cleanup())

// ── useGlobalShortcuts ───────────────────────────────────────────────────────

describe('useGlobalShortcuts — 백쿼트 사이드바 토글', () => {
  it('백쿼트(`) 키 → toggleSidebar 콜백 호출', async () => {
    const { useGlobalShortcuts } = await import('../../src/renderer/src/lib/useGlobalShortcuts')
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
    const { useGlobalShortcuts } = await import('../../src/renderer/src/lib/useGlobalShortcuts')
    const onEscape = vi.fn()
    renderHook(() => useGlobalShortcuts({ onEscape }))
    await act(async () => {
      fireKeyDown('Escape')
    })
    expect(onEscape).toHaveBeenCalledOnce()
  })

  it('Esc → preventDefault 호출 안 함(모달 Esc 우선 보장)', async () => {
    // 전역 useGlobalShortcuts는 Esc에 대해 e.preventDefault()를 무조건 호출하면 안 됨.
    // 실제로 모달이 자체 keydown handler에서 Esc를 처리하므로 전역에서 preventDefault하면 안 됨.
    const { useGlobalShortcuts } = await import('../../src/renderer/src/lib/useGlobalShortcuts')
    renderHook(() => useGlobalShortcuts({}))
    const e = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true })
    document.dispatchEvent(e)
    // preventDefault가 호출되지 않았으면 defaultPrevented=false
    expect(e.defaultPrevented).toBe(false)
  })
})

describe('useGlobalShortcuts — 입력 포커스 시 텍스트 단축키 무시', () => {
  it('textarea 포커스 시 백쿼트 → toggleSidebar 무시', async () => {
    const { useGlobalShortcuts } = await import('../../src/renderer/src/lib/useGlobalShortcuts')
    const toggleSidebar = vi.fn()
    renderHook(() => useGlobalShortcuts({ toggleSidebar }))

    // textarea에 포커스
    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    ta.focus()

    await act(async () => {
      // 백쿼트를 textarea에서 발생시킴
      const e = new KeyboardEvent('keydown', { key: '`', cancelable: true, bubbles: true })
      ta.dispatchEvent(e)
    })
    expect(toggleSidebar).not.toHaveBeenCalled()
    document.body.removeChild(ta)
  })

  it('input 포커스 시 Ctrl+N → no-op(콜백 없음 시 오류 없음)', async () => {
    const { useGlobalShortcuts } = await import('../../src/renderer/src/lib/useGlobalShortcuts')
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
    const { useGlobalShortcuts } = await import('../../src/renderer/src/lib/useGlobalShortcuts')
    const onNewChat = vi.fn()
    renderHook(() => useGlobalShortcuts({ onNewChat }))
    await act(async () => {
      fireKeyDown('n', { ctrlKey: true })
    })
    expect(onNewChat).toHaveBeenCalledOnce()
  })

  it('콜백 미주입 시 no-op(오류 없음)', async () => {
    const { useGlobalShortcuts } = await import('../../src/renderer/src/lib/useGlobalShortcuts')
    renderHook(() => useGlobalShortcuts({}))
    expect(() => {
      fireKeyDown('`')
      fireKeyDown('Escape')
    }).not.toThrow()
  })
})

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function fireKeyDown(key: string, extra: Partial<KeyboardEventInit> = {}): void {
  const e = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...extra })
  document.dispatchEvent(e)
}
