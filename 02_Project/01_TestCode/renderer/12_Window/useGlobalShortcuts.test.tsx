// @vitest-environment jsdom
// 모달 판정은 CSS 클래스 목록이 아니라 열린 모달이 오르는 층(02_Common/modalStack)이다.
// Esc는 맨 위 모달 하나만 받는다. 권한 카드·최소화 알약·선택 막대는 층에 오르되(Shell 중단·Shift+Tab을 막는다) 맨 위가 되지 않는다.
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, renderHook, act, cleanup } from '@testing-library/react'
import { Modal } from '@renderer/02_Common/Modal'
import { FullscreenOverlay } from '@renderer/02_Common/FullscreenOverlay'
import { isAnyModalOpen, pushModalLayer, useModalLayer } from '@renderer/02_Common/modalStack'

const closers: Array<() => void> = []
const layer = (o?: Parameters<typeof pushModalLayer>[0]): void => { closers.push(pushModalLayer(o)) }

afterEach(() => {
  cleanup()
  for (const c of closers.splice(0)) c()
  document.querySelectorAll('.modal-overlay, .q-overlay, .fs-overlay').forEach((el) => el.remove())
})

describe('모달 층 — 열린 모달을 한 곳이 안다 (M11 G4 22)', () => {
  it('[M11-G4 22] 층이 없으면 false, 오르면 true, 내리면 false', () => {
    expect(isAnyModalOpen()).toBe(false)
    const close = pushModalLayer()
    expect(isAnyModalOpen()).toBe(true)
    close()
    expect(isAnyModalOpen()).toBe(false)
  })

  it('[M11-G4 22] 클래스 이름만 같은 요소는 모달로 세지 않는다(클래스 목록 판정을 지웠다)', () => {
    const el = document.createElement('div')
    el.className = 'modal-overlay'
    document.body.appendChild(el)
    expect(isAnyModalOpen()).toBe(false)
  })

  it('[M11-G4 22] 곁 층(권한 카드·알약)도 모달이 열린 것으로 센다', () => {
    layer({ kind: 'aside' })
    expect(isAnyModalOpen()).toBe(true)
  })

  it('[M11-G4 22] Esc는 맨 위 모달 하나만 닫는다 — 겹친 두 Modal에서 한 번에 둘이 닫히지 않는다', () => {
    const under = vi.fn()
    const over = vi.fn()
    render(<><Modal title="아래" onClose={under}>a</Modal><Modal title="위" onClose={over}>b</Modal></>)
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(over).toHaveBeenCalledTimes(1)
    expect(under).not.toHaveBeenCalled()
  })

  it('[M11-G4 22] Esc 처리가 없는 맨 위 모달(기동 관문)이 있으면 아래 모달도 닫히지 않는다', () => {
    const under = vi.fn()
    layer({ onEscape: under })
    layer()
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(under).not.toHaveBeenCalled()
  })

  it('[M11-G4 22] 곁 층은 맨 위가 되지 않는다 — 권한 카드가 떠 있어도 설정 창은 Esc로 닫힌다', () => {
    const settings = vi.fn()
    layer({ onEscape: settings })
    layer({ kind: 'aside' })
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(settings).toHaveBeenCalledTimes(1)
  })

  it('[M11-G4 22] 곁 층끼리도 순서가 있다 — Esc 처리가 있는 곁 층 둘이면 나중에 오른 하나만 받는다', () => {
    const older = vi.fn()
    const newer = vi.fn()
    layer({ kind: 'aside', onEscape: older })
    layer({ kind: 'aside', onEscape: newer })
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect([older.mock.calls.length, newer.mock.calls.length]).toEqual([0, 1])
  })

  it('[M11-G4 22] 모달이 열려 있으면 곁 층은 Esc를 받지 않는다(모달이 먼저다)', () => {
    const pill = vi.fn()
    const settings = vi.fn()
    layer({ onEscape: settings })
    layer({ kind: 'aside', onEscape: pill })
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect([settings.mock.calls.length, pill.mock.calls.length]).toEqual([1, 0])
  })

  it('[M11-G4 22] 판정은 키 한 번마다 처음 본 층으로 한다 — 앞 처리기가 층을 내려도 뒤 처리기는 열린 것으로 본다', () => {
    const close = pushModalLayer({ kind: 'aside' })
    const seen: boolean[] = []
    const first = (): void => close()
    const second = (e: KeyboardEvent): void => { seen.push(isAnyModalOpen(e)) }
    document.addEventListener('keydown', first)
    document.addEventListener('keydown', second)
    try {
      act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    } finally {
      document.removeEventListener('keydown', first)
      document.removeEventListener('keydown', second)
    }
    expect(seen).toEqual([true])
    expect(isAnyModalOpen()).toBe(false)
  })

  it('[M11-G4 22] 전체 화면 보기(FullscreenOverlay)도 층에 오른다 — 실행 중 Esc가 Shell의 중단으로 새지 않는다', () => {
    const onClose = vi.fn()
    const { unmount } = render(<FullscreenOverlay onClose={onClose}>x</FullscreenOverlay>)
    expect(isAnyModalOpen()).toBe(true)
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
    expect(isAnyModalOpen()).toBe(false)
  })

  it('[M11-G4 22] 훅은 active가 거짓이면 층에 오르지 않는다', () => {
    const { rerender, unmount } = renderHook(({ on }) => useModalLayer(on), { initialProps: { on: false } })
    expect(isAnyModalOpen()).toBe(false)
    rerender({ on: true })
    expect(isAnyModalOpen()).toBe(true)
    unmount()
    expect(isAnyModalOpen()).toBe(false)
  })
})

