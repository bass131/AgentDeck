// 앱의 GitHub 연결 서비스 — 준비 안 됨·자격 보호 없음·거부·만료·취소·확인 주소 검사·시험 서버 주소 길. 가짜 HTTP로 본다.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HttpRequest, HttpResponse } from '@main/14_GitHub/deviceFlow'
import {
  GITHUB_BASES,
  NOT_READY,
  createGithubAuth,
  githubBasesOf,
  githubClientIdOf,
  type GithubAuthDeps,
} from '@main/14_GitHub/githubAuth'
import { NO_SAFE_STORAGE, createTokenStore, type SafeStorageLike } from '@main/14_GitHub/tokenStore'
import type { GithubAuthStatus } from '@shared/15_GitHub/github'

const WEB = 'https://github.com'
const TOKEN = 'gho_unitTokenValue77'

const safe = (available = true): SafeStorageLike => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from(Buffer.from(s).map((b) => b ^ 0x33)),
  decryptString: (b) => Buffer.from(Buffer.from(b).map((x) => x ^ 0x33)).toString(),
})

const codeReply = (uri = `${WEB}/login/device`): HttpResponse => ({
  status: 200, body: { device_code: 'dev-secret-code', user_code: 'ABCD-1234', verification_uri: uri, expires_in: 900, interval: 5 },
})

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-ghauth-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

function setup(replies: HttpResponse[] | ((req: HttpRequest) => HttpResponse), over: Partial<GithubAuthDeps> = {}) {
  const calls: HttpRequest[] = []
  const states: GithubAuthStatus[] = []
  const http = async (req: HttpRequest): Promise<HttpResponse> => {
    calls.push(req)
    if (typeof replies === 'function') return replies(req)
    const r = replies.shift()
    if (!r) throw new Error(`예상 밖 요청 ${req.url}`)
    return r
  }
  const opened: string[] = []
  const store = createTokenStore({ file: path.join(dir, 'github-auth.bin'), safeStorage: safe() })
  const auth = createGithubAuth({
    store,
    http,
    clientId: async () => 'Iv1.unit',
    bases: GITHUB_BASES,
    openExternal: async (url) => { opened.push(url) },
    onChange: (s) => states.push(s),
    sleep: async () => undefined,
    ...over,
  })
  const settled = (): Promise<GithubAuthStatus> => vi.waitFor(() => {
    const last = states.at(-1)
    if (!last || last.phase === 'pending') throw new Error('아직 기다림')
    return last
  })
  return { auth, calls, states, opened, store, settled }
}

describe('연결 준비', () => {
  it('클라이언트 ID가 비면 흐름을 시작하지 않고 준비 안 됨을 돌려준다', async () => {
    const t = setup([], { clientId: async () => '  ' })
    expect(await t.auth.connect()).toEqual({ phase: 'disconnected', error: NOT_READY })
    expect(NOT_READY).toBe('GitHub 연결 준비가 안 됐어요')
    expect(t.calls).toHaveLength(0)
  })

  it('클라이언트 ID는 앱 설정의 githubClientId에서 읽고 기본은 빈 값이다', () => {
    expect(githubClientIdOf({})).toBe('')
    expect(githubClientIdOf(undefined)).toBe('')
    expect(githubClientIdOf({ githubClientId: 42 })).toBe('')
    expect(githubClientIdOf({ githubClientId: ' Iv1.x ' })).toBe('Iv1.x')
  })

  it('자격 보호를 쓸 수 없으면 흐름을 시작하지 않고 이유를 돌려준다', async () => {
    const t = setup([], { store: createTokenStore({ file: path.join(dir, 'x.bin'), safeStorage: safe(false) }) })
    expect(await t.auth.connect()).toEqual({ phase: 'disconnected', error: NO_SAFE_STORAGE })
    expect(t.calls).toHaveLength(0)
  })
})

