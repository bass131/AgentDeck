import { promises as fsp } from 'node:fs'
import { isAbsolute } from 'node:path'
import { IPC_CHANNELS } from '@shared/ipcContract'
import { handle } from '../handle'
import { getUserDataDir } from '@main/02_Common/userData'
import { gitRoot } from '@main/08_Git/git'
import { readTasteDocs } from '@main/13_Taste/tasteStore'

// 실행기·확정 쓰기와 같은 뿌리(git 최상위의 실제 경로)에서 읽는다. git 저장소가 아니면 받은 폴더 그대로다
async function docsRoot(cwd: string): Promise<string> {
  const top = await gitRoot(cwd)
  if (top === null) return cwd
  try { return await fsp.realpath(top) } catch { return top }
}

export function registerTasteHandlers(): void {
  handle(IPC_CHANNELS.TASTE_READ, async (_e, req) => {
    const cwd = (req as { cwd?: unknown } | null | undefined)?.cwd
    if (typeof cwd !== 'string' || cwd.trim() === '' || !isAbsolute(cwd)) throw new Error('taste.read: cwd는 절대 경로여야 한다')
    return readTasteDocs(getUserDataDir(), await docsRoot(cwd))
  })
}