describe('Shell의 Esc 배선 (M11 G4 24)', () => {
  it('[M11-G4 24] Shell은 Esc를 shellEscape로 넘기고, 중단 판정을 따로 다시 쓰지 않는다', () => {
    const src = readFileSync(resolve(__dirname, '../../../00_Source/renderer/src/12_Window/Shell.tsx'), 'utf8')
    expect(src).toMatch(/onEscape: \(e\) => shellEscape\(e, \{/)
    expect(src).not.toMatch(/decideStopAction\(/)
    expect(src).not.toMatch(/isAnyModalOpen\(/)
  })

  it('[M11-G4 23] Shell에는 열리는 길이 없던 앱 업데이트 창의 상태와 그리기가 없다(컴포넌트는 10_Engine에 남는다)', () => {
    const src = readFileSync(resolve(__dirname, '../../../00_Source/renderer/src/12_Window/Shell.tsx'), 'utf8')
    expect(src).not.toMatch(/appUpdateOpen|AppUpdateGate/)
  })

  // 손으로 적은 목록은 다음 누락을 못 잡는다. 화면 덮개(*-overlay)를 그리는 파일을 모두 모은다.
  // 덮개의 Esc는 층이 준다 — 'Escape'를 직접 보는 줄은 층에 넘기려고 손을 떼는 줄(… 'Escape') return)뿐이어야 한다.
  // 예외 하나: 사이드바의 오른쪽 클릭 메뉴는 덮개가 아닌 떠 있는 메뉴라 제 Esc로 닫는다
  it('[M11-G4 22] 화면 덮개(*-overlay)를 그리는 renderer 파일은 모두 useModalLayer로 층에 오르고, 제 Esc 처리기를 따로 두지 않는다', () => {
    const SRC = resolve(__dirname, '../../../00_Source/renderer/src')
    const files = (readdirSync(SRC, { recursive: true }) as string[]).filter((f) => f.endsWith('.tsx'))
    const overlay = /className=[{"'`][^>\n]*?\b[a-z0-9]+(?:-[a-z0-9]+)*-overlay\b/
    const drawers = files.filter((f) => overlay.test(readFileSync(resolve(SRC, f), 'utf8')))
    expect(drawers.length).toBeGreaterThanOrEqual(15)
    const missing = drawers.filter((f) => !/useModalLayer\(/.test(readFileSync(resolve(SRC, f), 'utf8')))
    expect(missing).toEqual([])
    const ownEsc = drawers.flatMap((f) => readFileSync(resolve(SRC, f), 'utf8').split('\n')
      .filter((l) => l.includes("'Escape'") && !/'Escape'\) return\b/.test(l) && !/setMenu\(null\)/.test(l))
      .map((l) => `${f}: ${l.trim()}`))
    expect(ownEsc).toEqual([])
  })

  it('[M11-G4 22] 내려둔 알약(질문·Ask)은 곁 층의 Esc 처리로 닫힌다 — 제 창 Esc 처리기를 따로 두지 않는다', () => {
    const SRC = resolve(__dirname, '../../../00_Source/renderer/src/03_Agent/prompt')
    for (const f of ['AskModal.tsx', 'QuestionModal.tsx']) {
      const src = readFileSync(resolve(SRC, f), 'utf8')
      expect({ f, layer: /useModalLayer\(minimized, (?!undefined)/.test(src), ownEsc: /isBlockingModalOpen\(e\)/.test(src) }).toEqual({ f, layer: true, ownEsc: false })
    }
  })

  it('[M11-G4 22] 사이드바 이름 변경·삭제 창은 제 Esc 처리기 없이 모달 층으로 닫힌다', () => {
    const src = readFileSync(resolve(__dirname, '../../../00_Source/renderer/src/12_Window/Sidebar.tsx'), 'utf8')
    expect(src).toMatch(/useModalLayer\(dialog !== null, /)
    expect(src).not.toMatch(/if \(e\.key === 'Escape'\) setDialog\(null\)/)
  })

  it('[M11-G4 22] Shell의 프로필 창(pf-overlay)도 모달 층에 오른다', () => {
    const src = readFileSync(resolve(__dirname, '../../../00_Source/renderer/src/12_Window/Shell.tsx'), 'utf8')
    expect(src).toMatch(/useModalLayer\(profileOpen\)/)
  })
})

describe('useGlobalShortcuts — Ctrl+N → onNewChat 배선', () => {
  it('Ctrl+N → onNewChat 콜백 호출(입력 미포커스)', async () => {
    const { useGlobalShortcuts } = await import('@renderer/12_Window/useGlobalShortcuts')
    const onNewChat = vi.fn()
    renderHook(() => useGlobalShortcuts({ onNewChat }))
    await act(async () => {
      fireKeyDown('n', { ctrlKey: true })
    })
    expect(onNewChat).toHaveBeenCalledOnce()
  })

  it('input 포커스 시 Ctrl+N → onNewChat 미호출', async () => {
    const { useGlobalShortcuts } = await import('@renderer/12_Window/useGlobalShortcuts')
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
    const { useGlobalShortcuts } = await import('@renderer/12_Window/useGlobalShortcuts')
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
    const { useGlobalShortcuts } = await import('@renderer/12_Window/useGlobalShortcuts')
    const onOpenFolder = vi.fn()
    renderHook(() => useGlobalShortcuts({ onOpenFolder }))
    await act(async () => {
      fireKeyDown('o', { ctrlKey: true })
    })
    expect(onOpenFolder).toHaveBeenCalledOnce()
  })

  it('input 포커스 시 Ctrl+O → onOpenFolder 미호출', async () => {
    const { useGlobalShortcuts } = await import('@renderer/12_Window/useGlobalShortcuts')
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

describe('useGlobalShortcuts — Esc onEscape 콜백', () => {
  it('Esc → onEscape 콜백 호출(키 사건을 함께 넘긴다)', async () => {
    const { useGlobalShortcuts } = await import('@renderer/12_Window/useGlobalShortcuts')
    const onEscape = vi.fn()
    renderHook(() => useGlobalShortcuts({ onEscape }))
    await act(async () => {
      fireKeyDown('Escape')
    })
    expect(onEscape).toHaveBeenCalledOnce()
    expect(onEscape.mock.calls[0][0]).toBeInstanceOf(KeyboardEvent)
  })

  it('Esc → preventDefault 미호출(모달 체인 우선 보장)', async () => {
    const { useGlobalShortcuts } = await import('@renderer/12_Window/useGlobalShortcuts')
    renderHook(() => useGlobalShortcuts({}))
    const e = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true })
    document.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
  })
})

describe('useGlobalShortcuts — 바꿀 모드가 없으면 Shift+Tab 기본 동작을 살린다 (M10 G1 검수 사소 5)', () => {
  it('onModeSwitch가 없으면(작업 모드) Shift+Tab의 preventDefault를 부르지 않는다', async () => {
    const { useGlobalShortcuts } = await import('@renderer/12_Window/useGlobalShortcuts')
    renderHook(() => useGlobalShortcuts({ onModeSwitch: undefined }))
    const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true })
    await act(async () => {
      document.dispatchEvent(e)
    })
    expect(e.defaultPrevented).toBe(false)
  })

  it('onModeSwitch가 있으면(채팅 모드) Shift+Tab을 가로챈다', async () => {
    const { useGlobalShortcuts } = await import('@renderer/12_Window/useGlobalShortcuts')
    const onModeSwitch = vi.fn()
    renderHook(() => useGlobalShortcuts({ onModeSwitch }))
    const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true })
    await act(async () => {
      document.dispatchEvent(e)
    })
    expect(e.defaultPrevented).toBe(true)
    expect(onModeSwitch).toHaveBeenCalledOnce()
  })
})

describe('useGlobalShortcuts — Shift+Tab → onModeSwitch', () => {
  it('Shift+Tab → onModeSwitch 콜백 호출', async () => {
    const { useGlobalShortcuts } = await import('@renderer/12_Window/useGlobalShortcuts')
    const onModeSwitch = vi.fn()
    renderHook(() => useGlobalShortcuts({ onModeSwitch }))
    await act(async () => {
      fireKeyDown('Tab', { shiftKey: true })
    })
    expect(onModeSwitch).toHaveBeenCalledOnce()
  })

  it('input 포커스 중에도 Shift+Tab → onModeSwitch 호출됨(모달 없음)', async () => {
    const { useGlobalShortcuts } = await import('@renderer/12_Window/useGlobalShortcuts')
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
    const { useGlobalShortcuts } = await import('@renderer/12_Window/useGlobalShortcuts')
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

  it('[M11-G4 22] 모달 층이 있으면 Shift+Tab → onModeSwitch 미호출', async () => {
    const { useGlobalShortcuts } = await import('@renderer/12_Window/useGlobalShortcuts')
    const onModeSwitch = vi.fn()
    renderHook(() => useGlobalShortcuts({ onModeSwitch }))
    layer()
    await act(async () => {
      fireKeyDown('Tab', { shiftKey: true })
    })
    expect(onModeSwitch).not.toHaveBeenCalled()
  })

  it('[M11-G4 22] 곁 층(질문 알약)만 있어도 Shift+Tab → onModeSwitch 미호출', async () => {
    const { useGlobalShortcuts } = await import('@renderer/12_Window/useGlobalShortcuts')
    const onModeSwitch = vi.fn()
    renderHook(() => useGlobalShortcuts({ onModeSwitch }))
    layer({ kind: 'aside' })
    await act(async () => {
      fireKeyDown('Tab', { shiftKey: true })
    })
    expect(onModeSwitch).not.toHaveBeenCalled()
  })

  it('모달 없음·input 미포커스 시 Shift+Tab → onModeSwitch 호출됨(기존 동작)', async () => {
    const { useGlobalShortcuts } = await import('@renderer/12_Window/useGlobalShortcuts')
    const onModeSwitch = vi.fn()
    renderHook(() => useGlobalShortcuts({ onModeSwitch }))

    await act(async () => {
      fireKeyDown('Tab', { shiftKey: true })
    })
    expect(onModeSwitch).toHaveBeenCalledOnce()
  })
})

describe('useGlobalShortcuts — 백쿼트 사이드바 토글', () => {
  it('백쿼트(`) 키 → toggleSidebar 콜백 호출', async () => {
    const { useGlobalShortcuts } = await import('@renderer/12_Window/useGlobalShortcuts')
    const toggleSidebar = vi.fn()
    renderHook(() => useGlobalShortcuts({ toggleSidebar }))
    await act(async () => {
      fireKeyDown('`')
    })
    expect(toggleSidebar).toHaveBeenCalledOnce()
  })
})

describe('useGlobalShortcuts — 입력 포커스 시 텍스트 단축키 무시', () => {
  it('textarea 포커스 시 백쿼트 → toggleSidebar 무시', async () => {
    const { useGlobalShortcuts } = await import('@renderer/12_Window/useGlobalShortcuts')
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
    const { useGlobalShortcuts } = await import('@renderer/12_Window/useGlobalShortcuts')
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
    const { useGlobalShortcuts } = await import('@renderer/12_Window/useGlobalShortcuts')
    const onNewChat = vi.fn()
    renderHook(() => useGlobalShortcuts({ onNewChat }))
    await act(async () => {
      fireKeyDown('n', { ctrlKey: true })
    })
    expect(onNewChat).toHaveBeenCalledOnce()
  })

  it('콜백 미주입 시 no-op(오류 없음)', async () => {
    const { useGlobalShortcuts } = await import('@renderer/12_Window/useGlobalShortcuts')
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
