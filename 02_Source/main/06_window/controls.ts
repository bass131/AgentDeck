/**
 * controls.ts — 윈도우 컨트롤 IPC 핸들러 (얇은 electron 레이어, F1-b Phase 02).
 *
 * 투명 frameless 창의 min/custom-maximize/close + 수동 drag/resize + bounds.
 *
 * CRITICAL (헌법 신뢰경계):
 *   - 각 핸들러는 BrowserWindow.fromWebContents(event.sender)로 *요청한 창*만
 *     조작한다. renderer가 창 ID/핸들을 주입할 수 없다(계약에 창 식별자 필드 없음).
 *     (원본 AgentCodeGUI는 전역 win 참조 사용 — 우리는 sender 한정으로 강화.)
 *   - drag/resize는 start/end 브래킷만 renderer가 트리거하고, 커서 추종 setBounds는
 *     main이 screen.getCursorScreenPoint() 폴링으로 수행(mousemove IPC 없음 → 지연·권한 최소).
 *
 * 좌표 계산은 순수 모듈 geometry.ts에 위임(단위 테스트됨).
 */

import { ipcMain, BrowserWindow, screen } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-contract'
import type {
  WindowBounds,
  WindowMaximizedResponse,
  WindowResizeStartRequest,
  WindowStatePayload,
} from '../../shared/ipc-contract'
import { computeDragBounds, computeResizeBounds, computeSnapZone, snapBounds } from './geometry'
import type { Bounds } from './geometry'

// createWindow의 minWidth/minHeight와 일치(수동 resize 클램프 기준).
const MIN_W = 1024
const MIN_H = 680
// 커서 추종 폴링 주기(ms) — 60fps 근사.
const FOLLOW_MS = 16

/** 창별 custom-maximize 상태(투명창은 OS 네이티브 maximize 부재). */
interface MaxState {
  maximized: boolean
  restoreBounds?: Bounds
}
const _maxState = new Map<number, MaxState>()

/**
 * 창이 *의도하는* 크기(width/height) — 창별.
 *
 * CRITICAL(투명창 + fractional DPI): `setBounds(W)` 후 `getBounds()`가 `W+1`로
 * 읽히는 경우가 있어, 매 제스처마다 getBounds()로 시작 크기를 다시 읽으면
 * 드래그/최대화-복원 사이클마다 창이 ~1px씩 눈덩이로 커진다(보이는 카드 ≠ 실제 창).
 * 의도 크기로 steering하면 실제 크기가 안정 — 절대 누적되지 않는다.
 * (원본 AgentCodeGUI main/index.ts `logicalSize` 미러.) 의도적 크기변경
 * (resize·set-bounds·snap·restore)에서만 갱신.
 */
const _logicalSize = new Map<number, { width: number; height: number }>()

/** 의도 크기 조회(미설정 시 현재 getBounds()로 lazy 초기화). */
function logicalSizeOf(win: BrowserWindow): { width: number; height: number } {
  let s = _logicalSize.get(win.id)
  if (!s) {
    const b = win.getBounds()
    s = { width: b.width, height: b.height }
    _logicalSize.set(win.id, s)
  }
  return s
}

/** 의도 크기 갱신(실제 크기변경 시에만 호출). */
function setLogicalSize(win: BrowserWindow, width: number, height: number): void {
  _logicalSize.set(win.id, { width, height })
}

/** 현재 활성 drag/resize 추종 타이머(동시 1개). */
let _follow: ReturnType<typeof setInterval> | null = null

function winFrom(e: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender)
}

function stopFollow(): void {
  if (_follow) {
    clearInterval(_follow)
    _follow = null
  }
}

/** 커서 추종 시작 — next(cursor)가 매 틱 setBounds 할 bounds를 계산. */
function startFollow(win: BrowserWindow, next: (cur: { x: number; y: number }) => Bounds): void {
  stopFollow()
  // 직전 적용 bounds — 변화 없으면 setBounds 생략. 정지 중 매 틱 setBounds는
  // 투명창 fractional DPI에서 크기를 재반올림해 인플레이션을 부르므로(원본 주석) 차단.
  let last = ''
  _follow = setInterval(() => {
    if (win.isDestroyed()) {
      stopFollow()
      return
    }
    const b = next(screen.getCursorScreenPoint())
    const key = `${b.x},${b.y},${b.width},${b.height}`
    if (key === last) return
    last = key
    win.setBounds(b)
  }, FOLLOW_MS)
}

function broadcastState(win: BrowserWindow, maximized: boolean): void {
  const payload: WindowStatePayload = { maximized }
  win.webContents.send(IPC_CHANNELS.WINDOW_STATE, payload)
}

function isMaximized(win: BrowserWindow | null): boolean {
  return win ? Boolean(_maxState.get(win.id)?.maximized) : false
}

/**
 * 수동 이동/리사이즈/직접 setBounds 시작 시 stale custom-maximize 플래그 해제.
 * 최대화 상태에서 창을 움직이면 더 이상 "최대화"가 아니므로 상태를 false로 맞춘다
 * (다음 토글이 stale restoreBounds로 복원하거나 상태/UI 불일치를 내는 것 방지).
 */
function clearMaximizedFlag(win: BrowserWindow | null): void {
  if (win && _maxState.get(win.id)?.maximized) {
    _maxState.set(win.id, { maximized: false })
    broadcastState(win, false)
  }
}