describe('흐름의 끝', () => {
  it('거부·만료·그 밖 오류는 연결 없음과 문구로 끝나고 저장하지 않는다', async () => {
    for (const [error, text] of [['access_denied', '거부'], ['expired_token', '만료'], ['unsupported_grant_type', 'unsupported_grant_type']]) {
      const t = setup([codeReply(), { status: 200, body: { error } }])
      expect((await t.auth.connect()).phase).toBe('pending')
      const end = await t.settled()
      expect(end.phase).toBe('disconnected')
      expect(end.phase === 'disconnected' && end.error).toContain(text)
      expect(t.store.read()).toEqual({ kind: 'none' })
    }
  })

  it('계정 이름을 읽지 못하면 저장하지 않는다', async () => {
    const t = setup([codeReply(), { status: 200, body: { access_token: TOKEN } }, { status: 401, body: {} }])
    await t.auth.connect()
    expect((await t.settled()).phase).toBe('disconnected')
    expect(t.store.read()).toEqual({ kind: 'none' })
  })

  it('기기 코드를 받는 중에 취소하면 그 요청을 끊고 기다림 없이 취소로 끝난다', async () => {
    let codeSignal: AbortSignal | undefined
    const http = (req: HttpRequest): Promise<HttpResponse> => new Promise((resolve, reject) => {
      codeSignal = req.signal
      req.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      setTimeout(() => resolve(codeReply()), 2_000)
    })
    const t = setup([], { http })
    const connecting = t.auth.connect()
    await vi.waitFor(() => { if (!codeSignal) throw new Error('요청 전') })
    expect(t.auth.status()).toEqual({ phase: 'requesting' })
    expect(t.states).toEqual([{ phase: 'requesting' }])
    expect(t.auth.cancel()).toEqual({ phase: 'disconnected', error: '연결을 취소했어요' })
    expect(codeSignal?.aborted).toBe(true)
    expect(await connecting).toEqual({ phase: 'disconnected', error: '연결을 취소했어요' })
    expect(t.auth.status().phase).toBe('disconnected')
    expect(t.states.some((s) => s.phase === 'pending')).toBe(false)
  })

  it('기기 코드를 받는 중에 연결 해제를 눌러도 그 요청을 끊는다', async () => {
    let codeSignal: AbortSignal | undefined
    const http = (req: HttpRequest): Promise<HttpResponse> => new Promise((resolve, reject) => {
      codeSignal = req.signal
      req.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      setTimeout(() => resolve(codeReply()), 2_000)
    })
    const t = setup([], { http })
    const connecting = t.auth.connect()
    await vi.waitFor(() => { if (!codeSignal) throw new Error('요청 전') })
    expect(t.auth.status()).toEqual({ phase: 'requesting' })
    await t.auth.disconnect()
    expect(codeSignal?.aborted).toBe(true)
    expect((await connecting).phase).toBe('disconnected')
  })

  it('토큰을 받은 뒤 계정 이름을 읽는 중에 취소하면 저장하지 않는다', async () => {
    let releaseUser: () => void = () => undefined
    let userAsked = false
    const userGate = new Promise<void>((r) => { releaseUser = r })
    const http = async (req: HttpRequest): Promise<HttpResponse> => {
      if (req.url.endsWith('/user')) { userAsked = true; await userGate; return { status: 200, body: { login: 'octo' } } }
      return req.url.endsWith('/login/device/code') ? codeReply() : { status: 200, body: { access_token: TOKEN } }
    }
    const t = setup([], { http })
    const write = vi.spyOn(t.store, 'write')
    await t.auth.connect()
    await vi.waitFor(() => { if (!userAsked) throw new Error('계정 이름 요청 전') })
    t.auth.cancel()
    releaseUser()
    await new Promise((r) => setTimeout(r, 20))
    expect(write).not.toHaveBeenCalled()
    expect(t.store.read()).toEqual({ kind: 'none' })
  })

  it('저장을 쓰는 중에 취소하면 쓴 것을 지워 연결이 남지 않는다', async () => {
    const store = createTokenStore({ file: path.join(dir, 'github-auth.bin'), safeStorage: safe() })
    const realWrite = store.write
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => { release = r })
    store.write = async (a) => { const r = await realWrite(a); await gate; return r }
    const t = setup((req) => {
      if (req.url.endsWith('/login/device/code')) return codeReply()
      if (req.url.endsWith('/user')) return { status: 200, body: { login: 'octo' } }
      return { status: 200, body: { access_token: TOKEN } }
    }, { store })
    await t.auth.connect()
    await vi.waitFor(() => { if (store.read().kind !== 'ok') throw new Error('쓰기 전') })
    t.auth.cancel()
    release()
    await new Promise((r) => setTimeout(r, 20))
    expect(store.read()).toEqual({ kind: 'none' })
    expect(t.auth.status()).toEqual({ phase: 'disconnected', error: '연결을 취소했어요' })
  })

  it('기다리는 동안 취소하면 폴링을 멈추고 연결 없음으로 남는다', async () => {
    let polls = 0
    const t = setup((req) => {
      if (req.url.endsWith('/login/device/code')) return codeReply()
      polls++
      return { status: 200, body: { error: 'authorization_pending' } }
    }, { sleep: () => new Promise((r) => setTimeout(r, 5)) })
    await t.auth.connect()
    await vi.waitFor(() => { if (polls < 2) throw new Error('폴링 전') })
    expect(t.auth.cancel()).toEqual({ phase: 'disconnected', error: '연결을 취소했어요' })
    const seen = polls
    await new Promise((r) => setTimeout(r, 40))
    expect(polls).toBeLessThanOrEqual(seen + 1)
    expect(t.auth.status().phase).toBe('disconnected')
  })

  it('기다리는 중에 다시 연결을 누르면 새 코드를 받지 않고 지금 코드를 돌려준다', async () => {
    const t = setup((req) => (req.url.endsWith('/login/device/code') ? codeReply() : { status: 200, body: { error: 'authorization_pending' } }),
      { sleep: () => new Promise((r) => setTimeout(r, 5)) })
    const [a, b] = await Promise.all([t.auth.connect(), t.auth.connect()])
    expect(a).toEqual(b)
    expect(t.calls.filter((c) => c.url.endsWith('/login/device/code'))).toHaveLength(1)
    t.auth.cancel()
  })
})

