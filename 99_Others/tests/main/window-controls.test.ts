/**
 * window-controls.test.ts — 윈도우 컨트롤 핸들러 + 수동 drag/resize 추종 (Phase 02).
 *
 * electron 모킹으로 ipcMain.handle 핸들러를 포착해 직접 호출 검증.
 * - 모든 핸들러가 BrowserWindow.fromWebContents(event.sender)로 *요청한 창*만 조작(창 ID 인자 X).
 * - custom maximize 토글 + WINDOW_STATE broadcast.
 * - 안전망(plan-auditor 권고): dragStart 후 커서 추종 setBounds 실동작 단언.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock 팩토리는 호이스트되므로 공유 상태는 vi.hoisted로.
const h = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const state = { cursor: { x: 0, y: 0 } }
  const mockWin = {
    id: 1,
    minimize: vi.fn(),
    close: vi.fn(),
    getBounds: vi.fn(() => ({ x: 100, y: 100, width: 1200, height: 800 })),
    setBounds: vi.fn(),
    isDestroyed: vi.fn(() => false),
    webContents: { send: vi.fn() },
  }
  return { handlers, state, mockWin }
})

vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown) => h.handlers.set(ch, fn) },
  BrowserWindow: { fromWebContents: () => h.mockWin },
  screen: {
    getCursorScreenPoint: () => h.state.cursor,
    getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }),
  },
}))

import { registerWindowControls } from '../../../02.Source/main/06_window/controls'
import { IPC_CHANNELS } from '../../../02.Source/shared/ipc-contract'

const ev = { sender: {} } as never
const call = (ch: string, ...args: unknown[]): unknown => h.handlers.get(ch)!(ev, ...args)

// custom-maximize 상태는 창 id로 키잉되고 모듈 스코프라 테스트 간 누수 → 테스트마다 새 id로 격리.
let _idSeq = 1

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  h.state.cursor = { x: 0, y: 0 }
  h.mockWin.id = ++_idSeq
  h.mockWin.getBounds.mockReturnValue({ x: 100, y: 100, width: 1200, height: 800 })
  registerWindowControls()
})

describe('윈도우 컨트롤 핸들러 (sender 자기창 한정)', () => {
  it('minimize/close가 요청한 창에 위임된다', () => {
    call(IPC_CHANNELS.WINDOW_MINIMIZE)
    call(IPC_CHANNELS.WINDOW_CLOSE)
    expect(h.mockWin.minimize).toHaveBeenCalledOnce()
    expect(h.mockWin.close).toHaveBeenCalledOnce()
  })

  it('getBounds/setBounds가 동작한다', () => {
    expect(call(IPC_CHANNELS.WINDOW_GET_BOUNDS)).toEqual({ x: 100, y: 100, width: 1200, height: 800 })
    const b = { x: 0, y: 0, width: 1024, height: 680 }
    call(IPC_CHANNELS.WINDOW_SET_BOUNDS, b)
    expect(h.mockWin.setBounds).toHaveBeenCalledWith(b)
  })

  it('custom maximize 토글: workArea로 setBounds + {maximized:true} + WINDOW_STATE broadcast', () => {
    const r1 = call(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE)
    expect(r1).toEqual({ maximized: true })
    expect(h.mockWin.setBounds).toHaveBeenCalledWith({ x: 0, y: 0, width: 1920, height: 1040 })
    expect(h.mockWin.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.WINDOW_STATE, { maximized: true })
    expect(call(IPC_CHANNELS.WINDOW_IS_MAXIMIZED)).toEqual({ maximized: true })
  })

  it('custom maximize 복원: 직전 bounds로 setBounds + {maximized:false}', () => {
    call(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE) // maximize (restoreBounds=100,100,1200,800)
    h.mockWin.setBounds.mockClear()
    const r2 = call(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE) // restore
    expect(r2).toEqual({ maximized: false })
    expect(h.mockWin.setBounds).toHaveBeenCalledWith({ x: 100, y: 100, width: 1200, height: 800 })
    expect(h.mockWin.webContents.send).toHaveBeenLastCalledWith(IPC_CHANNELS.WINDOW_STATE, { maximized: false })
  })

  it('최대화 상태에서 dragStart/setBounds 시 stale 플래그가 해제된다 (reviewer #2)', () => {
    call(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE) // maximize → maximized:true
    expect(call(IPC_CHANNELS.WINDOW_IS_MAXIMIZED)).toEqual({ maximized: true })
    call(IPC_CHANNELS.WINDOW_DRAG_START) // 창 이동 시작 → 더 이상 최대화 아님
    expect(call(IPC_CHANNELS.WINDOW_IS_MAXIMIZED)).toEqual({ maximized: false })
    expect(h.mockWin.webContents.send).toHaveBeenLastCalledWith(IPC_CHANNELS.WINDOW_STATE, { maximized: false })
    call(IPC_CHANNELS.WINDOW_DRAG_END)
  })
})

describe('수동 drag/resize 추종 (안전망)', () => {
  beforeEach(() => vi.useFakeTimers())

  it('dragStart 후 커서 이동 시 setBounds가 추종 좌표로 호출, dragEnd 후 정지', () => {
    h.state.cursor = { x: 500, y: 300 } // grab 시점
    call(IPC_CHANNELS.WINDOW_DRAG_START)
    expect(h.mockWin.setBounds).not.toHaveBeenCalled() // start 즉시엔 미호출

    h.state.cursor = { x: 540, y: 330 } // 커서 +40,+30
    vi.advanceTimersByTime(16)
    expect(h.mockWin.setBounds).toHaveBeenLastCalledWith({ x: 140, y: 130, width: 1200, height: 800 })

    call(IPC_CHANNELS.WINDOW_DRAG_END)
    h.mockWin.setBounds.mockClear()
    h.state.cursor = { x: 700, y: 700 }
    vi.advanceTimersByTime(64)
    expect(h.mockWin.setBounds).not.toHaveBeenCalled() // 정지 확인
  })

  it('resizeStart(e) 후 커서 이동 시 너비가 추종 확장', () => {
    h.state.cursor = { x: 1300, y: 400 }
    call(IPC_CHANNELS.WINDOW_RESIZE_START, { edge: 'e' })
    h.state.cursor = { x: 1400, y: 400 } // +100
    vi.advanceTimersByTime(16)
    expect(h.mockWin.setBounds).toHaveBeenLastCalledWith({ x: 100, y: 100, width: 1300, height: 800 })
    call(IPC_CHANNELS.WINDOW_RESIZE_END)
  })
})

// 투명창 + fractional DPI(125/150%)에서 setBounds(W) 후 getBounds()가 W+1로 읽히는
// 인플레이션을 시뮬레이션 → 의도 크기(logicalSize) steering이 snowball(보이는 카드 ≠
// 실제 창 크기, 제스처마다 ~1px 성장)을 막는지 검증. 실 e2e는 테스트 머신 100% DPI라
// 재현 불가 → 단위에서 인플레이션을 주입해 결정론적으로 가드.
describe('fractional DPI snowball 가드 (의도 크기 steering)', () => {
  // setBounds 값을 기록하고, getBounds()는 마지막 set + 1px(인플레이션)로 응답.
  function installDpiInflation(): { last: () => { width: number; height: number } } {
    let lastSet = { x: 100, y: 100, width: 1200, height: 800 }
    h.mockWin.setBounds.mockImplementation((b: { x: number; y: number; width: number; height: number }) => {
      lastSet = { ...b }
    })
    h.mockWin.getBounds.mockImplementation(() => ({
      x: lastSet.x,
      y: lastSet.y,
      width: lastSet.width + 1, // ← 분수 DPI 인플레이션
      height: lastSet.height + 1,
    }))
    return { last: () => ({ width: lastSet.width, height: lastSet.height }) }
  }

  it('maximize↔restore를 5회 반복해도 복원 크기가 의도 크기(1200x800)로 고정', () => {
    const dpi = installDpiInflation()
    // 의도 크기를 명시 set-bounds로 고정(logicalSize=1200x800).
    call(IPC_CHANNELS.WINDOW_SET_BOUNDS, { x: 100, y: 100, width: 1200, height: 800 })
    for (let i = 0; i < 5; i++) {
      call(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE) // maximize
      call(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE) // restore
    }
    // getBounds steering이었다면 +5px 누적; logicalSize steering이라 불변.
    expect(dpi.last()).toEqual({ width: 1200, height: 800 })
  })

  it('드래그가 의도 크기를 유지한다(위치만 이동, getBounds +1 무시)', () => {
    vi.useFakeTimers()
    const dpi = installDpiInflation()
    call(IPC_CHANNELS.WINDOW_SET_BOUNDS, { x: 100, y: 100, width: 1200, height: 800 })
    h.state.cursor = { x: 500, y: 300 }
    call(IPC_CHANNELS.WINDOW_DRAG_START)
    h.state.cursor = { x: 530, y: 320 } // 커서 이동 → 위치만 추종
    vi.advanceTimersByTime(16)
    // 드래그 setBounds의 크기는 의도 크기(1200x800) — getBounds 인플레이션(1201x801) 미반영.
    expect(dpi.last()).toEqual({ width: 1200, height: 800 })
    call(IPC_CHANNELS.WINDOW_DRAG_END)
    vi.useRealTimers()
  })
})