/** custom maximize 토글 — workArea로 setBounds ↔ 직전 bounds 복원. */
function toggleMaximize(win: BrowserWindow | null): WindowMaximizedResponse {
  if (!win) return { maximized: false }
  const st = _maxState.get(win.id) ?? { maximized: false }
  if (st.maximized) {
    if (st.restoreBounds) {
      win.setBounds(st.restoreBounds)
      // 복원 = 의도 크기 갱신(다음 제스처 기준이 깨끗하게).
      setLogicalSize(win, st.restoreBounds.width, st.restoreBounds.height)
    }
    _maxState.set(win.id, { maximized: false })
    broadcastState(win, false)
    return { maximized: false }
  }
  // restoreBounds 크기는 인플레이션된 getBounds()가 아닌 *의도 크기*로 — 최대화↔복원
  // 왕복이 창을 키우지 않게.
  const b = win.getBounds()
  const size = logicalSizeOf(win)
  const restoreBounds: Bounds = { x: b.x, y: b.y, width: size.width, height: size.height }
  const area = screen.getDisplayMatching(b).workArea
  win.setBounds(area)
  _maxState.set(win.id, { maximized: true, restoreBounds })
  broadcastState(win, true)
  return { maximized: true }
}

/**
 * 윈도우 컨트롤 핸들러 1회 등록. registerIpc(_registered 가드) 안에서 호출.
 * 핸들러는 sender로 창을 해석하므로 특정 win 참조를 받지 않는다.
 */
export function registerWindowControls(): void {
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, (e: IpcMainInvokeEvent): void => {
    winFrom(e)?.minimize()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, (e: IpcMainInvokeEvent): void => {
    winFrom(e)?.close()
  })

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE,
    (e: IpcMainInvokeEvent): WindowMaximizedResponse => toggleMaximize(winFrom(e))
  )

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_IS_MAXIMIZED,
    (e: IpcMainInvokeEvent): WindowMaximizedResponse => ({ maximized: isMaximized(winFrom(e)) })
  )

  ipcMain.handle(IPC_CHANNELS.WINDOW_GET_BOUNDS, (e: IpcMainInvokeEvent): WindowBounds => {
    const b = winFrom(e)?.getBounds()
    return b ? { x: b.x, y: b.y, width: b.width, height: b.height } : { x: 0, y: 0, width: 0, height: 0 }
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_SET_BOUNDS, (e: IpcMainInvokeEvent, b: WindowBounds): void => {
    const win = winFrom(e)
    if (!win) return
    clearMaximizedFlag(win)
    win.setBounds(b)
    setLogicalSize(win, b.width, b.height) // 명시적 크기변경 → 의도 크기 갱신
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_DRAG_START, (e: IpcMainInvokeEvent): void => {
    const win = winFrom(e)
    if (!win) return
    clearMaximizedFlag(win)
    // 드래그는 크기 불변 — 시작 bounds의 width/height를 *의도 크기*로 고정(getBounds()
    // 인플레이션 차단). 위치만 커서를 추종한다.
    const b0 = win.getBounds()
    const size = logicalSizeOf(win)
    const startBounds: Bounds = { x: b0.x, y: b0.y, width: size.width, height: size.height }
    const startCursor = screen.getCursorScreenPoint()
    startFollow(win, (cur) => computeDragBounds(startBounds, startCursor, cur))
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_DRAG_END, (e: IpcMainInvokeEvent): void => {
    // stopFollow() 먼저 — 커서 추종 폴링을 중단해야 setBounds가 덮이지 않는다.
    stopFollow()

    // F14-03: 릴리스 시점 커서가 스냅 존에 있으면 snapBounds 적용.
    // 새 IPC 채널 0 — 기존 WINDOW_DRAG_END 핸들러 내부 확장만.
    // 고스트 프리뷰는 REPLICA_GAP 잔여(자식 BrowserWindow 도입 보류).
    const win = winFrom(e)
    if (!win) return
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayMatching(win.getBounds())
    const zone = computeSnapZone(cursor, display.workArea)
    if (zone !== null) {
      const b = snapBounds(zone, display.workArea)
      win.setBounds(b)
      setLogicalSize(win, b.width, b.height) // 스냅 = 의도 크기 갱신
      // maximize 존이면 custom-maximize 상태도 동기화
      if (zone === 'maximize') {
        _maxState.set(win.id, { maximized: true, restoreBounds: undefined })
        broadcastState(win, true)
      } else {
        // 스냅으로 창이 바뀌면 custom-maximize 플래그 해제
        if (_maxState.get(win.id)?.maximized) {
          _maxState.set(win.id, { maximized: false })
          broadcastState(win, false)
        }
      }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_RESIZE_START,
    (e: IpcMainInvokeEvent, req: WindowResizeStartRequest): void => {
      const win = winFrom(e)
      if (!win || !req?.edge) return
      clearMaximizedFlag(win)
      // 시작 크기를 *의도 크기*로 고정(getBounds() 인플레이션 차단). 위치는 현재값.
      const b0 = win.getBounds()
      const size = logicalSizeOf(win)
      const startBounds: Bounds = { x: b0.x, y: b0.y, width: size.width, height: size.height }
      const startCursor = screen.getCursorScreenPoint()
      startFollow(win, (cur) => {
        const b = computeResizeBounds(startBounds, req.edge, startCursor, cur, MIN_W, MIN_H)
        setLogicalSize(win, b.width, b.height) // 리사이즈 = 의도 크기 갱신
        return b
      })
    }
  )

  ipcMain.handle(IPC_CHANNELS.WINDOW_RESIZE_END, (): void => stopFollow())
}