describe('GitHub에서 열기', () => {
  it('main이 가진 확인 주소만 열고, 출처가 GitHub(또는 시험 서버)가 아니면 열지 않는다', async () => {
    const pendingForever = (uri: string) => (req: HttpRequest): HttpResponse =>
      req.url.endsWith('/login/device/code') ? codeReply(uri) : { status: 200, body: { error: 'authorization_pending' } }
    const ok = setup(pendingForever(`${WEB}/login/device`), { sleep: () => new Promise((r) => setTimeout(r, 5)) })
    expect(await ok.auth.openVerification()).toEqual({ ok: false, error: '진행 중인 연결이 없어요' })
    await ok.auth.connect()
    expect(await ok.auth.openVerification()).toEqual({ ok: true })
    expect(ok.opened).toEqual([`${WEB}/login/device`])
    ok.auth.cancel()

    for (const evil of ['https://github.com.evil.test/login/device', 'http://github.com/login/device', 'javascript:alert(1)']) {
      const bad = setup(pendingForever(evil), { sleep: () => new Promise((r) => setTimeout(r, 5)) })
      await bad.auth.connect()
      expect((await bad.auth.openVerification()).ok).toBe(false)
      expect(bad.opened).toEqual([])
      bad.auth.cancel()
    }
  })
})

describe('시험 서버 주소', () => {
  it('기본은 github.com·api.github.com이고, 개발 실행본만 환경변수로 바꾼다', () => {
    expect(githubBasesOf({}, false)).toEqual({ web: 'https://github.com', api: 'https://api.github.com' })
    expect(githubBasesOf({ AGENTDECK_E2E_GITHUB_BASE: 'http://127.0.0.1:5123/' }, false)).toEqual({ web: 'http://127.0.0.1:5123', api: 'http://127.0.0.1:5123' })
    expect(githubBasesOf({ AGENTDECK_E2E_GITHUB_BASE: 'http://127.0.0.1:5123' }, true)).toEqual(GITHUB_BASES)
    expect(githubBasesOf({ AGENTDECK_E2E_GITHUB_BASE: 'not a url' }, false)).toEqual(GITHUB_BASES)
  })
})
