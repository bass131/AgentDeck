/**
 * window-bounds-sanitize.test.ts — RS1 Phase 07 / C2 심층방어 TDD (red 선행)
 *
 * 무엇을 강제하는가:
 *   `WINDOW_SET_BOUNDS` 핸들러(06_window/controls.ts:177-183)는 renderer 가 보낸
 *   payload 를 검증 없이 `win.setBounds(b)` 로 넘기고 `setLogicalSize(b.width, b.height)`
 *   까지 갱신한다. renderer 는 untrusted(CORE-01)이므로 손상·조작된 payload 가
 *   창을 화면 밖·0×0 으로 날리거나, NaN 을 *의도 크기* 캐시에 심어 이후 최대화/복원까지
 *   오염시킬 수 있다.
 *
 * 기대 계약(sanitizeBounds):
 *   1) x·y·width·height 4필드가 모두 `Number.isFinite` 를 통과하지 못하면 → no-op
 *      (`win.setBounds` 미호출, `_logicalSize` 미갱신). throw 하지 않는다.
 *   2) 통과하면 최소 크기 MIN_W=1024 / MIN_H=680 로 클램프한다.
 *      (실측 출처: `02_Source/main/index.ts:23-24` createWindow minWidth/minHeight,
 *       `06_window/controls.ts:29-30` 상수와 이미 일치 — 새 값을 발명하지 않는다.)
 *   3) 위치(x·y)의 음수는 *정상*이다 — 왼쪽·위쪽 보조 모니터. 크기만 클램프한다.
 *
 * ⚠️ 유한하지만 너무 작은 크기(음수·0)의 처리는 Phase 문서 안에서 표현이 갈린다
 *    ("클램프" vs "no-op"). 두 해석 모두 위협(0×0·화면 밖)을 막으므로, 해당 케이스는
 *    메커니즘을 고정하지 않고 **안전 불변식**만 단언한다:
 *      "setBounds 가 호출되지 않았거나, 호출됐다면 width>=MIN_W && height>=MIN_H".
 *    이러면 구현자가 어느 쪽을 택해도 green 이고, 현재(무방어)는 어느 쪽으로도 red 다.
 *
 * red/green 라벨:
 *   [RED]   방어가 없는 현재 구현에서 실패해야 하는 단언.
 *   [GREEN] 지금도 통과하며 방어 추가 후에도 통과해야 하는 보존 단언.
 *
 * 결정론: electron 전면 모킹 + 고정 픽스처. 타이머·커서 추종 경로는 건드리지 않는다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock 팩토리는 호이스트되므로 공유 상태는 vi.hoisted 로. (window-controls.test.ts 관례)
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

import { registerWindowControls } from '../../../02_Source/main/06_window/controls'
import { IPC_CHANNELS } from '../../../02_Source/shared/ipcContract'

/** createWindow(02_Source/main/index.ts:23-24) 최소 크기 실측값. */
const MIN_W = 1024
const MIN_H = 680

const ev = { sender: {} } as never
const call = (ch: string, ...args: unknown[]): unknown => h.handlers.get(ch)!(ev, ...args)

// _maxState/_logicalSize 는 창 id 로 키잉된 모듈 스코프 Map → 테스트마다 새 id 로 격리.
let _idSeq = 100

beforeEach(() => {
  vi.clearAllMocks()
  h.mockWin.id = ++_idSeq
  h.mockWin.getBounds.mockReturnValue({ x: 100, y: 100, width: 1200, height: 800 })
  registerWindowControls()
})

type Rect = { x: number; y: number; width: number; height: number }

/** setBounds 로 실제 넘어간 인자들. */
function setBoundsCalls(): Rect[] {
  return h.mockWin.setBounds.mock.calls.map((c) => c[0] as Rect)
}

/**
 * 안전 불변식 — 창이 화면 밖·0×0 으로 날아갈 수 있는 bounds 가 절대 적용되지 않는다.
 * (no-op 이든 클램프든 통과. 무방어 상태에서는 실패.)
 */
function expectNoUnsafeBoundsApplied(): void {
  for (const b of setBoundsCalls()) {
    expect(b).toBeTruthy()
    expect(Number.isFinite(b.x)).toBe(true)
    expect(Number.isFinite(b.y)).toBe(true)
    expect(b.width).toBeGreaterThanOrEqual(MIN_W)
    expect(b.height).toBeGreaterThanOrEqual(MIN_H)
  }
}

// ── [RED] 비유한 payload → no-op ──────────────────────────────────────────────

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

// ── [RED] 유한하지만 위험한 크기 → 불변식만 단언(no-op 또는 클램프) ──────────

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

// ── [RED] 오염 전파 — 거부된 payload 가 의도 크기 캐시를 망가뜨리면 안 된다 ──

describe('WINDOW_SET_BOUNDS — 거부된 payload 의 부작용 차단 (C2)', () => {
  it('[RED] NaN payload 이후에도 최대화→복원 크기가 직전 정상 크기를 유지한다', () => {
    // 정상 bounds 로 의도 크기(logicalSize) 를 1200x800 으로 고정.
    call(IPC_CHANNELS.WINDOW_SET_BOUNDS, { x: 100, y: 100, width: 1200, height: 800 })
    // 손상 payload — 무시되어야 하며 의도 크기를 오염시키면 안 된다.
    call(IPC_CHANNELS.WINDOW_SET_BOUNDS, { x: 0, y: 0, width: NaN, height: NaN })

    h.mockWin.setBounds.mockClear()
    call(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE) // maximize (restoreBounds = 의도 크기)
    call(IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE) // restore

    const restored = setBoundsCalls().at(-1) as Rect
    expect(restored.width).toBe(1200)
    expect(restored.height).toBe(800)
  })
})

// ── [GREEN] 정상 payload 보존 ─────────────────────────────────────────────────

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
