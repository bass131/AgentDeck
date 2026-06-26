/**
 * claude-latest-version.test.ts — ClaudeCodeBackend.latestVersion() + version() 단위 테스트
 *
 * TDD: 실패 먼저. 구현 전에 이 파일을 실행하면 latestVersion 메서드 미존재로 실패한다.
 *
 * 신뢰경계(ADR-008):
 *  - 반환값은 버전 문자열 또는 null만. 토큰/키 0.
 *  - fetch는 ClaudeCodeBackend 내부(main)에서만 호출.
 *  - 테스트는 fetchImpl 주입으로 실 네트워크 의존 0.
 *
 * ADR-003: npm 패키지명·registry URL은 ClaudeCodeBackend 내부에만.
 *  - 이 테스트는 URL을 알 필요 없이 mock fetch 주입으로만 동작.
 */

import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../src/main/01_agents/ClaudeCodeBackend'

// ── FetchImpl 타입 별칭 ────────────────────────────────────────────────────────

/**
 * fetchImpl 주입용 타입 — ClaudeCodeBackend.fetchImpl 필드와 동일.
 * Node 타입 환경의 globalThis.fetch 시그니처에 맞춘다.
 */
type FetchImpl = typeof fetch

// ── mock fetch 헬퍼 ────────────────────────────────────────────────────────────

/**
 * 주어진 JSON 응답을 반환하는 fetch mock 생성.
 * ClaudeCodeBackend 생성자의 fetchImpl 파라미터로 주입.
 */
function makeOkFetch(body: unknown): FetchImpl {
  return async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    return {
      ok: true,
      json: async () => body
    } as Response
  }
}

/**
 * non-OK 상태코드를 반환하는 fetch mock.
 */
function makeNotOkFetch(status: number): FetchImpl {
  return async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    return {
      ok: false,
      status
    } as Response
  }
}

/**
 * throw하는 fetch mock (네트워크 오류 시뮬).
 */
function makeThrowFetch(err: Error): FetchImpl {
  return async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    throw err
  }
}

/**
 * AbortError를 즉시 throw하는 fetch mock (타임아웃/abort 시뮬).
 * signal을 무시하고 즉시 AbortError를 던진다.
 */
function makeAbortFetch(): FetchImpl {
  return async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const err = new Error('The operation was aborted.')
    err.name = 'AbortError'
    throw err
  }
}

/**
 * 비정상 JSON을 반환하는 fetch mock (dist-tags 부재).
 */
function makeMalformedFetch(body: unknown): FetchImpl {
  return async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    return {
      ok: true,
      json: async () => body
    } as Response
  }
}

// ── 가짜 require 주입 헬퍼 ────────────────────────────────────────────────────

/**
 * package.json 읽기용 resolvePackageVersion 주입 함수 — 정상 케이스.
 */
function makePkgVersionProvider(ver: string): () => string | null {
  return () => ver
}

/**
 * package.json 읽기 실패용 resolvePackageVersion 주입 함수.
 */
function makeFailPkgVersionProvider(): () => string | null {
  return () => { throw new Error('package.json not found') }
}

// ── (가) 정상 응답 → latest 버전 반환 ─────────────────────────────────────────

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

  // ── (나) 타임아웃(AbortError) → null ─────────────────────────────────────────

  it('(나) mock fetch가 AbortError throw(타임아웃 시뮬) → null', async () => {
    const backend = new ClaudeCodeBackend(undefined, undefined, undefined, {
      fetchImpl: makeAbortFetch()
    })
    const result = await backend.latestVersion()
    expect(result).toBeNull()
  })

  // ── (다) 네트워크 throw → null ────────────────────────────────────────────────

  it('(다) mock fetch가 네트워크 오류 throw → null', async () => {
    const backend = new ClaudeCodeBackend(undefined, undefined, undefined, {
      fetchImpl: makeThrowFetch(new Error('ECONNREFUSED'))
    })
    const result = await backend.latestVersion()
    expect(result).toBeNull()
  })

  // ── (라) 비정상 JSON/dist-tags 부재 → null ────────────────────────────────────

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

// ── version() 런타임 package.json 읽기 + fallback ──────────────────────────────

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
    // SDK_VERSION 상수 폴백: '0.3.186'
    expect(result).toBe('0.3.186')
  })

  it('resolvePackageVersion 미주입(기본값) → null 아님(버전 문자열 반환)', async () => {
    // 실 package.json 읽기 or fallback 상수 — 어느 쪽이든 string이어야 함
    const backend = new ClaudeCodeBackend()
    const result = await backend.version()
    expect(typeof result).toBe('string')
    expect(result).not.toBeNull()
  })
})
