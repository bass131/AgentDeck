// 기기 인증 흐름 — 주입한 HTTP 함수로 코드 요청·폴링·계정 이름 읽기를 본다. 실제 GitHub에는 요청하지 않는다.
import { describe, expect, it } from 'vitest'
import {
  GITHUB_SCOPE,
  fetchLogin,
  pollForToken,
  requestDeviceCode,
  type DeviceCode,
  type HttpRequest,
  type HttpResponse,
} from '@main/14_GitHub/deviceFlow'

const WEB = 'https://github.test'
const API = 'https://api.github.test'
const TOKEN = 'gho_fakeTokenValue0001'

const CODE: DeviceCode = { deviceCode: 'dev-code-1', userCode: 'WDJB-MJHT', verificationUri: `${WEB}/login/device`, expiresIn: 900, interval: 5 }

function scripted(replies: HttpResponse[]) {
  const calls: HttpRequest[] = []
  const http = async (req: HttpRequest): Promise<HttpResponse> => {
    calls.push(req)
    const next = replies.shift()
    if (!next) throw new Error(`예상 밖 요청 ${req.method} ${req.url}`)
    return next
  }
  return { http, calls }
}

function clock() {
  let t = 0
  const slept: number[] = []
  return {
    now: () => t,
    sleep: async (ms: number) => { slept.push(ms); t += ms },
    slept,
  }
}

const pending: HttpResponse = { status: 200, body: { error: 'authorization_pending' } }
const granted: HttpResponse = { status: 200, body: { access_token: TOKEN, token_type: 'bearer', scope: 'repo,workflow' } }

describe('기기 코드 요청', () => {
  it('client_id와 repo workflow 권한을 폼으로 보내고 JSON을 받는다', async () => {
    const { http, calls } = scripted([{ status: 200, body: { device_code: 'dev-code-1', user_code: 'WDJB-MJHT', verification_uri: `${WEB}/login/device`, expires_in: 900, interval: 5 } }])
    const r = await requestDeviceCode(http, { webBase: WEB, clientId: 'Iv1.abc' })
    expect(r).toEqual({ ok: true, code: CODE })
    expect(calls[0].method).toBe('POST')
    expect(calls[0].url).toBe(`${WEB}/login/device/code`)
    expect(calls[0].headers.Accept).toBe('application/json')
    expect(Object.fromEntries(new URLSearchParams(calls[0].body))).toEqual({ client_id: 'Iv1.abc', scope: GITHUB_SCOPE })
    expect(GITHUB_SCOPE).toBe('repo workflow')
  })

  it('오류 응답과 빠진 칸은 실패다', async () => {
    expect(await requestDeviceCode(scripted([{ status: 200, body: { error: 'device_flow_disabled' } }]).http, { webBase: WEB, clientId: 'x' }))
      .toEqual({ ok: false, failure: 'error', detail: 'device_flow_disabled' })
    expect(await requestDeviceCode(scripted([{ status: 404, body: null }]).http, { webBase: WEB, clientId: 'x' }))
      .toEqual({ ok: false, failure: 'error', detail: 'HTTP 404' })
    expect(await requestDeviceCode(scripted([{ status: 200, body: { device_code: 'd' } }]).http, { webBase: WEB, clientId: 'x' }))
      .toMatchObject({ ok: false, failure: 'error' })
  })
})

