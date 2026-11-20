import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type { InvokeChannel, ReqOf, ResOf } from '@shared/ipcContract'

// 채널 맵에서 유도한 핸들러 모양 — 요청·응답이 맵과 어긋나면 typecheck:node가 실패한다 (M05 G10).
type InvokeHandler<C extends InvokeChannel> = (
  event: IpcMainInvokeEvent,
  req: ReqOf<C>,
) => ResOf<C> | Promise<ResOf<C>>

// 타입만 붙이고 핸들러는 감싸지 않는다 — ipcMain.handle에 같은 함수 객체가 그대로 등록된다.
export function handle<C extends InvokeChannel>(channel: C, fn: InvokeHandler<C>): void {
  ipcMain.handle(channel, fn)
}
