import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'

type FetchImpl = typeof fetch

function makeOkFetch(body: unknown): FetchImpl {
  return async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    return {
      ok: true,
      json: async () => body
    } as Response
  }
}

function makeNotOkFetch(status: number): FetchImpl {
  return async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    return {
      ok: false,
      status
    } as Response
  }
}

function makeThrowFetch(err: Error): FetchImpl {
  return async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    throw err
  }
}

function makeAbortFetch(): FetchImpl {
  return async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const err = new Error('The operation was aborted.')
    err.name = 'AbortError'
    throw err
  }
}

function makeMalformedFetch(body: unknown): FetchImpl {
  return async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    return {
      ok: true,
      json: async () => body
    } as Response
  }
}

function makePkgVersionProvider(ver: string): () => string | null {
  return () => ver
}

function makeFailPkgVersionProvider(): () => string | null {
  return () => { throw new Error('package.json not found') }
}

describe('ClaudeCodeBackend.latestVersion()', () => {
  it('(가) mock fetch가 dist-tags.latest=0.4.0 반환 → latestVersion()===0.4.0', async () => {
    const mockBody = {
      'dist-tags': { latest: '0.4.0' },
      versions: { '0.4.0': {} }
    }
    const backend = new ClaudeCodeBackend(undefined, undefined, undefined, {
      fetchImpl: makeOkFetch(mockBody)
    })
    const result = await backend.latestVersion()
    expect(result).toBe('0.4.0')
  })

  it('(나) mock fetch가 AbortError throw(타임아웃 시뮬) → null', async () => {
    const backend = new ClaudeCodeBackend(undefined, undefined, undefined, {
      fetchImpl: makeAbortFetch()
    })
    const result = await backend.latestVersion()
    expect(result).toBeNull()
  })

  it('(다) mock fetch가 네트워크 오류 throw → null', async () => {
    const backend = new ClaudeCodeBackend(undefined, undefined, undefined, {
      fetchImpl: makeThrowFetch(new Error('ECONNREFUSED'))
    })
    const result = await backend.latestVersion()
    expect(result).toBeNull()
  })

  it('(라-1) dist-tags 필드 없는 JSON → null', async () => {
    const backend = new ClaudeCodeBackend(undefined, undefined, undefined, {
      fetchImpl: makeMalformedFetch({ name: '@anthropic-ai/claude-agent-sdk' })
    })
    const result = await backend.latestVersion()
    expect(result).toBeNull()
  })

  it('(라-2) dist-tags.latest가 문자열이 아닌 경우 → null', async () => {
    const backend = new ClaudeCodeBackend(undefined, undefined, undefined, {
      fetchImpl: makeOkFetch({ 'dist-tags': { latest: 42 } })
    })
    const result = await backend.latestVersion()
    expect(result).toBeNull()
  })

  it('(라-3) non-OK HTTP 응답(404) → null', async () => {
    const backend = new ClaudeCodeBackend(undefined, undefined, undefined, {
      fetchImpl: makeNotOkFetch(404)
    })
    const result = await backend.latestVersion()
    expect(result).toBeNull()
  })

  it('(라-4) json() 파싱 실패(throw) → null', async () => {
    const throwingJsonFetch: FetchImpl = async () => ({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token') }
    } as unknown as Response)
    const backend = new ClaudeCodeBackend(undefined, undefined, undefined, {
      fetchImpl: throwingJsonFetch
    })
    const result = await backend.latestVersion()
    expect(result).toBeNull()
  })
})

describe('ClaudeCodeBackend.version()', () => {
  it('resolvePackageVersion 주입이 버전 반환 → 그 버전', async () => {
    const backend = new ClaudeCodeBackend(undefined, undefined, undefined, {
      resolvePackageVersion: makePkgVersionProvider('1.2.3')
    })
    const result = await backend.version()
    expect(result).toBe('1.2.3')
  })

  it('resolvePackageVersion 주입이 실패(throw) → fallback SDK_VERSION(0.3.186)', async () => {
    const backend = new ClaudeCodeBackend(undefined, undefined, undefined, {
      resolvePackageVersion: makeFailPkgVersionProvider()
    })
    const result = await backend.version()
    expect(result).toBe('0.3.186')
  })

  it('resolvePackageVersion 미주입(기본값) → null 아님(버전 문자열 반환)', async () => {
    const backend = new ClaudeCodeBackend()
    const result = await backend.version()
    expect(typeof result).toBe('string')
    expect(result).not.toBeNull()
  })
})
