// GitHub 연결 IPC — 렌더러로 가는 모든 응답과 push에 토큰과 기기 코드가 없다. 채널은 상태·연결·취소·해제·열기와 상태 push뿐이다.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ handlers: new Map<string, (...a: unknown[]) => unknown>() }))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown): void => { h.handlers.set(ch, fn) },
  },
}))

import { pushGithubState, registerGithubHandlers } from '@main/01_Ipc/handlers/github'
import type { HttpRequest, HttpResponse } from '@main/14_GitHub/deviceFlow'
import { GITHUB_BASES, createGithubAuth } from '@main/14_GitHub/githubAuth'
import { createTokenStore } from '@main/14_GitHub/tokenStore'
import { API_ROUTES } from '@shared/01_Ipc/apiRoutes'
import { GITHUB_CHANNELS, type GithubAuthStatus } from '@shared/ipcContract'

const TOKEN = 'gho_ipcMustNotCarry12'
const DEVICE_CODE = 'ipc-device-code-secret'
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-ghipc-'))
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }) })

let approved = false
const http = async (req: HttpRequest): Promise<HttpResponse> => {
  if (req.url.endsWith('/login/device/code')) {
    return { status: 200, body: { device_code: DEVICE_CODE, user_code: 'IPCC-0001', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 } }
  }
  if (req.url.endsWith('/login/oauth/access_token')) return { status: 200, body: approved ? { access_token: TOKEN } : { error: 'authorization_pending' } }
  return { status: 200, body: { login: 'ipc-user' } }
}

describe('GitHub 연결 IPC', () => {
  it('채널은 상태·연결·취소·해제·열기와 상태 push뿐이다', () => {
    expect(Object.values(GITHUB_CHANNELS).sort()).toEqual([
      'github.cancel', 'github.connect', 'github.disconnect', 'github.openVerification', 'github.state', 'github.status',
    ])
    expect(Object.keys(API_ROUTES.github).sort()).toEqual(['cancel', 'connect', 'disconnect', 'onState', 'openVerification', 'status'])
  })

  it('연결 전·기다림·연결 뒤·해제의 모든 응답과 push에 토큰·기기 코드가 없다', async () => {
    const pushed: unknown[] = []
    const win = { isDestroyed: () => false, webContents: { send: (_ch: string, p: unknown) => { pushed.push(p) } } }
    const state = { win: win as never }
    const store = createTokenStore({
      file: path.join(dir, 'github-auth.bin'),
      safeStorage: { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s).reverse(), decryptString: (b) => Buffer.from(b).reverse().toString() },
    })
    const auth = createGithubAuth({
      store, http, clientId: async () => 'Iv1.ipc', bases: GITHUB_BASES,
      openExternal: async () => undefined,
      onChange: (s) => pushGithubState(state, s),
      sleep: () => new Promise((r) => setTimeout(r, 5)),
    })
    registerGithubHandlers({ auth })
    const call = async (ch: string): Promise<unknown> => (h.handlers.get(ch) as (...a: unknown[]) => unknown)({})

    const replies: unknown[] = []
    replies.push(await call(GITHUB_CHANNELS.GITHUB_STATUS))
    const pending = (await call(GITHUB_CHANNELS.GITHUB_CONNECT)) as GithubAuthStatus
    replies.push(pending)
    expect(pending).toMatchObject({ phase: 'pending', userCode: 'IPCC-0001' })
    const opened = await call(GITHUB_CHANNELS.GITHUB_OPEN_VERIFICATION)
    expect(opened).toEqual({ ok: true })
    replies.push(opened)
    approved = true
    await vi.waitFor(() => { if (auth.status().phase !== 'connected') throw new Error('연결 전') })
    const connected = await call(GITHUB_CHANNELS.GITHUB_STATUS)
    replies.push(connected)
    expect(connected).toEqual({ phase: 'connected', login: 'ipc-user' })
    replies.push(await call(GITHUB_CHANNELS.GITHUB_CANCEL))
    replies.push(await call(GITHUB_CHANNELS.GITHUB_DISCONNECT))

    expect(pushed.length).toBeGreaterThan(0)
    expect(pushed.at(-1)).toEqual({ phase: 'disconnected' })
    for (const r of [...replies, ...pushed]) {
      const text = JSON.stringify(r)
      expect(text).not.toContain(TOKEN)
      expect(text).not.toContain(DEVICE_CODE)
    }
  })
})
