import { isAbsolute } from 'node:path'
import { IPC_CHANNELS } from '@shared/ipcContract'
import { handle } from '../handle'
import { getUserDataDir } from '@main/02_Common/userData'
import { readTasteDocs } from '@main/13_Taste/tasteStore'

export function registerTasteHandlers(): void {
  handle(IPC_CHANNELS.TASTE_READ, async (_e, req) => {
    const cwd = (req as { cwd?: unknown } | null | undefined)?.cwd
    if (typeof cwd !== 'string' || cwd.trim() === '' || !isAbsolute(cwd)) throw new Error('taste.read: cwd는 절대 경로여야 한다')
    return readTasteDocs(getUserDataDir(), cwd)
  })
}
