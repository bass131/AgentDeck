import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// M05 G11: engineState와 usage가 각자 갖던 credentials 파일 읽기(~/.claude/.credentials.json)를 한 곳으로 모은다.
// 두 소비처의 기본 경로(readCredentials 미주입)를 홈 디렉터리만 바꿔 실물 파일로 고정한다. 토큰 추출 규칙은 각자 다르고 그대로 둔다.
const h = vi.hoisted(() => ({ home: '' }))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  const homedir = (): string => h.home
  return { ...actual, homedir, default: { ...actual, homedir } }
})

import { getEngineState } from '@main/10_Engine/engineState'
import { getUsage, resetUsageCache } from '@main/10_Engine/usage'
import { readClaudeCredentials } from '@main/10_Engine/credentials'

function writeCreds(content: string): void {
  fs.mkdirSync(path.join(h.home, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(h.home, '.claude', '.credentials.json'), content, 'utf8')
}

async function authedByDefault(): Promise<boolean> {
  const s = await getEngineState({ isAvailable: async () => true, getVersion: async () => null, env: {} })
  return s.authed
}

function makeFetch(): { fn: (url: string, init?: RequestInit) => Promise<Response>; calls: Array<RequestInit | undefined> } {
  const calls: Array<RequestInit | undefined> = []
  return {
    calls,
    fn: async (_url, init) => {
      calls.push(init)
      return { ok: true, json: async () => ({ five_hour: { utilization: 10 } }) } as Response
    },
  }
}

beforeEach(() => {
  h.home = fs.mkdtempSync(path.join(os.tmpdir(), 'g11-creds-'))
  resetUsageCache()
})

afterEach(() => {
  fs.rmSync(h.home, { recursive: true, force: true })
})

describe('readClaudeCredentials() — 한 곳으로 모은 파일 읽기', () => {
  it('파일이 없으면 null', () => {
    expect(readClaudeCredentials()).toBeNull()
  })

  it('파일이 있으면 원문을 그대로 돌려준다(파싱하지 않는다)', () => {
    writeCreds('{not json')
    expect(readClaudeCredentials()).toBe('{not json')
  })
})

describe('engineState 기본 credentials 읽기', () => {
  it('파일이 없으면 authed=false', async () => {
    expect(await authedByDefault()).toBe(false)
  })

  it('accessToken이 비어 있지 않은 문자열이면 authed=true', async () => {
    writeCreds(JSON.stringify({ claudeAiOauth: { accessToken: 'tok' } }))
    expect(await authedByDefault()).toBe(true)
  })

  it('accessToken이 빈 문자열이거나 문자열이 아니면 authed=false', async () => {
    writeCreds(JSON.stringify({ claudeAiOauth: { accessToken: '' } }))
    expect(await authedByDefault()).toBe(false)
    writeCreds(JSON.stringify({ claudeAiOauth: { accessToken: 42 } }))
    expect(await authedByDefault()).toBe(false)
  })

  it('JSON이 깨졌으면 authed=false', async () => {
    writeCreds('{not json')
    expect(await authedByDefault()).toBe(false)
  })
})

describe('usage 기본 credentials 읽기', () => {
  it('파일이 없으면 빈 결과이고 fetch를 부르지 않는다', async () => {
    const f = makeFetch()
    const r = await getUsage({ fetchFn: f.fn, forceRefresh: true })
    expect(r).toEqual({ fiveHour: null, weekly: null })
    expect(f.calls).toHaveLength(0)
  })

  it('토큰이 있으면 그 토큰으로 Bearer 헤더를 단다', async () => {
    writeCreds(JSON.stringify({ claudeAiOauth: { accessToken: 'tok-1' } }))
    const f = makeFetch()
    const r = await getUsage({ fetchFn: f.fn, forceRefresh: true })
    expect(f.calls).toHaveLength(1)
    expect((f.calls[0]?.headers as Record<string, string>).Authorization).toBe('Bearer tok-1')
    expect(r.fiveHour?.pct).toBe(10)
  })

  it('비문자열 truthy 토큰도 통과한다(usage는 truthy만 본다 — engineState와 다르다)', async () => {
    writeCreds(JSON.stringify({ claudeAiOauth: { accessToken: 42 } }))
    const f = makeFetch()
    await getUsage({ fetchFn: f.fn, forceRefresh: true })
    expect((f.calls[0]?.headers as Record<string, string>).Authorization).toBe('Bearer 42')
  })

  it('JSON이 깨졌으면 빈 결과', async () => {
    writeCreds('{not json')
    const f = makeFetch()
    expect(await getUsage({ fetchFn: f.fn, forceRefresh: true })).toEqual({ fiveHour: null, weekly: null })
    expect(f.calls).toHaveLength(0)
  })
})
