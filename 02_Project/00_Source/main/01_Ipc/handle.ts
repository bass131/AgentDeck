import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type { InvokeChannel, ReqOf, ResOf } from '@shared/ipcContract'

type InvokeHandler<C extends InvokeChannel> = (
  event: IpcMainInvokeEvent,
  req: ReqOf<C>,
) => ResOf<C> | Promise<ResOf<C>>

export function handle<C extends InvokeChannel>(channel: C, fn: InvokeHandler<C>): void {
  ipcMain.handle(channel, fn)
}
