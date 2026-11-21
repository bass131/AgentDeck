import { BrowserWindow, screen } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { IPC_CHANNELS, sendPush } from '../../shared/ipcContract'
import type {
  ResizeEdge,
  WindowMaximizedResponse,
  WindowStatePayload,
} from '../../shared/ipcContract'
import { computeDragBounds, computeResizeBounds, computeSnapZone, snapBounds } from './geometry'
import type { Bounds } from './geometry'

const MIN_W = 1024
const MIN_H = 680
const FOLLOW_MS = 16

interface MaxState {
  maximized: boolean
  restoreBounds?: Bounds
}
const _maxState = new Map<number, MaxState>()

const _logicalSize = new Map<number, { width: number; height: number }>()

function logicalSizeOf(win: BrowserWindow): { width: number; height: number } {
  let s = _logicalSize.get(win.id)
  if (!s) {
    const b = win.getBounds()
    s = { width: b.width, height: b.height }
    _logicalSize.set(win.id, s)
  }
  return s
}

function setLogicalSize(win: BrowserWindow, width: number, height: number): void {
  _logicalSize.set(win.id, { width, height })
}

let _follow: ReturnType<typeof setInterval> | null = null

export function windowFromEvent(e: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender)
}

export function stopFollow(): void {
  if (_follow) {
    clearInterval(_follow)
    _follow = null
  }
}

function startFollow(win: BrowserWindow, next: (cur: { x: number; y: number }) => Bounds): void {
  stopFollow()
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
  sendPush(win.webContents, IPC_CHANNELS.WINDOW_STATE, payload)
}

export function isMaximized(win: BrowserWindow | null): boolean {
  return win ? Boolean(_maxState.get(win.id)?.maximized) : false
}

function clearMaximizedFlag(win: BrowserWindow | null): void {
  if (win && _maxState.get(win.id)?.maximized) {
    _maxState.set(win.id, { maximized: false })
    broadcastState(win, false)
  }
}

export function toggleMaximize(win: BrowserWindow | null): WindowMaximizedResponse {
  if (!win) return { maximized: false }
  const st = _maxState.get(win.id) ?? { maximized: false }
  if (st.maximized) {
    if (st.restoreBounds) {
      win.setBounds(st.restoreBounds)
      setLogicalSize(win, st.restoreBounds.width, st.restoreBounds.height)
    }
    _maxState.set(win.id, { maximized: false })
    broadcastState(win, false)
    return { maximized: false }
  }
  const b = win.getBounds()
  const size = logicalSizeOf(win)
  const restoreBounds: Bounds = { x: b.x, y: b.y, width: size.width, height: size.height }
  const area = screen.getDisplayMatching(b).workArea
  win.setBounds(area)
  _maxState.set(win.id, { maximized: true, restoreBounds })
  broadcastState(win, true)
  return { maximized: true }
}

export function startDrag(win: BrowserWindow | null): void {
  if (!win) return
  clearMaximizedFlag(win)
  const b0 = win.getBounds()
  const size = logicalSizeOf(win)
  const startBounds: Bounds = { x: b0.x, y: b0.y, width: size.width, height: size.height }
  const startCursor = screen.getCursorScreenPoint()
  startFollow(win, (cur) => computeDragBounds(startBounds, startCursor, cur))
}

// 추종을 먼저 멈추고 나서 창을 본다 — 등록부가 창을 찾기 전에 stopFollow를 부른다.
export function endDrag(win: BrowserWindow | null): void {
  if (!win) return
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayMatching(win.getBounds())
  const zone = computeSnapZone(cursor, display.workArea)
  if (zone !== null) {
    const b = snapBounds(zone, display.workArea)
    win.setBounds(b)
    setLogicalSize(win, b.width, b.height)
    if (zone === 'maximize') {
      _maxState.set(win.id, { maximized: true, restoreBounds: undefined })
      broadcastState(win, true)
    } else {
      if (_maxState.get(win.id)?.maximized) {
        _maxState.set(win.id, { maximized: false })
        broadcastState(win, false)
      }
    }
  }
}

export function startResize(win: BrowserWindow | null, edge: ResizeEdge | undefined): void {
  if (!win || !edge) return
  clearMaximizedFlag(win)
  const b0 = win.getBounds()
  const size = logicalSizeOf(win)
  const startBounds: Bounds = { x: b0.x, y: b0.y, width: size.width, height: size.height }
  const startCursor = screen.getCursorScreenPoint()
  startFollow(win, (cur) => {
    const b = computeResizeBounds(startBounds, edge, startCursor, cur, MIN_W, MIN_H)
    setLogicalSize(win, b.width, b.height)
    return b
  })
}
