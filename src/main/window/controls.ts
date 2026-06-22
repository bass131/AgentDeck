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
  _follow = setInterval(() => {
    if (win.isDestroyed()) {
      stopFollow()
      return
    }
    win.setBounds(next(screen.getCursorScreenPoint()))
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
    if (st.restoreBounds) win.setBounds(st.restoreBounds)
    _maxState.set(win.id, { maximized: false })
    broadcastState(win, false)
    return { maximized: false }
  }
  const restoreBounds = win.getBounds()
  const area = screen.getDisplayMatching(restoreBounds).workArea
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
    clearMaximizedFlag(win)
    win?.setBounds(b)
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_DRAG_START, (e: IpcMainInvokeEvent): void => {
    const win = winFrom(e)
    if (!win) return
    clearMaximizedFlag(win)
    const startBounds = win.getBounds()
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
      const startBounds = win.getBounds()
      const startCursor = screen.getCursorScreenPoint()
      startFollow(win, (cur) =>
        computeResizeBounds(startBounds, req.edge, startCursor, cur, MIN_W, MIN_H)
      )
    }
  )

  ipcMain.handle(IPC_CHANNELS.WINDOW_RESIZE_END, (): void => stopFollow())
}
