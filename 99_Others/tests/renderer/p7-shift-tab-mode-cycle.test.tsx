// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { renderHook, act } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

describe('appStore — pickerMode state', () => {
  beforeEach(async () => {
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    const { DEFAULT_MODE_SINGLE } = await import('../../../02_Source/renderer/src/lib/pickerOptions')
    useAppStore.setState({ pickerMode: DEFAULT_MODE_SINGLE })
  })

  it('초기값이 DEFAULT_MODE_SINGLE(auto)임', async () => {
    const { useAppStore, selectPickerMode } = await import('../../../02_Source/renderer/src/store/appStore')
    const { DEFAULT_MODE_SINGLE } = await import('../../../02_Source/renderer/src/lib/pickerOptions')
    expect(selectPickerMode(useAppStore.getState())).toBe(DEFAULT_MODE_SINGLE)
  })

  it('setPickerMode("plan") → pickerMode가 "plan"이 됨', async () => {
    const { useAppStore, selectPickerMode } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.getState().setPickerMode('plan')
    expect(selectPickerMode(useAppStore.getState())).toBe('plan')
  })

  it('setPickerMode("bypass") → pickerMode가 "bypass"가 됨', async () => {
    const { useAppStore, selectPickerMode } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.getState().setPickerMode('bypass')
    expect(selectPickerMode(useAppStore.getState())).toBe('bypass')
  })

  it('cyclePickerMode() — normal→plan→acceptEdits→auto→bypass→normal 순환', async () => {
    const { useAppStore, selectPickerMode } = await import('../../../02_Source/renderer/src/store/appStore')
    const { MODES } = await import('../../../02_Source/renderer/src/lib/pickerOptions')

    useAppStore.getState().setPickerMode(MODES[0].id)
    expect(selectPickerMode(useAppStore.getState())).toBe(MODES[0].id)

    useAppStore.getState().cyclePickerMode()
    expect(selectPickerMode(useAppStore.getState())).toBe(MODES[1].id)

    useAppStore.getState().cyclePickerMode()
    expect(selectPickerMode(useAppStore.getState())).toBe(MODES[2].id)

    useAppStore.getState().cyclePickerMode()
    expect(selectPickerMode(useAppStore.getState())).toBe(MODES[3].id)

    useAppStore.getState().cyclePickerMode()
    expect(selectPickerMode(useAppStore.getState())).toBe(MODES[4].id)

    useAppStore.getState().cyclePickerMode()
    expect(selectPickerMode(useAppStore.getState())).toBe(MODES[0].id)
  })

  it('cyclePickerMode() — 알 수 없는 mode에서 호출 시 첫 번째 mode로 이동', async () => {
    const { useAppStore, selectPickerMode } = await import('../../../02_Source/renderer/src/store/appStore')
    const { MODES } = await import('../../../02_Source/renderer/src/lib/pickerOptions')
    useAppStore.setState({ pickerMode: 'unknown-mode' })
    useAppStore.getState().cyclePickerMode()
    expect(selectPickerMode(useAppStore.getState())).toBe(MODES[0].id)
  })
})

describe('Composer — pickerMode store 연동', () => {
  beforeEach(async () => {
    if (!('api' in window)) {
      Object.defineProperty(window, 'api', {
        value: {
          listSlashCommands: vi.fn().mockResolvedValue([]),
          listSkills: vi.fn().mockResolvedValue([]),
          getUiPrefs: vi.fn().mockResolvedValue({}),
          setUiPref: vi.fn().mockResolvedValue(undefined),
        },
        writable: true,
        configurable: true,
      })
    } else {
      (window.api as Record<string, unknown>).listSlashCommands = vi.fn().mockResolvedValue([])
      ;(window.api as Record<string, unknown>).listSkills = vi.fn().mockResolvedValue([])
    }

    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    const { DEFAULT_MODE_SINGLE } = await import('../../../02_Source/renderer/src/lib/pickerOptions')
    useAppStore.setState({ pickerMode: DEFAULT_MODE_SINGLE })
  })

  it('마운트 시 Picker 모드 트리거에 store mode(auto) 반영', async () => {
    const { Composer } = await import('../../../02_Source/renderer/src/features/conversation/Composer')
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({ pickerMode: 'plan' })

    render(
      <Composer
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        isRunning={false}
      />
    )
    const modeBtn = screen.getByLabelText('모드 선택')
    expect(modeBtn.textContent).toMatch(/플랜/)
  })

  it('모드 Picker 선택 변경 시 store pickerMode 갱신', async () => {
    const { Composer } = await import('../../../02_Source/renderer/src/features/conversation/Composer')
    const { useAppStore, selectPickerMode } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({ pickerMode: 'auto' })

    const { container } = render(
      <Composer
        value=""
        onChange={vi.fn()}
        onSend={vi.fn()}
        onAbort={vi.fn()}
        isRunning={false}
      />
    )
    const modeBtn = screen.getByLabelText('모드 선택')
    fireEvent.click(modeBtn)
    const menu = container.querySelector('.pick-menu')
    expect(menu).toBeTruthy()
    const opts = menu!.querySelectorAll('.pick-opt')
    const planOpt = Array.from(opts).find((opt) => opt.textContent?.includes('플랜'))
    expect(planOpt).toBeTruthy()
    fireEvent.click(planOpt!)
    expect(selectPickerMode(useAppStore.getState())).toBe('plan')
  })

  it('onSend 호출 시 store pickerMode(현재 mode)를 전달', async () => {
    const { Composer } = await import('../../../02_Source/renderer/src/features/conversation/Composer')
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({ pickerMode: 'bypass' })

    const onSend = vi.fn()
    render(
      <Composer
        value="hello"
        onChange={vi.fn()}
        onSend={onSend}
        onAbort={vi.fn()}
        isRunning={false}
      />
    )
    fireEvent.click(screen.getByLabelText('전송'))
    expect(onSend).toHaveBeenCalledOnce()
    const callArg = onSend.mock.calls[0][0] as { mode: string }
    expect(callArg.mode).toBe('bypass')
  })
})

