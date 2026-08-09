import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const mockWin = {
    id: 1,
    minimize: vi.fn(),
    close: vi.fn(),
    getBounds: vi.fn(() => ({ x: 100, y: 100, width: 1200, height: 800 })),
    setBounds: vi.fn(),
    isDestroyed: vi.fn(() => false),
    webContents: { send: vi.fn() },
  }
  return { handlers, mockWin }
})

vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown) => h.handlers.set(ch, fn) },
  BrowserWindow: { fromWebContents: () => h.mockWin },
  screen: {
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }),
  },
}))

import { registerWindowControls } from '../../../02_Project/00_Source/main/06_window/controls'
import { IPC_CHANNELS } from '../../../02_Project/00_Source/shared/ipcContract'

const MIN_W = 1024
const MIN_H = 680

const ev = { sender: {} } as never
const call = (ch: string, ...args: unknown[]): unknown => h.handlers.get(ch)!(ev, ...args)

let _idSeq = 100

beforeEach(() => {
  vi.clearAllMocks()
  h.mockWin.id = ++_idSeq
  h.mockWin.getBounds.mockReturnValue({ x: 100, y: 100, width: 1200, height: 800 })
  registerWindowControls()
})

type Rect = { x: number; y: number; width: number; height: number }

function setBoundsCalls(): Rect[] {
  return h.mockWin.setBounds.mock.calls.map((c) => c[0] as Rect)
}

function expectNoUnsafeBoundsApplied(): void {
  for (const b of setBoundsCalls()) {
    expect(b).toBeTruthy()
    expect(Number.isFinite(b.x)).toBe(true)
    expect(Number.isFinite(b.y)).toBe(true)
    expect(b.width).toBeGreaterThanOrEqual(MIN_W)
    expect(b.height).toBeGreaterThanOrEqual(MIN_H)
  }
}

describe('WINDOW_SET_BOUNDS — 비유한 payload 새니타이즈 (신뢰경계 CRITICAL, C2)', () => {
  it('[RED] width 가 NaN 이면 setBounds 를 호출하지 않는다', () => {
    call(IPC_CHANNELS.WINDOW_SET_BOUNDS, { x: 0, y: 0, width: NaN, height: 800 })
    expect(h.mockWin.setBounds).not.toHaveBeenCalled()
  })

  it('[RED] x 가 Infinity 이면 setBounds 를 호출하지 않는다', () => {
    call(IPC_CHANNELS.WINDOW_SET_BOUNDS, { x: Infinity, y: 0, width: 1200, height: 800 })
    expect(h.mockWin.setBounds).not.toHaveBeenCalled()
  })

  it('[RED] height 가 -Infinity 이면 setBounds 를 호출하지 않는다', () => {
    call(IPC_CHANNELS.WINDOW_SET_BOUNDS, { x: 0, y: 0, width: 1200, height: -Infinity })
    expect(h.mockWin.setBounds).not.toHaveBeenCalled()
  })

  it('[RED] 필드가 누락된 payload 는 setBounds 를 호출하지 않는다', () => {
    call(IPC_CHANNELS.WINDOW_SET_BOUNDS, { x: 0, y: 0 })
    expect(h.mockWin.setBounds).not.toHaveBeenCalled()
  })

  it('[RED] 숫자가 아닌 타입(문자열)은 setBounds 를 호출하지 않는다', () => {
    call(IPC_CHANNELS.WINDOW_SET_BOUNDS, { x: '0', y: '0', width: '1200', height: '800' })
    expect(h.mockWin.setBounds).not.toHaveBeenCalled()
  })

  it('[RED] null/undefined payload 는 throw 없이 no-op 이다', () => {
    expect(() => call(IPC_CHANNELS.WINDOW_SET_BOUNDS, null)).not.toThrow()
    expect(() => call(IPC_CHANNELS.WINDOW_SET_BOUNDS, undefined)).not.toThrow()
    expect(h.mockWin.setBounds).not.toHaveBeenCalled()
  })
})

