// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  document.querySelectorAll(
    '.modal-overlay, .q-overlay, .perm-card, .ask-overlay, .pf-overlay, .iv-overlay, .gitm-overlay,' +
    '.fv-overlay, .set-dialog-overlay, .sa-overlay, .pr-overlay,' +
    '.ask-mini, .q-mini-pill, .sel-bar'
  ).forEach((el) => el.remove())
})

describe('isAnyModalOpen — DOM 오버레이 감지', () => {
  it('오버레이 없으면 false', async () => {
    const { isAnyModalOpen } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    expect(isAnyModalOpen()).toBe(false)
  })

  it('.modal-overlay 존재 시 true', async () => {
    const { isAnyModalOpen } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'modal-overlay'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  it('.q-overlay 존재 시 true', async () => {
    const { isAnyModalOpen } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'q-overlay'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  it('.iv-overlay 존재 시 true', async () => {
    const { isAnyModalOpen } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'iv-overlay'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  it('.gitm-overlay 존재 시 true', async () => {
    const { isAnyModalOpen } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'gitm-overlay'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  it('.fv-overlay 존재 시 true (FileModal — openedFile 시 활성)', async () => {
    const { isAnyModalOpen } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'fv-overlay'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  it('.set-dialog-overlay 존재 시 true (WhatsNew/UpdateNotes/AppUpdateGate — P4 부트 자동 트리거)', async () => {
    const { isAnyModalOpen } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'set-dialog-overlay'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  it('.sa-overlay 존재 시 true (SubAgentModal — agent!=null 시 렌더)', async () => {
    const { isAnyModalOpen } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'sa-overlay'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  it('.pr-overlay 존재 시 true (PromptModal — promptSlot!=null 시 렌더)', async () => {
    const { isAnyModalOpen } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'pr-overlay'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  it('.ask-mini 존재 시 true (AskModal 최소화 — Esc 소비)', async () => {
    const { isAnyModalOpen } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'ask-mini'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  it('.q-mini-pill 존재 시 true (QuestionModal 최소화 알약)', async () => {
    const { isAnyModalOpen } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'q-mini-pill'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  it('.sel-bar 존재 시 true (SelectionToolbar — pos!=null 시 렌더)', async () => {
    const { isAnyModalOpen } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'sel-bar'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  it('.perm-card 존재 시 true (PermissionCard — pendingPermission 있을 때만 렌더, Esc 로컬 소비)', async () => {
    const { isAnyModalOpen } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'perm-card'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })
})

describe('useGlobalShortcuts — Ctrl+N → onNewChat 배선', () => {
  it('Ctrl+N → onNewChat 콜백 호출(입력 미포커스)', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const onNewChat = vi.fn()
    renderHook(() => useGlobalShortcuts({ onNewChat }))
    await act(async () => {
      fireKeyDown('n', { ctrlKey: true })
    })
    expect(onNewChat).toHaveBeenCalledOnce()
  })

  it('input 포커스 시 Ctrl+N → onNewChat 미호출', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const onNewChat = vi.fn()
    renderHook(() => useGlobalShortcuts({ onNewChat }))

    const inp = document.createElement('input')
    document.body.appendChild(inp)
    inp.focus()

    await act(async () => {
      const e = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, cancelable: true, bubbles: true })
      inp.dispatchEvent(e)
    })
    expect(onNewChat).not.toHaveBeenCalled()
    document.body.removeChild(inp)
  })

  it('textarea 포커스 시 Ctrl+N → onNewChat 미호출', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const onNewChat = vi.fn()
    renderHook(() => useGlobalShortcuts({ onNewChat }))

    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    ta.focus()

    await act(async () => {
      const e = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, cancelable: true, bubbles: true })
      ta.dispatchEvent(e)
    })
    expect(onNewChat).not.toHaveBeenCalled()
    document.body.removeChild(ta)
  })
})

describe('useGlobalShortcuts — Ctrl+O → onOpenFolder 배선', () => {
  it('Ctrl+O → onOpenFolder 콜백 호출', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const onOpenFolder = vi.fn()
    renderHook(() => useGlobalShortcuts({ onOpenFolder }))
    await act(async () => {
      fireKeyDown('o', { ctrlKey: true })
    })
    expect(onOpenFolder).toHaveBeenCalledOnce()
  })

  it('input 포커스 시 Ctrl+O → onOpenFolder 미호출', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const onOpenFolder = vi.fn()
    renderHook(() => useGlobalShortcuts({ onOpenFolder }))

    const inp = document.createElement('input')
    document.body.appendChild(inp)
    inp.focus()

    await act(async () => {
      const e = new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, cancelable: true, bubbles: true })
      inp.dispatchEvent(e)
    })
    expect(onOpenFolder).not.toHaveBeenCalled()
    document.body.removeChild(inp)
  })
})

describe('useGlobalShortcuts — Esc onEscape 콜백 + abortRun 조건부', () => {
  it('Esc → onEscape 콜백 호출', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const onEscape = vi.fn()
    renderHook(() => useGlobalShortcuts({ onEscape }))
    await act(async () => {
      fireKeyDown('Escape')
    })
    expect(onEscape).toHaveBeenCalledOnce()
  })

  it('Esc → preventDefault 미호출(모달 체인 우선 보장)', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    renderHook(() => useGlobalShortcuts({}))
    const e = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true })
    document.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
  })
})

describe('Shell onEscape 로직 — abortRun 조건부 호출', () => {
  function makeOnEscape(
    isRunning: boolean,
    workspaceMode: 'single' | 'multi',
    abortRun: () => Promise<void>
  ): () => void {
    return () => {
      if (isAnyModalOpenInTest()) return
      if (workspaceMode !== 'single') return
      if (isRunning) {
        void abortRun()
      }
    }
  }

  function isAnyModalOpenInTest(): boolean {
    return document.querySelector(
      '.modal-overlay, .q-overlay, .ask-overlay, .pf-overlay, .iv-overlay, .gitm-overlay,' +
      '.fv-overlay, .set-dialog-overlay, .sa-overlay, .pr-overlay,' +
      '.ask-mini, .q-mini-pill, .sel-bar'
    ) !== null
  }

  it('isRunning=true, 모달 없음, single → abortRun 호출', () => {
    const abortRun = vi.fn().mockResolvedValue(undefined)
    const onEscape = makeOnEscape(true, 'single', abortRun)
    onEscape()
    expect(abortRun).toHaveBeenCalledOnce()
  })

  it('isRunning=false → abortRun 미호출', () => {
    const abortRun = vi.fn().mockResolvedValue(undefined)
    const onEscape = makeOnEscape(false, 'single', abortRun)
    onEscape()
    expect(abortRun).not.toHaveBeenCalled()
  })

  it('모달 열림(.modal-overlay) → abortRun 미호출', () => {
    const el = document.createElement('div')
    el.className = 'modal-overlay'
    document.body.appendChild(el)

    const abortRun = vi.fn().mockResolvedValue(undefined)
    const onEscape = makeOnEscape(true, 'single', abortRun)
    onEscape()
    expect(abortRun).not.toHaveBeenCalled()

    document.body.removeChild(el)
  })

  it('모달 열림(.q-overlay) → abortRun 미호출', () => {
    const el = document.createElement('div')
    el.className = 'q-overlay'
    document.body.appendChild(el)

    const abortRun = vi.fn().mockResolvedValue(undefined)
    const onEscape = makeOnEscape(true, 'single', abortRun)
    onEscape()
    expect(abortRun).not.toHaveBeenCalled()

    document.body.removeChild(el)
  })

  it('workspaceMode=multi → abortRun 미호출', () => {
    const abortRun = vi.fn().mockResolvedValue(undefined)
    const onEscape = makeOnEscape(true, 'multi', abortRun)
    onEscape()
    expect(abortRun).not.toHaveBeenCalled()
  })

  it('ask-overlay 존재 시 → abortRun 미호출', () => {
    const el = document.createElement('div')
    el.className = 'ask-overlay'
    document.body.appendChild(el)

    const abortRun = vi.fn().mockResolvedValue(undefined)
    const onEscape = makeOnEscape(true, 'single', abortRun)
    onEscape()
    expect(abortRun).not.toHaveBeenCalled()

    document.body.removeChild(el)
  })

  it('fv-overlay 존재 시 → abortRun 미호출 (FileModal 열림)', () => {
    const el = document.createElement('div')
    el.className = 'fv-overlay'
    document.body.appendChild(el)

    const abortRun = vi.fn().mockResolvedValue(undefined)
    const onEscape = makeOnEscape(true, 'single', abortRun)
    onEscape()
    expect(abortRun).not.toHaveBeenCalled()

    document.body.removeChild(el)
  })

  it('set-dialog-overlay 존재 시 → abortRun 미호출 (WhatsNew/UpdateNotes 열림)', () => {
    const el = document.createElement('div')
    el.className = 'set-dialog-overlay'
    document.body.appendChild(el)

    const abortRun = vi.fn().mockResolvedValue(undefined)
    const onEscape = makeOnEscape(true, 'single', abortRun)
    onEscape()
    expect(abortRun).not.toHaveBeenCalled()

    document.body.removeChild(el)
  })

  it('sa-overlay 존재 시 → abortRun 미호출 (SubAgentModal 열림)', () => {
    const el = document.createElement('div')
    el.className = 'sa-overlay'
    document.body.appendChild(el)

    const abortRun = vi.fn().mockResolvedValue(undefined)
    const onEscape = makeOnEscape(true, 'single', abortRun)
    onEscape()
    expect(abortRun).not.toHaveBeenCalled()

    document.body.removeChild(el)
  })

  it('pr-overlay 존재 시 → abortRun 미호출 (PromptModal 열림)', () => {
    const el = document.createElement('div')
    el.className = 'pr-overlay'
    document.body.appendChild(el)

    const abortRun = vi.fn().mockResolvedValue(undefined)
    const onEscape = makeOnEscape(true, 'single', abortRun)
    onEscape()
    expect(abortRun).not.toHaveBeenCalled()

    document.body.removeChild(el)
  })

  it('ask-mini 존재 시 → abortRun 미호출 (AskModal 최소화 — Esc 소비)', () => {
    const el = document.createElement('div')
    el.className = 'ask-mini'
    document.body.appendChild(el)

    const abortRun = vi.fn().mockResolvedValue(undefined)
    const onEscape = makeOnEscape(true, 'single', abortRun)
    onEscape()
    expect(abortRun).not.toHaveBeenCalled()

    document.body.removeChild(el)
  })

  it('q-mini-pill 존재 시 → abortRun 미호출 (QuestionModal 최소화)', () => {
    const el = document.createElement('div')
    el.className = 'q-mini-pill'
    document.body.appendChild(el)

    const abortRun = vi.fn().mockResolvedValue(undefined)
    const onEscape = makeOnEscape(true, 'single', abortRun)
    onEscape()
    expect(abortRun).not.toHaveBeenCalled()

    document.body.removeChild(el)
  })

  it('sel-bar 존재 시 → abortRun 미호출 (SelectionToolbar 열림)', () => {
    const el = document.createElement('div')
    el.className = 'sel-bar'
    document.body.appendChild(el)

    const abortRun = vi.fn().mockResolvedValue(undefined)
    const onEscape = makeOnEscape(true, 'single', abortRun)
    onEscape()
    expect(abortRun).not.toHaveBeenCalled()

    document.body.removeChild(el)
  })
})

describe('useGlobalShortcuts — Shift+Tab → onModeSwitch', () => {
  it('Shift+Tab → onModeSwitch 콜백 호출', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const onModeSwitch = vi.fn()
    renderHook(() => useGlobalShortcuts({ onModeSwitch }))
    await act(async () => {
      fireKeyDown('Tab', { shiftKey: true })
    })
    expect(onModeSwitch).toHaveBeenCalledOnce()
  })

  it('input 포커스 중에도 Shift+Tab → onModeSwitch 호출됨(모달 없음)', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const onModeSwitch = vi.fn()
    renderHook(() => useGlobalShortcuts({ onModeSwitch }))

    const inp = document.createElement('input')
    document.body.appendChild(inp)
    inp.focus()

    await act(async () => {
      const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true })
      inp.dispatchEvent(e)
    })
    expect(onModeSwitch).toHaveBeenCalledOnce()
    document.body.removeChild(inp)
  })

  it('textarea 포커스 중에도 Shift+Tab → onModeSwitch 호출됨(모달 없음)', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const onModeSwitch = vi.fn()
    renderHook(() => useGlobalShortcuts({ onModeSwitch }))

    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    ta.focus()

    await act(async () => {
      const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true })
      ta.dispatchEvent(e)
    })
    expect(onModeSwitch).toHaveBeenCalledOnce()
    document.body.removeChild(ta)
  })

  it('모달 열림(.modal-overlay) 시 Shift+Tab → onModeSwitch 미호출', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const onModeSwitch = vi.fn()
    renderHook(() => useGlobalShortcuts({ onModeSwitch }))

    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    document.body.appendChild(overlay)

    await act(async () => {
      fireKeyDown('Tab', { shiftKey: true })
    })
    expect(onModeSwitch).not.toHaveBeenCalled()
    document.body.removeChild(overlay)
  })

  it('모달 열림(.q-overlay) 시 Shift+Tab → onModeSwitch 미호출', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const onModeSwitch = vi.fn()
    renderHook(() => useGlobalShortcuts({ onModeSwitch }))

    const overlay = document.createElement('div')
    overlay.className = 'q-overlay'
    document.body.appendChild(overlay)

    await act(async () => {
      fireKeyDown('Tab', { shiftKey: true })
    })
    expect(onModeSwitch).not.toHaveBeenCalled()
    document.body.removeChild(overlay)
  })

  it('모달 없음·input 미포커스 시 Shift+Tab → onModeSwitch 호출됨(기존 동작)', async () => {
    const { useGlobalShortcuts } = await import('../../../02_Project/00_Source/renderer/src/lib/useGlobalShortcuts')
    const onModeSwitch = vi.fn()
    renderHook(() => useGlobalShortcuts({ onModeSwitch }))

    await act(async () => {
      fireKeyDown('Tab', { shiftKey: true })
    })
    expect(onModeSwitch).toHaveBeenCalledOnce()
  })
})

function fireKeyDown(key: string, extra: Partial<KeyboardEventInit> = {}): void {
  const e = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...extra })
  document.dispatchEvent(e)
}
