// 앱의 GitHub 연결 — 기기 인증 한 번을 들고 있다가 끝나면 토큰과 계정 이름을 저장한다.
// 렌더러에는 GithubAuthStatus만 나간다(토큰·기기 코드 없음). 「GitHub에서 열기」는 main이 받은 확인 주소만,
// 그 출처가 연결 대상(github.com 또는 개발 실행본의 시험 서버)과 같을 때만 연다. electron은 부르는 쪽이 넣는다.
import type { Ack } from '@shared/02_Common/common'
import type { GithubAuthStatus } from '@shared/15_GitHub/github'
import { fetchLogin, pollForToken, requestDeviceCode, type DeviceCode, type FlowFailure, type HttpJson } from './deviceFlow'
import { NO_SAFE_STORAGE, type TokenStore } from './tokenStore'

interface GithubBases { web: string; api: string }
export const GITHUB_BASES: GithubBases = { web: 'https://github.com', api: 'https://api.github.com' }
const E2E_BASE_ENV = 'AGENTDECK_E2E_GITHUB_BASE'

// 시험 서버 주소는 패키징본에서 읽지 않는다
export function githubBasesOf(env: NodeJS.ProcessEnv, packaged: boolean): GithubBases {
  const raw = packaged ? '' : (env[E2E_BASE_ENV] ?? '').trim()
  if (!raw) return GITHUB_BASES
  try {
    const origin = new URL(raw).origin
    return origin === 'null' ? GITHUB_BASES : { web: origin, api: origin }
  } catch {
    return GITHUB_BASES
  }
}

export function githubClientIdOf(prefs: Record<string, unknown> | undefined): string {
  const v = prefs?.['githubClientId']
  return typeof v === 'string' ? v.trim() : ''
}

export const NOT_READY = 'GitHub 연결 준비가 안 됐어요'
const CANCELLED = '연결을 취소했어요'
const NO_LOGIN = '계정 이름을 읽지 못해 연결하지 않았어요'
const UNREADABLE = '저장된 연결을 읽지 못했어요 — 다시 연결해 주세요'

function messageOf(f: FlowFailure): string {
  switch (f.failure) {
    case 'expired': return '코드가 만료됐어요 — 다시 연결해 주세요'
    case 'denied': return 'GitHub에서 연결을 거부했어요'
    case 'cancelled': return CANCELLED
    default: return `GitHub 연결에 실패했어요 (${f.detail ?? 'unknown'})`
  }
}

function sameOrigin(url: string, base: string): boolean {
  try { return new URL(url).origin === new URL(base).origin } catch { return false }
}

export interface GithubAuthDeps {
  store: TokenStore
  http: HttpJson
  clientId: () => Promise<string>
  bases: GithubBases
  openExternal: (url: string) => Promise<void>
  onChange?: (s: GithubAuthStatus) => void
  now?: () => number
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
}

export interface GithubAuth {
  status(): GithubAuthStatus
  connect(): Promise<GithubAuthStatus>
  cancel(): GithubAuthStatus
  disconnect(): Promise<GithubAuthStatus>
  openVerification(): Promise<Ack>
}

interface Pending { code: DeviceCode; clientId: string; expiresAt: string; abort: AbortController }

export function createGithubAuth(deps: GithubAuthDeps): GithubAuth {
  const now = deps.now ?? Date.now
  let pending: Pending | null = null
  let starting: Promise<GithubAuthStatus> | null = null
  let lastError: string | null = null

  const status = (): GithubAuthStatus => {
    if (pending) return { phase: 'pending', userCode: pending.code.userCode, verificationUri: pending.code.verificationUri, expiresAt: pending.expiresAt }
    const r = deps.store.read()
    if (r.kind === 'ok') return { phase: 'connected', login: r.auth.login }
    const error = lastError ?? (r.kind === 'unreadable' ? UNREADABLE : null)
    return error ? { phase: 'disconnected', error } : { phase: 'disconnected' }
  }
  const settle = (error: string | null): GithubAuthStatus => {
    lastError = error
    const s = status()
    deps.onChange?.(s)
    return s
  }

  async function finish(entry: Pending): Promise<void> {
    const signal = entry.abort.signal
    const polled = await pollForToken(deps.http, {
      webBase: deps.bases.web, clientId: entry.clientId, code: entry.code, signal, now, ...(deps.sleep ? { sleep: deps.sleep } : {}),
    })
    let error: string | null = null
    if (!polled.ok) {
      error = messageOf(polled)
    } else {
      const login = await fetchLogin(deps.http, { apiBase: deps.bases.api, token: polled.token, signal })
      if (login === null) error = NO_LOGIN
      else if (!signal.aborted) {
        const saved = await deps.store.write({ token: polled.token, login })
        if (!saved.ok) error = saved.reason
        else if (signal.aborted) await deps.store.clear()
      }
    }
    if (pending !== entry) return
    pending = null
    settle(error)
  }

  async function start(): Promise<GithubAuthStatus> {
    const clientId = (await deps.clientId()).trim()
    if (!clientId) return settle(NOT_READY)
    if (!deps.store.available()) return settle(NO_SAFE_STORAGE)
    const abort = new AbortController()
    const r = await requestDeviceCode(deps.http, { webBase: deps.bases.web, clientId })
    if (!r.ok) return settle(messageOf(r))
    const entry: Pending = { code: r.code, clientId, expiresAt: new Date(now() + r.code.expiresIn * 1000).toISOString(), abort }
    pending = entry
    void finish(entry).catch(() => {
      if (pending === entry) { pending = null; settle(messageOf({ ok: false, failure: 'error', detail: 'internal' })) }
    })
    return settle(null)
  }

  return {
    status,
    connect() {
      if (pending) return Promise.resolve(status())
      starting ??= start().finally(() => { starting = null })
      return starting
    },
    cancel() {
      if (!pending) return status()
      pending.abort.abort()
      pending = null
      return settle(CANCELLED)
    },
    async disconnect() {
      pending?.abort.abort()
      pending = null
      await deps.store.clear()
      return settle(null)
    },
    async openVerification() {
      if (!pending) return { ok: false, error: '진행 중인 연결이 없어요' }
      const uri = pending.code.verificationUri
      if (!sameOrigin(uri, deps.bases.web)) return { ok: false, error: '확인 주소가 연결 대상이 아니라 열지 않았어요' }
      try {
        await deps.openExternal(uri)
        return { ok: true }
      } catch {
        return { ok: false, error: '브라우저를 열지 못했어요' }
      }
    },
  }
}
