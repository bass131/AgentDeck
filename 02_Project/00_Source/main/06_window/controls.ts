import { ipcMain, BrowserWindow, screen } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipcContract'
import type {
  WindowBounds,
  WindowMaximizedResponse,
  WindowResizeStartRequest,
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

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function sanitizeBounds(raw: unknown): Bounds | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>

  const x = finiteNumber(r.x)
  const y = finiteNumber(r.y)
  const width = finiteNumber(r.width)
  const height = finiteNumber(r.height)
  if (x === null || y === null || width === null || height === null) return null

  if (width <= 0 || height <= 0) return null

  return { x, y, width: Math.max(width, MIN_W), height: Math.max(height, MIN_H) }
}

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
  win.webContents.send(IPC_CHANNELS.WINDOW_STATE, payload)
}

function isMaximized(win: BrowserWindow | null): boolean {
  return win ? Boolean(_maxState.get(win.id)?.maximized) : false
}

function clearMaximizedFlag(win: BrowserWindow | null): void {
  if (win && _maxState.get(win.id)?.maximized) {
    _maxState.set(win.id, { maximized: false })
    broadcastState(win, false)
  }
}

function toggleMaximize(win: BrowserWindow | null): WindowMaximizedResponse {
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
    const safe = sanitizeBounds(b)
    if (!safe) return
    clearMaximizedFlag(win)
    win.setBounds(safe)
    setLogicalSize(win, safe.width, safe.height)
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_DRAG_START, (e: IpcMainInvokeEvent): void => {
    const win = winFrom(e)
    if (!win) return
    clearMaximizedFlag(win)
    const b0 = win.getBounds()
    const size = logicalSizeOf(win)
    const startBounds: Bounds = { x: b0.x, y: b0.y, width: size.width, height: size.height }
    const startCursor = screen.getCursorScreenPoint()
    startFollow(win, (cur) => computeDragBounds(startBounds, startCursor, cur))
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_DRAG_END, (e: IpcMainInvokeEvent): void => {
    stopFollow()

    const win = winFrom(e)
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
  })

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_RESIZE_START,
    (e: IpcMainInvokeEvent, req: WindowResizeStartRequest): void => {
      const win = winFrom(e)
      if (!win || !req?.edge) return
      clearMaximizedFlag(win)
      const b0 = win.getBounds()
      const size = logicalSizeOf(win)
      const startBounds: Bounds = { x: b0.x, y: b0.y, width: size.width, height: size.height }
      const startCursor = screen.getCursorScreenPoint()
      startFollow(win, (cur) => {
        const b = computeResizeBounds(startBounds, req.edge, startCursor, cur, MIN_W, MIN_H)
        setLogicalSize(win, b.width, b.height)
        return b
      })
    }
  )

  ipcMain.handle(IPC_CHANNELS.WINDOW_RESIZE_END, (): void => stopFollow())
}
