// 로컬 http 시험 서버(기기 코드·토큰·/user 흉내)로 연결 하나가 끝까지 돈다 — 코드 요청 → 열기 → 폴링 → /user → 저장 → 해제.
// Node 내장 fetch(fetchJson)로 실제 HTTP를 보낸다. 실제 GitHub에는 요청하지 않는다.
import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFetchJson, fetchJson } from '@main/14_GitHub/deviceFlow'
import { createGithubAuth, githubBasesOf } from '@main/14_GitHub/githubAuth'
import { createTokenStore, storedToken, type SafeStorageLike } from '@main/14_GitHub/tokenStore'
import type { GithubAuthStatus } from '@shared/15_GitHub/github'

const TOKEN = 'gho_localServerToken9'
const DEVICE_CODE = 'local-device-code-xyz'

interface Seen { method: string; path: string; headers: http.IncomingHttpHeaders; form: Record<string, string> }

let server: http.Server
let base: string
let seen: Seen[]
let approved: boolean
let dir: string

beforeEach(async () => {
  seen = []
  approved = false
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-ghlocal-'))
  server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c: Buffer) => { body += c.toString() })
    req.on('end', () => {
      const url = new URL(req.url ?? '/', base)
      seen.push({ method: req.method ?? '', path: url.pathname, headers: req.headers, form: Object.fromEntries(new URLSearchParams(body)) })
      const json = (status: number, obj: unknown): void => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(obj))
      }
      if (req.method === 'POST' && url.pathname === '/login/device/code') {
        return json(200, { device_code: DEVICE_CODE, user_code: 'LOCA-1234', verification_uri: `${base}/login/device`, expires_in: 900, interval: 1 })
      }
      if (req.method === 'POST' && url.pathname === '/login/oauth/access_token') {
        return json(200, approved ? { access_token: TOKEN, token_type: 'bearer', scope: 'repo,workflow' } : { error: 'authorization_pending' })
      }
      if (req.method === 'GET' && url.pathname === '/user') {
        return req.headers.authorization === `Bearer ${TOKEN}` ? json(200, { login: 'local-user' }) : json(401, { message: 'Bad credentials' })
      }
      json(404, { message: 'Not Found' })
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()))
  fs.rmSync(dir, { recursive: true, force: true })
})

const safe: SafeStorageLike = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(Buffer.from(s).map((b) => b ^ 0x77)),
  decryptString: (b) => Buffer.from(Buffer.from(b).map((x) => x ^ 0x77)).toString(),
}

describe('로컬 시험 서버로 끝까지', () => {
  it('코드 요청 → GitHub에서 열기 → 폴링 → /user → 저장 → 연결 해제', async () => {
    const file = path.join(dir, 'github-auth.bin')
    const store = createTokenStore({ file, safeStorage: safe })
    const states: GithubAuthStatus[] = []
    const opened: string[] = []
    const auth = createGithubAuth({
      store,
      http: fetchJson,
      clientId: async () => 'Iv1.local',
      bases: githubBasesOf({ AGENTDECK_E2E_GITHUB_BASE: base }, false),
      openExternal: async (u) => { opened.push(u) },
      onChange: (s) => states.push(s),
      sleep: () => new Promise((r) => setTimeout(r, 10)),
    })

    const first = await auth.connect()
    expect(first).toMatchObject({ phase: 'pending', userCode: 'LOCA-1234', verificationUri: `${base}/login/device` })
    expect(JSON.stringify(first)).not.toContain(DEVICE_CODE)
    expect(await auth.openVerification()).toEqual({ ok: true })
    expect(opened).toEqual([`${base}/login/device`])

    await vi.waitFor(() => { if (seen.filter((s) => s.path === '/login/oauth/access_token').length < 2) throw new Error('폴링 전') })
    approved = true
    await vi.waitFor(() => { if (states.at(-1)?.phase !== 'connected') throw new Error('연결 전') })

    expect(auth.status()).toEqual({ phase: 'connected', login: 'local-user' })
    expect(storedToken(store)).toBe(TOKEN)
    expect(fs.readFileSync(file, 'utf8')).not.toContain(TOKEN)

    const code = seen.find((s) => s.path === '/login/device/code') as Seen
    expect(code.form).toEqual({ client_id: 'Iv1.local', scope: 'repo workflow' })
    expect(code.headers.accept).toBe('application/json')
    const poll = seen.find((s) => s.path === '/login/oauth/access_token') as Seen
    expect(poll.form).toEqual({ client_id: 'Iv1.local', device_code: DEVICE_CODE, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' })
    expect(seen.filter((s) => s.path === '/user')).toHaveLength(1)

    for (const s of states) {
      expect(JSON.stringify(s)).not.toContain(TOKEN)
      expect(JSON.stringify(s)).not.toContain(DEVICE_CODE)
    }

    expect(await auth.disconnect()).toEqual({ phase: 'disconnected' })
    expect(fs.existsSync(file)).toBe(false)
    expect(storedToken(store)).toBeNull()
  })
})

describe('HTTP 시간 제한', () => {
  it('답하지 않는 서버에는 시간 제한으로 끝나고, 부르는 쪽의 취소도 먹는다', async () => {
    const hang = http.createServer(() => undefined)
    await new Promise<void>((r) => hang.listen(0, '127.0.0.1', r))
    const url = `http://127.0.0.1:${(hang.address() as AddressInfo).port}/login/device/code`
    try {
      const t0 = Date.now()
      await expect(createFetchJson(150)({ method: 'POST', url, headers: {} })).rejects.toThrow()
      expect(Date.now() - t0).toBeLessThan(5_000)
      const ac = new AbortController()
      const pendingReq = createFetchJson(60_000)({ method: 'POST', url, headers: {}, signal: ac.signal })
      setTimeout(() => ac.abort(), 50)
      await expect(pendingReq).rejects.toThrow()
      expect(Date.now() - t0).toBeLessThan(10_000)
    } finally {
      hang.closeAllConnections()
      await new Promise<void>((r) => hang.close(() => r()))
    }
  })
})
