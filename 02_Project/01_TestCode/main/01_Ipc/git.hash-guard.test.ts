// M11 G3 — M11 Backlog 19. git IPC 핸들러는 renderer가 보낸 hash가 `-`로 시작하면 git 함수를 부르지 않는다.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  calls: [] as string[],
}))

vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown): void => { h.handlers.set(ch, fn) } },
}))
vi.mock('@main/08_Git/git', async (orig) => ({
  ...(await orig<typeof import('@main/08_Git/git')>()),
  gitCommitDetail: async (_root: string, hash: string) => { h.calls.push(`detail ${hash}`); return [] },
  gitFileAt: async (_root: string, hash: string) => { h.calls.push(`fileAt ${hash}`); return { content: 'x', diff: null } },
}))

import { registerGitHandlers } from '@main/01_Ipc/handlers/git'
import { IPC_CHANNELS } from '../../../../02_Project/00_Source/shared/ipcContract'

beforeEach(() => {
  h.handlers.clear()
  h.calls.length = 0
  registerGitHandlers()
})

const call = (ch: string, req: unknown): unknown => (h.handlers.get(ch) as (e: unknown, r: unknown) => unknown)({}, req)

describe('git IPC의 hash (M11 G3)', () => {
  it('[M11-G3 M11-19] `-` 머리 hash는 git 함수를 부르지 않고 빈 결과를 돌려준다', async () => {
    expect(await call(IPC_CHANNELS.GIT_COMMIT_DETAIL, { root: 'C:\\r', hash: '--output=C:\\x' })).toEqual([])
    expect(await call(IPC_CHANNELS.GIT_FILE_AT, { root: 'C:\\r', hash: '-p', path: 'a.ts' })).toMatchObject({ content: null })
    expect(h.calls).toEqual([])
    await call(IPC_CHANNELS.GIT_COMMIT_DETAIL, { root: 'C:\\r', hash: 'abc123' })
    expect(h.calls).toEqual(['detail abc123'])
  })
})
