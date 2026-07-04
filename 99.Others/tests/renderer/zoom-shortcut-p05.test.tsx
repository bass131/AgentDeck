// @vitest-environment jsdom
/**
 * zoom-shortcut-p05.test.tsx — FB2 P05 TDD (실패 테스트 먼저 → 구현).
 *
 * 검증 대상:
 *   - 02.Source/renderer/src/lib/useGlobalShortcuts.ts — onZoomIn 콜백 배선
 *     (Ctrl/⌘+`=`, shift 없음만 · Shift+= 절대 미가로채기 · isComposing 무시)
 *   - 02.Source/renderer/src/lib/useGlobalZoom.ts — stepZoomFactor/resetZoomFactor
 *     (P03 클램프 setter 위임, window.api 미가용 시 no-op)
 *
 * 신뢰경계: renderer untrusted — window.api mock만 사용. fs/Node 0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  vi.resetModules()
})

// ─────────────────────────────────────────────────────────────────────────────
// useGlobalShortcuts — onZoomIn (Ctrl/⌘+=, unshifted)
// ─────────────────────────────────────────────────────────────────────────────

describe('useGlobalShortcuts — onZoomIn(Ctrl/⌘+=, shift 없음만)', () => {
  it('Ctrl+= (shift 없음) → onZoomIn 콜백 호출 + preventDefault', async () => {
    const { useGlobalShortcuts } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const onZoomIn = vi.fn()
    renderHook(() => useGlobalShortcuts({ onZoomIn }))

    const e = new KeyboardEvent('keydown', { key: '=', ctrlKey: true, cancelable: true, bubbles: true })
    await act(async () => {
      document.dispatchEvent(e)
    })

    expect(onZoomIn).toHaveBeenCalledOnce()
    expect(e.defaultPrevented).toBe(true)
  })

  it('Cmd(metaKey)+= (shift 없음) → onZoomIn 콜백 호출 (mac 대응)', async () => {
    const { useGlobalShortcuts } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const onZoomIn = vi.fn()
    renderHook(() => useGlobalShortcuts({ onZoomIn }))

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: '=', metaKey: true, cancelable: true, bubbles: true })
      )
    })

    expect(onZoomIn).toHaveBeenCalledOnce()
  })

  it('Ctrl+Shift+= → onZoomIn 미호출(네이티브 zoomIn role 몫 — 이중 발화 금지)', async () => {
    const { useGlobalShortcuts } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const onZoomIn = vi.fn()
    renderHook(() => useGlobalShortcuts({ onZoomIn }))

    const e = new KeyboardEvent('keydown', {
      key: '=',
      ctrlKey: true,
      shiftKey: true,
      cancelable: true,
      bubbles: true,
    })
    await act(async () => {
      document.dispatchEvent(e)
    })

    expect(onZoomIn).not.toHaveBeenCalled()
    // 이 훅이 preventDefault도 하지 않아야 네이티브 accelerator가 정상 발화할 여지가 남는다.
    expect(e.defaultPrevented).toBe(false)
  })

  it('IME 조합 중(isComposing) Ctrl+= → onZoomIn 미호출', async () => {
    const { useGlobalShortcuts } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const onZoomIn = vi.fn()
    renderHook(() => useGlobalShortcuts({ onZoomIn }))

    const e = new KeyboardEvent('keydown', {
      key: '=',
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
      isComposing: true,
    })
    await act(async () => {
      document.dispatchEvent(e)
    })

    expect(onZoomIn).not.toHaveBeenCalled()
  })

  it('입력 포커스 중에도 Ctrl+= → onZoomIn 호출(줌은 텍스트 단축키가 아님, VSCode 관례)', async () => {
    const { useGlobalShortcuts } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const onZoomIn = vi.fn()
    renderHook(() => useGlobalShortcuts({ onZoomIn }))

    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    ta.focus()

    await act(async () => {
      ta.dispatchEvent(
        new KeyboardEvent('keydown', { key: '=', ctrlKey: true, cancelable: true, bubbles: true })
      )
    })

    expect(onZoomIn).toHaveBeenCalledOnce()
    document.body.removeChild(ta)
  })

  it('콜백 미주입 시 no-op(오류 없음)', async () => {
    const { useGlobalShortcuts } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    renderHook(() => useGlobalShortcuts({}))
    expect(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: '=', ctrlKey: true, cancelable: true, bubbles: true })
      )
    }).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// useGlobalZoom — stepZoomFactor / resetZoomFactor (FB2 P05)
// ─────────────────────────────────────────────────────────────────────────────

describe('stepZoomFactor / resetZoomFactor — P03 클램프 setter 위임', () => {
  let mockGetZoomFactor: ReturnType<typeof vi.fn>
  let mockSetZoomFactor: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockGetZoomFactor = vi.fn(() => 1)
    mockSetZoomFactor = vi.fn()
    ;(window as unknown as { api: Record<string, unknown> }).api = {
      getZoomFactor: mockGetZoomFactor,
      setZoomFactor: mockSetZoomFactor,
    }
  })

  it('stepZoomFactor(0.1) → getZoomFactor()+0.1로 setZoomFactor 호출', async () => {
    const { stepZoomFactor } = await import('../../../02.Source/renderer/src/lib/useGlobalZoom')
    mockGetZoomFactor.mockReturnValue(1.2)

    stepZoomFactor(0.1)

    expect(mockSetZoomFactor).toHaveBeenCalledWith(expect.closeTo(1.3, 5))
  })

  it('stepZoomFactor(-0.1) → getZoomFactor()-0.1로 setZoomFactor 호출(축소 버튼)', async () => {
    const { stepZoomFactor } = await import('../../../02.Source/renderer/src/lib/useGlobalZoom')
    mockGetZoomFactor.mockReturnValue(1.2)

    stepZoomFactor(-0.1)

    const arg = mockSetZoomFactor.mock.calls[0][0] as number
    expect(arg).toBeCloseTo(1.1, 5)
  })

  it('resetZoomFactor() → setZoomFactor(1) 호출(getZoomFactor 조회 불필요)', async () => {
    const { resetZoomFactor } = await import('../../../02.Source/renderer/src/lib/useGlobalZoom')

    resetZoomFactor()

    expect(mockSetZoomFactor).toHaveBeenCalledWith(1)
  })

  it('window.api 미가용 환경에서 stepZoomFactor는 no-op(크래시 없음)', async () => {
    (window as unknown as { api: Record<string, unknown> }).api = {}
    const { stepZoomFactor } = await import('../../../02.Source/renderer/src/lib/useGlobalZoom')

    expect(() => stepZoomFactor(0.1)).not.toThrow()
    expect(mockSetZoomFactor).not.toHaveBeenCalled()
  })

  it('window.api 미가용 환경에서 resetZoomFactor는 no-op(크래시 없음)', async () => {
    (window as unknown as { api: Record<string, unknown> }).api = {}
    const { resetZoomFactor } = await import('../../../02.Source/renderer/src/lib/useGlobalZoom')

    expect(() => resetZoomFactor()).not.toThrow()
    expect(mockSetZoomFactor).not.toHaveBeenCalled()
  })

  it('클램프 로직은 여기서 하지 않는다(범위 밖 값도 그대로 setZoomFactor에 전달 — preload가 clamp)', async () => {
    const { stepZoomFactor } = await import('../../../02.Source/renderer/src/lib/useGlobalZoom')
    mockGetZoomFactor.mockReturnValue(1.95)

    stepZoomFactor(0.1) // 2.05 — 범위(0.5~2.0) 밖이지만 이 함수는 그대로 위임

    const arg = mockSetZoomFactor.mock.calls[0][0] as number
    expect(arg).toBeCloseTo(2.05, 5)
  })
})