describe('토큰 폴링', () => {
  it('간격을 지켜 기다린 뒤 묻고, authorization_pending이면 계속, 토큰이 오면 끝난다', async () => {
    const { http, calls } = scripted([pending, pending, granted])
    const c = clock()
    const r = await pollForToken(http, { webBase: WEB, clientId: 'Iv1.abc', code: CODE, signal: new AbortController().signal, ...c })
    expect(r).toEqual({ ok: true, token: TOKEN })
    expect(c.slept).toEqual([5000, 5000, 5000])
    expect(calls).toHaveLength(3)
    expect(calls[0].url).toBe(`${WEB}/login/oauth/access_token`)
    expect(calls[0].headers.Accept).toBe('application/json')
    expect(Object.fromEntries(new URLSearchParams(calls[0].body))).toEqual({
      client_id: 'Iv1.abc', device_code: 'dev-code-1', grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    })
  })

  it('slow_down 응답에 interval이 없으면 간격을 5초씩 늘린다', async () => {
    const slow: HttpResponse = { status: 200, body: { error: 'slow_down' } }
    const c = clock()
    const r = await pollForToken(scripted([slow, slow, pending, granted]).http, { webBase: WEB, clientId: 'x', code: CODE, signal: new AbortController().signal, ...c })
    expect(r.ok).toBe(true)
    expect(c.slept).toEqual([5000, 10000, 15000, 15000])
  })

  it('slow_down 응답에 interval이 있으면 그 값을 다음 간격으로 쓴다', async () => {
    const slowTo = (interval: unknown): HttpResponse => ({ status: 200, body: { error: 'slow_down', interval } })
    const c = clock()
    const r = await pollForToken(scripted([slowTo(12), slowTo(7), slowTo('x'), pending, granted]).http, { webBase: WEB, clientId: 'x', code: CODE, signal: new AbortController().signal, ...c })
    expect(r.ok).toBe(true)
    expect(c.slept).toEqual([5000, 12000, 7000, 12000, 12000])
  })

  it('expired_token은 만료, access_denied는 거부, 그 밖 오류는 실패로 끝난다', async () => {
    const run = (body: unknown) => pollForToken(scripted([pending, { status: 200, body }]).http, { webBase: WEB, clientId: 'x', code: CODE, signal: new AbortController().signal, ...clock() })
    expect(await run({ error: 'expired_token' })).toEqual({ ok: false, failure: 'expired' })
    expect(await run({ error: 'access_denied' })).toEqual({ ok: false, failure: 'denied' })
    expect(await run({ error: 'incorrect_device_code' })).toEqual({ ok: false, failure: 'error', detail: 'incorrect_device_code' })
  })

  it('계속 기다림이어도 expires_in이 지나면 만료다', async () => {
    const replies = Array.from({ length: 10 }, () => pending)
    const c = clock()
    const r = await pollForToken(scripted(replies).http, { webBase: WEB, clientId: 'x', code: { ...CODE, expiresIn: 12 }, signal: new AbortController().signal, ...c })
    expect(r).toEqual({ ok: false, failure: 'expired' })
  })

  it('취소 신호가 오면 다음 요청을 보내지 않고 취소로 끝난다', async () => {
    const ac = new AbortController()
    const { http, calls } = scripted([pending, granted])
    const c = clock()
    const sleep = async (ms: number): Promise<void> => {
      await c.sleep(ms)
      if (calls.length === 1) ac.abort()
    }
    const r = await pollForToken(http, { webBase: WEB, clientId: 'x', code: CODE, signal: ac.signal, now: c.now, sleep })
    expect(r).toEqual({ ok: false, failure: 'cancelled' })
    expect(calls).toHaveLength(1)
  })

  it('요청이 던지거나 본문 없는 5xx면 끝내지 않고 간격을 두 배로 늘려 다시 묻는다', async () => {
    const replies: (HttpResponse | 'throw')[] = ['throw', { status: 502, body: null }, pending, granted]
    const http = async (): Promise<HttpResponse> => {
      const next = replies.shift()
      if (next === 'throw' || !next) throw new Error(`boom ${TOKEN}`)
      return next
    }
    const c = clock()
    const r = await pollForToken(http, { webBase: WEB, clientId: 'x', code: CODE, signal: new AbortController().signal, ...c })
    expect(r).toEqual({ ok: true, token: TOKEN })
    expect(c.slept).toEqual([5000, 10000, 20000, 20000])
  })

  it('네트워크 오류가 이어져도 만료 시각이 지나면 만료로 끝나고 사유에 토큰을 싣지 않는다', async () => {
    const http = async (): Promise<HttpResponse> => { throw new Error(`boom ${TOKEN}`) }
    const r = await pollForToken(http, { webBase: WEB, clientId: 'x', code: { ...CODE, expiresIn: 60 }, signal: new AbortController().signal, ...clock() })
    expect(r).toEqual({ ok: false, failure: 'expired' })
  })

  it('본문에 error가 있는 5xx는 그 오류로 끝난다', async () => {
    const r = await pollForToken(scripted([{ status: 503, body: { error: 'unavailable' } }]).http, { webBase: WEB, clientId: 'x', code: CODE, signal: new AbortController().signal, ...clock() })
    expect(r).toEqual({ ok: false, failure: 'error', detail: 'unavailable' })
  })
})

describe('계정 이름', () => {
  it('GET /user에 Bearer 토큰을 실어 login을 읽는다', async () => {
    const { http, calls } = scripted([{ status: 200, body: { login: 'octocat', id: 1 } }])
    expect(await fetchLogin(http, { apiBase: API, token: TOKEN })).toBe('octocat')
    expect(calls[0]).toMatchObject({ method: 'GET', url: `${API}/user` })
    expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('200이 아니거나 login이 없으면 null이다', async () => {
    expect(await fetchLogin(scripted([{ status: 401, body: { message: 'Bad credentials' } }]).http, { apiBase: API, token: TOKEN })).toBeNull()
    expect(await fetchLogin(scripted([{ status: 200, body: {} }]).http, { apiBase: API, token: TOKEN })).toBeNull()
  })
})
