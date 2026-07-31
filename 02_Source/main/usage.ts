import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { UsageInfo, UsageWindow } from '../shared/ipcContract'

const USAGE_TTL = 5 * 60 * 1000

let usageCache: { at: number; data: UsageInfo } | null = null

export function resetUsageCache(): void {
  usageCache = null
}

function toTs(s?: string): number | null {
  if (!s) return null
  const ms = Date.parse(s)
  return isNaN(ms) ? null : Math.floor(ms / 1000)
}

function win(o?: { utilization?: number | string; resets_at?: string }): UsageWindow | null {
  if (!o) return null
  const raw = parseFloat(String(o.utilization ?? 0)) || 0
  const pct = Math.max(0, Math.min(100, Math.round(raw)))
  const resetsAt = toTs(o.resets_at)
  return { pct, resetsAt }
}

function defaultReadCredentials(): string | null {
  try {
    return readFileSync(join(homedir(), '.claude', '.credentials.json'), 'utf8')
  } catch {
    return null
  }
}

export interface UsageDeps {
  readCredentials?: () => string | null
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>
  forceRefresh?: boolean
  nowOverride?: number
}

export async function getUsage(deps?: UsageDeps): Promise<UsageInfo> {
  const empty: UsageInfo = { fiveHour: null, weekly: null }

  const readCreds = deps?.readCredentials ?? defaultReadCredentials
  type FetchFn = (url: string, init?: RequestInit) => Promise<Response>
  const fetchImpl: FetchFn = deps?.fetchFn ?? (globalThis.fetch as FetchFn)
  const now = deps?.nowOverride ?? Date.now()

  if (!deps?.forceRefresh && usageCache && (now - usageCache.at) < USAGE_TTL) {
    return usageCache.data
  }

  let token: string | undefined
  try {
    const raw = readCreds()
    if (!raw) return empty
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const creds: any = JSON.parse(raw)
    token = creds?.claudeAiOauth?.accessToken
  } catch {
    return empty
  }

  if (!token) return empty

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)

    const res = await fetchImpl!(
      'https://api.anthropic.com/api/oauth/usage',
      {
        headers: {
          Authorization: 'Bearer ' + token,
          'anthropic-beta': 'oauth-2025-04-20'
        },
        signal: ctrl.signal
      }
    )
    clearTimeout(timer)

    if (!res.ok) return empty

    const j = (await res.json()) as Record<
      string,
      { utilization?: number | string; resets_at?: string } | undefined
    >

    const data: UsageInfo = {
      fiveHour: win(j.five_hour),
      weekly: win(j.seven_day)
    }

    usageCache = { at: now, data }

    return data
  } catch {
    return empty
  }
}
