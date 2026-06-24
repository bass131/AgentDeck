/**
 * engine-check-update.test.ts — ENGINE_CHECK_UPDATE 핸들러 단위 테스트 (TDD)
 *
 * 테스트 전략:
 *   - backend mock 주입으로 electron/IPC 의존 없이 순수 로직 테스트.
 *   - cmpVer 헬퍼 직접 단위 테스트.
 *   - graceful: backend 메서드 throw 시 updateAvailable=false (앱 부트 블록 금지).
 *   - 신뢰경계(ADR-008): 반환 EngineUpdateInfo에 버전 문자열·boolean 3개 필드만.
 *
 * TDD 순서: 이 파일 작성(실패) → 구현(통과).
 */

import { describe, it, expect } from 'vitest'

// ── 실 구현 import (TDD: 파일이 없으면 여기서 실패) ───────────────────────────
const { cmpVer, checkEngineUpdate } = await import('../../src/main/ipc/engine-check-update')

// ══════════════════════════════════════════════════════════════════════════════
// cmpVer — numeric semver-ish 비교 헬퍼
// ══════════════════════════════════════════════════════════════════════════════

describe('cmpVer()', () => {
  it('current < latest → 음수 반환 (예: 0.3.186 < 0.3.187)', () => {
    expect(cmpVer('0.3.186', '0.3.187')).toBeLessThan(0)
  })

  it('current > latest → 양수 반환 (예: 0.4.0 > 0.3.999)', () => {
    expect(cmpVer('0.4.0', '0.3.999')).toBeGreaterThan(0)
  })

  it('current === latest → 0 반환', () => {
    expect(cmpVer('1.2.3', '1.2.3')).toBe(0)
  })

  it('major 비교: 1.0.0 > 0.9.9', () => {
    expect(cmpVer('1.0.0', '0.9.9')).toBeGreaterThan(0)
  })

  it('major 비교: 0.9.9 < 1.0.0', () => {
    expect(cmpVer('0.9.9', '1.0.0')).toBeLessThan(0)
  })

  it('minor 비교: 0.4.0 > 0.3.999', () => {
    expect(cmpVer('0.4.0', '0.3.999')).toBeGreaterThan(0)
  })

  it('patch 비교: 0.3.187 > 0.3.186', () => {
    expect(cmpVer('0.3.187', '0.3.186')).toBeGreaterThan(0)
  })

  it('동일 버전 0.0.0 → 0', () => {
    expect(cmpVer('0.0.0', '0.0.0')).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// checkEngineUpdate() — 핸들러 로직
// ══════════════════════════════════════════════════════════════════════════════

/** AgentBackend mock 팩토리 */
function makeBackend(
  version: () => Promise<string | null>,
  latestVersion: () => Promise<string | null>
) {
  return { version, latestVersion }
}

describe('checkEngineUpdate()', () => {
  // ── updateAvailable 합성 ───────────────────────────────────────────────────

  it('current < latest → updateAvailable=true (예: 0.3.186 < 0.4.0)', async () => {
    const backend = makeBackend(
      async () => '0.3.186',
      async () => '0.4.0'
    )
    const result = await checkEngineUpdate(backend)
    expect(result.current).toBe('0.3.186')
    expect(result.latest).toBe('0.4.0')
    expect(result.updateAvailable).toBe(true)
  })

  it('current === latest → updateAvailable=false', async () => {
    const backend = makeBackend(
      async () => '0.3.186',
      async () => '0.3.186'
    )
    const result = await checkEngineUpdate(backend)
    expect(result.updateAvailable).toBe(false)
  })

  it('current > latest → updateAvailable=false (다운그레이드 아님)', async () => {
    const backend = makeBackend(
      async () => '0.4.0',
      async () => '0.3.186'
    )
    const result = await checkEngineUpdate(backend)
    expect(result.updateAvailable).toBe(false)
  })

  it('current=null → updateAvailable=false (graceful)', async () => {
    const backend = makeBackend(
      async () => null,
      async () => '0.4.0'
    )
    const result = await checkEngineUpdate(backend)
    expect(result.current).toBeNull()
    expect(result.updateAvailable).toBe(false)
  })

  it('latest=null → updateAvailable=false (graceful)', async () => {
    const backend = makeBackend(
      async () => '0.3.186',
      async () => null
    )
    const result = await checkEngineUpdate(backend)
    expect(result.latest).toBeNull()
    expect(result.updateAvailable).toBe(false)
  })

  it('current=null AND latest=null → updateAvailable=false (graceful)', async () => {
    const backend = makeBackend(
      async () => null,
      async () => null
    )
    const result = await checkEngineUpdate(backend)
    expect(result.current).toBeNull()
    expect(result.latest).toBeNull()
    expect(result.updateAvailable).toBe(false)
  })

  // ── graceful: backend throw ────────────────────────────────────────────────

  it('backend.version() throw → graceful: current=null, updateAvailable=false', async () => {
    const backend = makeBackend(
      async () => { throw new Error('SDK not found') },
      async () => '0.4.0'
    )
    const result = await checkEngineUpdate(backend)
    expect(result.current).toBeNull()
    expect(result.updateAvailable).toBe(false)
  })

  it('backend.latestVersion() throw → graceful: latest=null, updateAvailable=false', async () => {
    const backend = makeBackend(
      async () => '0.3.186',
      async () => { throw new Error('network error') }
    )
    const result = await checkEngineUpdate(backend)
    expect(result.latest).toBeNull()
    expect(result.updateAvailable).toBe(false)
  })

  it('양쪽 모두 throw → graceful: current=null, latest=null, updateAvailable=false', async () => {
    const backend = makeBackend(
      async () => { throw new Error('error A') },
      async () => { throw new Error('error B') }
    )
    const result = await checkEngineUpdate(backend)
    expect(result.current).toBeNull()
    expect(result.latest).toBeNull()
    expect(result.updateAvailable).toBe(false)
  })

  // ── 신뢰경계: 반환 타입 검증 ─────────────────────────────────────────────

  it('반환 객체의 최상위 키는 current·latest·updateAvailable 3개만이다', async () => {
    const backend = makeBackend(
      async () => '0.3.186',
      async () => '0.4.0'
    )
    const result = await checkEngineUpdate(backend)
    const keys = Object.keys(result).sort()
    expect(keys).toEqual(['current', 'latest', 'updateAvailable'])
  })

  it('updateAvailable 필드는 boolean 타입이다', async () => {
    const backend = makeBackend(
      async () => '0.3.186',
      async () => '0.4.0'
    )
    const result = await checkEngineUpdate(backend)
    expect(typeof result.updateAvailable).toBe('boolean')
  })

  it('current 필드는 string 또는 null이다', async () => {
    const backend = makeBackend(
      async () => '0.3.186',
      async () => '0.4.0'
    )
    const result = await checkEngineUpdate(backend)
    expect(result.current === null || typeof result.current === 'string').toBe(true)
  })

  it('latest 필드는 string 또는 null이다', async () => {
    const backend = makeBackend(
      async () => '0.3.186',
      async () => '0.4.0'
    )
    const result = await checkEngineUpdate(backend)
    expect(result.latest === null || typeof result.latest === 'string').toBe(true)
  })

  // ── 빈 문자열 엣지 케이스 ─────────────────────────────────────────────────

  it('current가 빈 문자열("") → updateAvailable=false (null과 동일 처리)', async () => {
    const backend = makeBackend(
      async () => '',
      async () => '0.4.0'
    )
    const result = await checkEngineUpdate(backend)
    expect(result.updateAvailable).toBe(false)
  })

  it('latest가 빈 문자열("") → updateAvailable=false', async () => {
    const backend = makeBackend(
      async () => '0.3.186',
      async () => ''
    )
    const result = await checkEngineUpdate(backend)
    expect(result.updateAvailable).toBe(false)
  })
})
