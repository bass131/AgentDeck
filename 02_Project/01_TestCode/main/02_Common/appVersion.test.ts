import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const h = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>() }))

vi.mock('electron', () => ({
  app: { getVersion: () => '42.4.1', getPath: () => '/ud' },
  ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown): void => { h.handlers.set(ch, fn) } },
}))

import { APP_VERSION } from '@main/02_Common/appVersion'
import { registerEngineHandlers } from '@main/01_Ipc/handlers/engine'
import { IPC_CHANNELS } from '@shared/ipcContract'

const ROOT = path.resolve(__dirname, '../../../..')
const versionOf = (rel: string): string => (JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as { version: string }).version

describe('화면의 버전 표시는 앱 버전이다 (M13 G1, M06 Backlog 6)', () => {
  it('APP_VERSION은 package.json version이고 Electron 버전이 아니다', () => {
    expect(APP_VERSION).toBe(versionOf('package.json'))
    expect(APP_VERSION).not.toBe(versionOf('node_modules/electron/package.json'))
  })

  it('APP_VERSION 채널은 app.getVersion()이 아니라 APP_VERSION을 돌려준다', async () => {
    registerEngineHandlers()
    const fn = h.handlers.get(IPC_CHANNELS.APP_VERSION)!
    expect(await fn({})).toBe(versionOf('package.json'))
  })
})
