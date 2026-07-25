// @vitest-environment jsdom
/**
 * global-shortcuts-p6.test.tsx — P6 전역 단축키 배선 TDD 테스트.
 *
 * 테스트 순서(TDD): 실패 → 통과.
 *
 * 검증 항목:
 * 1. Ctrl+N → newConversation 호출
 * 2. Ctrl+O → openWorkspace 호출
 * 3. Esc (isRunning=true, 모달 없음, single 모드) → abortRun 호출
 * 4. Esc (isRunning=false) → abortRun 미호출
 * 5. Esc (모달 열림 — .modal-overlay 존재) → abortRun 미호출
 * 6. Esc (q-overlay 존재) → abortRun 미호출
 * 7. input 포커스 시 Ctrl+N → newConversation 미호출
 * 8. isAnyModalOpen — 모달 클래스 DOM 감지 단위 테스트
 * 9. (P6 갭 메우기) 누락 오버레이 커버리지:
 *    fv-overlay / set-dialog-overlay / sa-overlay / pr-overlay /
 *    ask-mini / q-mini-pill / sel-bar
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'

// afterEach: 모든 알려진 오버레이 정리 (갭 보강 후 전체 셀렉터 포함)
afterEach(() => {
  cleanup()
  // DOM 잔여 오버레이 제거 — isAnyModalOpen MODAL_SELECTORS와 동기화 유지
  // BF3 P06(ADR-030): .perm-card(PermissionCard) 추가 — 인라인 카드지만 Esc를 자체
  // 소비하므로 MODAL_SELECTORS에 포함(useGlobalShortcuts.ts 주석 참조).
  document.querySelectorAll(
    '.modal-overlay, .q-overlay, .perm-card, .ask-overlay, .pf-overlay, .iv-overlay, .gitm-overlay,' +
    '.fv-overlay, .set-dialog-overlay, .sa-overlay, .pr-overlay,' +
    '.ask-mini, .q-mini-pill, .sel-bar'
  ).forEach((el) => el.remove())
})

// ── isAnyModalOpen 유틸 단위 테스트 ─────────────────────────────────────────

describe('isAnyModalOpen — DOM 오버레이 감지', () => {
  it('오버레이 없으면 false', async () => {
    const { isAnyModalOpen } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    expect(isAnyModalOpen()).toBe(false)
  })

  it('.modal-overlay 존재 시 true', async () => {
    const { isAnyModalOpen } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'modal-overlay'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  it('.q-overlay 존재 시 true', async () => {
    const { isAnyModalOpen } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'q-overlay'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  it('.iv-overlay 존재 시 true', async () => {
    const { isAnyModalOpen } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'iv-overlay'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  it('.gitm-overlay 존재 시 true', async () => {
    const { isAnyModalOpen } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'gitm-overlay'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  // ── P6 갭 보강: 누락 오버레이 6종 ───────────────────────────────────────────

  it('.fv-overlay 존재 시 true (FileModal — openedFile 시 활성)', async () => {
    const { isAnyModalOpen } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'fv-overlay'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  it('.set-dialog-overlay 존재 시 true (WhatsNew/UpdateNotes/AppUpdateGate — P4 부트 자동 트리거)', async () => {
    const { isAnyModalOpen } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'set-dialog-overlay'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  it('.sa-overlay 존재 시 true (SubAgentModal — agent!=null 시 렌더)', async () => {
    const { isAnyModalOpen } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'sa-overlay'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  it('.pr-overlay 존재 시 true (PromptModal — promptSlot!=null 시 렌더)', async () => {
    const { isAnyModalOpen } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'pr-overlay'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  it('.ask-mini 존재 시 true (AskModal 최소화 — Esc 소비)', async () => {
    const { isAnyModalOpen } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'ask-mini'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  it('.q-mini-pill 존재 시 true (QuestionModal 최소화 알약)', async () => {
    const { isAnyModalOpen } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'q-mini-pill'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  it('.sel-bar 존재 시 true (SelectionToolbar — pos!=null 시 렌더)', async () => {
    const { isAnyModalOpen } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'sel-bar'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })

  // ── BF3 P06(ADR-030): .perm-card(PermissionCard) 커버리지 ──────────────────
  it('.perm-card 존재 시 true (PermissionCard — pendingPermission 있을 때만 렌더, Esc 로컬 소비)', async () => {
    const { isAnyModalOpen } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const el = document.createElement('div')
    el.className = 'perm-card'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(true)
    document.body.removeChild(el)
  })
})

// ── Ctrl+N → newConversation ─────────────────────────────────────────────────

describe('useGlobalShortcuts — Ctrl+N → onNewChat 배선', () => {
  it('Ctrl+N → onNewChat 콜백 호출(입력 미포커스)', async () => {
    const { useGlobalShortcuts } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const onNewChat = vi.fn()
    renderHook(() => useGlobalShortcuts({ onNewChat }))
    await act(async () => {
      fireKeyDown('n', { ctrlKey: true })
    })
    expect(onNewChat).toHaveBeenCalledOnce()
  })

  it('input 포커스 시 Ctrl+N → onNewChat 미호출', async () => {
    const { useGlobalShortcuts } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
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
    const { useGlobalShortcuts } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
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

// ── Ctrl+O → openWorkspace ───────────────────────────────────────────────────

describe('useGlobalShortcuts — Ctrl+O → onOpenFolder 배선', () => {
  it('Ctrl+O → onOpenFolder 콜백 호출', async () => {
    const { useGlobalShortcuts } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const onOpenFolder = vi.fn()
    renderHook(() => useGlobalShortcuts({ onOpenFolder }))
    await act(async () => {
      fireKeyDown('o', { ctrlKey: true })
    })
    expect(onOpenFolder).toHaveBeenCalledOnce()
  })

  it('input 포커스 시 Ctrl+O → onOpenFolder 미호출', async () => {
    const { useGlobalShortcuts } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
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

// ── Esc → abortRun (조건부) ─────────────────────────────────────────────────

describe('useGlobalShortcuts — Esc onEscape 콜백 + abortRun 조건부', () => {
  it('Esc → onEscape 콜백 호출', async () => {
    const { useGlobalShortcuts } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const onEscape = vi.fn()
    renderHook(() => useGlobalShortcuts({ onEscape }))
    await act(async () => {
      fireKeyDown('Escape')
    })
    expect(onEscape).toHaveBeenCalledOnce()
  })

  it('Esc → preventDefault 미호출(모달 체인 우선 보장)', async () => {
    const { useGlobalShortcuts } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    renderHook(() => useGlobalShortcuts({}))
    const e = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true })
    document.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
  })
})

// ── Shell 통합: Esc+isRunning+모달 가드 → abortRun ─────────────────────────
//
// Shell.tsx의 onEscape 주입 로직을 검증.
// appStore를 mock하여 abortRun spy 주입.
// Shell 렌더 대신 onEscape 콜백 자체의 로직을 격리 테스트.

describe('Shell onEscape 로직 — abortRun 조건부 호출', () => {
  // onEscape 핸들러 팩토리: Shell.tsx가 useGlobalShortcuts에 주입할 콜백과 동일한 로직
  // isRunning, workspaceMode, abortRun을 인자로 받아 onEscape 함수를 생성
  function makeOnEscape(
    isRunning: boolean,
    workspaceMode: 'single' | 'multi',
    abortRun: () => Promise<void>
  ): () => void {
    return () => {
      // 모달 열려 있으면 abort 금지
      if (isAnyModalOpenInTest()) return
      // multi 모드에서는 abort 금지
      if (workspaceMode !== 'single') return
      // 실행 중일 때만 abort
      if (isRunning) {
        void abortRun()
      }
    }
  }

  // 테스트 내부용 isAnyModalOpen (DOM 감지) — useGlobalShortcuts.MODAL_SELECTORS와 동기화
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

  // ── P6 갭 보강: 누락 오버레이 존재 시 abortRun 미호출 ──────────────────────

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

// ── Shift+Tab: onModeSwitch 콜백 배선 ────────────────────────────────────────
// Composer mode는 Composer-local state이므로 onModeSwitch → composerRef 호출 패턴이
// 필요하지만, useGlobalShortcuts 자체의 Shift+Tab 라우팅은 이미 구현됨.
// 이 테스트는 onModeSwitch 콜백이 주입되면 Shift+Tab에서 호출됨을 검증한다.

describe('useGlobalShortcuts — Shift+Tab → onModeSwitch', () => {
  it('Shift+Tab → onModeSwitch 콜백 호출', async () => {
    const { useGlobalShortcuts } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const onModeSwitch = vi.fn()
    renderHook(() => useGlobalShortcuts({ onModeSwitch }))
    await act(async () => {
      fireKeyDown('Tab', { shiftKey: true })
    })
    expect(onModeSwitch).toHaveBeenCalledOnce()
  })

  it('input 포커스 중에도 Shift+Tab → onModeSwitch 호출됨(모달 없음)', async () => {
    const { useGlobalShortcuts } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const onModeSwitch = vi.fn()
    renderHook(() => useGlobalShortcuts({ onModeSwitch }))

    const inp = document.createElement('input')
    document.body.appendChild(inp)
    inp.focus()

    await act(async () => {
      const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true })
      inp.dispatchEvent(e)
    })
    // 입력 포커스 중에도 모드 순환 동작(원본 동작)
    expect(onModeSwitch).toHaveBeenCalledOnce()
    document.body.removeChild(inp)
  })

  it('textarea 포커스 중에도 Shift+Tab → onModeSwitch 호출됨(모달 없음)', async () => {
    const { useGlobalShortcuts } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const onModeSwitch = vi.fn()
    renderHook(() => useGlobalShortcuts({ onModeSwitch }))

    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    ta.focus()

    await act(async () => {
      const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true })
      ta.dispatchEvent(e)
    })
    // textarea 포커스 중에도 모드 순환 동작(원본 동작)
    expect(onModeSwitch).toHaveBeenCalledOnce()
    document.body.removeChild(ta)
  })

  it('모달 열림(.modal-overlay) 시 Shift+Tab → onModeSwitch 미호출', async () => {
    const { useGlobalShortcuts } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
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
    const { useGlobalShortcuts } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
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
    const { useGlobalShortcuts } = await import('../../../02.Source/renderer/src/lib/useGlobalShortcuts')
    const onModeSwitch = vi.fn()
    renderHook(() => useGlobalShortcuts({ onModeSwitch }))

    await act(async () => {
      fireKeyDown('Tab', { shiftKey: true })
    })
    expect(onModeSwitch).toHaveBeenCalledOnce()
  })
})

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function fireKeyDown(key: string, extra: Partial<KeyboardEventInit> = {}): void {
  const e = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...extra })
  document.dispatchEvent(e)
}
