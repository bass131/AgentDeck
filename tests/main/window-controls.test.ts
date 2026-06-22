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

import { registerWindowControls } from '../../src/main/window/controls'
import { IPC_CHANNELS } from '../../src/shared/ipc-contract'

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
