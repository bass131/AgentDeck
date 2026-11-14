import type { IpcMainInvokeEvent } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipcContract'
import type { WindowMaximizedResponse, WindowResizeStartRequest } from '../../../shared/ipcContract'
import { handle } from '../handle'
import {
  windowFromEvent,
  stopFollow,
  isMaximized,
  toggleMaximize,
  startDrag,
  endDrag,
  startResize,
} from '@main/12_Window/controls'

// 창 채널 등록 (M05 G10) — 12_Window/controls.ts에서 옮겼다. 동작은 controls.ts의 함수가 맡는다.
export function registerWindowHandlers(): void {
  handle(IPC_CHANNELS.WINDOW_MINIMIZE, (e: IpcMainInvokeEvent): void => {
    windowFromEvent(e)?.minimize()
  })

  handle(IPC_CHANNELS.WINDOW_CLOSE, (e: IpcMainInvokeEvent): void => {
    windowFromEvent(e)?.close()
  })

  handle(
    IPC_CHANNELS.WINDOW_MAXIMIZE_TOGGLE,
    (e: IpcMainInvokeEvent): WindowMaximizedResponse => toggleMaximize(windowFromEvent(e))
  )

  handle(
    IPC_CHANNELS.WINDOW_IS_MAXIMIZED,
    (e: IpcMainInvokeEvent): WindowMaximizedResponse => ({ maximized: isMaximized(windowFromEvent(e)) })
  )

  handle(IPC_CHANNELS.WINDOW_DRAG_START, (e: IpcMainInvokeEvent): void => {
    startDrag(windowFromEvent(e))
  })

  handle(IPC_CHANNELS.WINDOW_DRAG_END, (e: IpcMainInvokeEvent): void => {
    stopFollow()
    endDrag(windowFromEvent(e))
  })

  handle(
    IPC_CHANNELS.WINDOW_RESIZE_START,
    (e: IpcMainInvokeEvent, req: WindowResizeStartRequest): void => {
      startResize(windowFromEvent(e), req?.edge)
    }
  )

  handle(IPC_CHANNELS.WINDOW_RESIZE_END, (): void => stopFollow())
}