describe('WINDOW_SET_BOUNDS — 위험한 크기 차단 (메커니즘 비고정, C2)', () => {
  it('[RED] 음수 크기는 그대로 적용되지 않는다 (no-op 또는 MIN 클램프)', () => {
    call(IPC_CHANNELS.WINDOW_SET_BOUNDS, { x: 0, y: 0, width: -100, height: -50 })
    expectNoUnsafeBoundsApplied()
  })

  it('[RED] 0×0 은 그대로 적용되지 않는다 (no-op 또는 MIN 클램프)', () => {
    call(IPC_CHANNELS.WINDOW_SET_BOUNDS, { x: 0, y: 0, width: 0, height: 0 })
    expectNoUnsafeBoundsApplied()
  })

  it('[RED] 최소치 미만(1×1)은 그대로 적용되지 않는다 (no-op 또는 MIN 클램프)', () => {
    call(IPC_CHANNELS.WINDOW_SET_BOUNDS, { x: 10, y: 10, width: 1, height: 1 })
    expectNoUnsafeBoundsApplied()
  })
})

describe('WINDOW_SET_BOUNDS — 거부된 payload 의 부작용 차단 (C2)', () => {
  it('[RED] NaN payload 이후에도 최대화→복원 크기가 직전 정상 크기를 유지한다', () => {
    call(IPC_CHANNELS.WINDOW_SET_BOUNDS, { x: 100, y: 100, width: 1200, height: 800 })
    call(IPC_CHANNELS.WINDOW_SET_BOUNDS, { x: 0, y: 0, width: NaN, height: NaN })

    h.mockWin.setBounds.mockClear()
    call(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE)
    call(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE)

    const restored = setBoundsCalls().at(-1) as Rect
    expect(restored.width).toBe(1200)
    expect(restored.height).toBe(800)
  })
})

describe('WINDOW_SET_BOUNDS — 정상 payload 거동 보존 (C2 방어가 깨면 안 되는 것)', () => {
  it('[GREEN] 일반 bounds 는 그대로 반영된다', () => {
    const b = { x: 100, y: 100, width: 1200, height: 800 }
    call(IPC_CHANNELS.WINDOW_SET_BOUNDS, b)
    expect(h.mockWin.setBounds).toHaveBeenCalledWith(b)
  })

  it('[GREEN] 최소 크기와 정확히 같은 bounds 는 클램프 없이 그대로 반영된다', () => {
    const b = { x: 0, y: 0, width: MIN_W, height: MIN_H }
    call(IPC_CHANNELS.WINDOW_SET_BOUNDS, b)
    expect(h.mockWin.setBounds).toHaveBeenCalledWith(b)
  })

  it('[GREEN] 음수 좌표는 정상이다 — 보조 모니터(왼쪽·위쪽) 배치가 막히면 안 된다', () => {
    const b = { x: -1920, y: -200, width: 1280, height: 720 }
    call(IPC_CHANNELS.WINDOW_SET_BOUNDS, b)
    expect(h.mockWin.setBounds).toHaveBeenCalledWith(b)
  })

  it('[GREEN] 정상 bounds 는 의도 크기를 갱신한다(최대화→복원이 새 크기로 돌아온다)', () => {
    call(IPC_CHANNELS.WINDOW_SET_BOUNDS, { x: 0, y: 0, width: 1440, height: 900 })
    h.mockWin.setBounds.mockClear()
    call(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE)
    call(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE)
    const restored = setBoundsCalls().at(-1) as Rect
    expect(restored.width).toBe(1440)
    expect(restored.height).toBe(900)
  })

  it('[GREEN] 정상 bounds 는 stale custom-maximize 플래그를 해제한다', () => {
    call(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE)
    expect(call(IPC_CHANNELS.WINDOW_IS_MAXIMIZED)).toEqual({ maximized: true })
    call(IPC_CHANNELS.WINDOW_SET_BOUNDS, { x: 0, y: 0, width: 1200, height: 800 })
    expect(call(IPC_CHANNELS.WINDOW_IS_MAXIMIZED)).toEqual({ maximized: false })
  })
})