describe('Shell 단축키 — Shift+Tab → cyclePickerMode', () => {
  it('Shift+Tab keydown → cyclePickerMode 호출 (모드 변경)', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Source/renderer/src/lib/useGlobalShortcuts')
    const { useAppStore, selectPickerMode } = await import('../../../02_Source/renderer/src/store/appStore')
    const { MODES, DEFAULT_MODE_SINGLE } = await import('../../../02_Source/renderer/src/lib/pickerOptions')

    useAppStore.setState({ pickerMode: DEFAULT_MODE_SINGLE })
    expect(selectPickerMode(useAppStore.getState())).toBe(DEFAULT_MODE_SINGLE)

    const cyclePickerMode = vi.fn(() => {
      useAppStore.getState().cyclePickerMode()
    })

    renderHook(() => useGlobalShortcuts({
      onModeSwitch: () => cyclePickerMode(),
    }))

    await act(async () => {
      const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true })
      document.dispatchEvent(e)
    })

    expect(cyclePickerMode).toHaveBeenCalledOnce()
    const autoIdx = MODES.findIndex((m) => m.id === DEFAULT_MODE_SINGLE)
    const nextId = MODES[autoIdx + 1].id
    expect(selectPickerMode(useAppStore.getState())).toBe(nextId)
  })

  it('input 포커스 중에도 Shift+Tab → cyclePickerMode 호출됨(모달 없음)', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Source/renderer/src/lib/useGlobalShortcuts')
    const cyclePickerMode = vi.fn()

    renderHook(() => useGlobalShortcuts({
      onModeSwitch: cyclePickerMode,
    }))

    const inp = document.createElement('input')
    document.body.appendChild(inp)
    inp.focus()

    await act(async () => {
      const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true })
      inp.dispatchEvent(e)
    })

    expect(cyclePickerMode).toHaveBeenCalledOnce()
    document.body.removeChild(inp)
  })

  it('모달 열림(.modal-overlay) 시 Shift+Tab → cyclePickerMode 미호출', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Source/renderer/src/lib/useGlobalShortcuts')
    const cyclePickerMode = vi.fn()

    renderHook(() => useGlobalShortcuts({
      onModeSwitch: cyclePickerMode,
    }))

    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    document.body.appendChild(overlay)

    await act(async () => {
      const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true })
      document.dispatchEvent(e)
    })

    expect(cyclePickerMode).not.toHaveBeenCalled()
    document.body.removeChild(overlay)
  })

  it('모달 열림(.q-overlay) 시 textarea 포커스 + Shift+Tab → cyclePickerMode 미호출', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Source/renderer/src/lib/useGlobalShortcuts')
    const cyclePickerMode = vi.fn()

    renderHook(() => useGlobalShortcuts({
      onModeSwitch: cyclePickerMode,
    }))

    const overlay = document.createElement('div')
    overlay.className = 'q-overlay'
    document.body.appendChild(overlay)

    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    ta.focus()

    await act(async () => {
      const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true })
      ta.dispatchEvent(e)
    })

    expect(cyclePickerMode).not.toHaveBeenCalled()
    document.body.removeChild(overlay)
    document.body.removeChild(ta)
  })
})

describe('useGlobalShortcuts — 기존 Shift+Tab onModeSwitch 회귀 없음', () => {
  it('Shift+Tab → onModeSwitch 콜백 호출(기존 동작 유지)', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Source/renderer/src/lib/useGlobalShortcuts')
    const onModeSwitch = vi.fn()
    renderHook(() => useGlobalShortcuts({ onModeSwitch }))

    await act(async () => {
      const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true })
      document.dispatchEvent(e)
    })

    expect(onModeSwitch).toHaveBeenCalledOnce()
  })
})
