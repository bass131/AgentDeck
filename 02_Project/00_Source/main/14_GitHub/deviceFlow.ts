// GitHub 기기 인증(device flow). 근거는 GitHub Docs 「Authorizing OAuth apps」의 Device flow 절이다.
//   1. POST {web}/login/device/code (client_id, scope) → device_code·user_code·verification_uri·expires_in·interval
//   2. POST {web}/login/oauth/access_token (client_id, device_code, grant_type) — 오류는 본문의 error 칸으로 오고, slow_down은 새 interval을 싣는다
//   3. GET {api}/user → login
// HTTP 함수를 주입받는 순수 모듈이다. 실패 사유에는 토큰·기기 코드를 싣지 않는다.

export interface HttpRequest {
  method: 'GET' | 'POST'
  url: string
  headers: Record<string, string>
  body?: string
  signal?: AbortSignal
}
export interface HttpResponse { status: number; body: unknown }
export type HttpJson = (req: HttpRequest) => Promise<HttpResponse>

export const GITHUB_SCOPE = 'repo workflow'
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'
const SLOW_DOWN_STEP_S = 5
const DEFAULT_INTERVAL_S = 5

export interface DeviceCode {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export interface FlowFailure { ok: false; failure: 'expired' | 'denied' | 'cancelled' | 'error'; detail?: string }

const rec = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const text = (v: unknown): string => (typeof v === 'string' ? v : '')
const positive = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)

function errorOf(res: HttpResponse): FlowFailure {
  const code = text(rec(res.body)['error'])
  return { ok: false, failure: 'error', detail: code || `HTTP ${res.status}` }
}

const formPost = (url: string, form: Record<string, string>, signal?: AbortSignal): HttpRequest => ({
  method: 'POST',
  url,
  headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(form).toString(),
  ...(signal ? { signal } : {}),
})

export async function requestDeviceCode(
  http: HttpJson, opts: { webBase: string; clientId: string; signal?: AbortSignal },
): Promise<{ ok: true; code: DeviceCode } | FlowFailure> {
  let res: HttpResponse
  try {
    res = await http(formPost(`${opts.webBase}/login/device/code`, { client_id: opts.clientId, scope: GITHUB_SCOPE }, opts.signal))
  } catch {
    return { ok: false, failure: opts.signal?.aborted ? 'cancelled' : 'error', ...(opts.signal?.aborted ? {} : { detail: 'network' }) }
  }
  const b = rec(res.body)
  if (res.status !== 200 || b['error'] !== undefined) return errorOf(res)
  const deviceCode = text(b['device_code'])
  const userCode = text(b['user_code'])
  const verificationUri = text(b['verification_uri'])
  const expiresIn = positive(b['expires_in'])
  if (!deviceCode || !userCode || !verificationUri || expiresIn === null) return { ok: false, failure: 'error', detail: 'malformed' }
  return { ok: true, code: { deviceCode, userCode, verificationUri, expiresIn, interval: positive(b['interval']) ?? DEFAULT_INTERVAL_S } }
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const done = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })
}

interface PollOptions {
  webBase: string
  clientId: string
  code: DeviceCode
  signal: AbortSignal
  now?: () => number
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
}

export async function pollForToken(http: HttpJson, opts: PollOptions): Promise<{ ok: true; token: string } | FlowFailure> {
  const now = opts.now ?? Date.now
  const sleep = opts.sleep ?? abortableSleep
  const deadline = now() + opts.code.expiresIn * 1000
  const cancelled: FlowFailure = { ok: false, failure: 'cancelled' }
  let interval = opts.code.interval
  for (;;) {
    await sleep(interval * 1000, opts.signal)
    if (opts.signal.aborted) return cancelled
    if (now() >= deadline) return { ok: false, failure: 'expired' }
    let res: HttpResponse
    try {
      res = await http(formPost(`${opts.webBase}/login/oauth/access_token`, {
        client_id: opts.clientId, device_code: opts.code.deviceCode, grant_type: DEVICE_GRANT,
      }, opts.signal))
    } catch {
      return opts.signal.aborted ? cancelled : { ok: false, failure: 'error', detail: 'network' }
    }
    const b = rec(res.body)
    const token = text(b['access_token'])
    if (res.status === 200 && token) return { ok: true, token }
    switch (b['error']) {
      case 'authorization_pending':
        continue
      case 'slow_down':
        interval = positive(b['interval']) ?? interval + SLOW_DOWN_STEP_S
        continue
      case 'expired_token':
        return { ok: false, failure: 'expired' }
      case 'access_denied':
        return { ok: false, failure: 'denied' }
      default:
        return errorOf(res)
    }
  }
}

export async function fetchLogin(http: HttpJson, opts: { apiBase: string; token: string; signal?: AbortSignal }): Promise<string | null> {
  try {
    const res = await http({
      method: 'GET',
      url: `${opts.apiBase}/user`,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${opts.token}`,
        'User-Agent': 'AgentDeck',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      ...(opts.signal ? { signal: opts.signal } : {}),
    })
    const login = text(rec(res.body)['login'])
    return res.status === 200 && login ? login : null
  } catch {
    return null
  }
}

export const fetchJson: HttpJson = async (req) => {
  const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, signal: req.signal })
  const raw = await res.text()
  let body: unknown = null
  try { body = raw ? JSON.parse(raw) : null } catch { body = null }
  return { status: res.status, body }
}
