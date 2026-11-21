import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS, sendPush, type GithubAuthStatus } from '@shared/ipcContract'
import type { GithubAuth } from '@main/14_GitHub/githubAuth'
import { handle } from '../handle'

// 토큰을 렌더러로 내는 채널은 없다 — 모두 GithubAuthStatus나 Ack만 돌려준다
export function registerGithubHandlers(deps: { auth: GithubAuth }): void {
  const { auth } = deps
  handle(IPC_CHANNELS.GITHUB_STATUS, () => auth.status())
  handle(IPC_CHANNELS.GITHUB_CONNECT, () => auth.connect())
  handle(IPC_CHANNELS.GITHUB_CANCEL, () => auth.cancel())
  handle(IPC_CHANNELS.GITHUB_DISCONNECT, () => auth.disconnect())
  handle(IPC_CHANNELS.GITHUB_OPEN_VERIFICATION, () => auth.openVerification())
}

export function pushGithubState(state: { win: BrowserWindow | null }, s: GithubAuthStatus): void {
  const win = state.win
  if (!win || win.isDestroyed()) return
  sendPush(win.webContents, IPC_CHANNELS.GITHUB_STATE, s)
}
