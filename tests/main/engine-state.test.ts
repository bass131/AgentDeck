/**
 * engine-state.test.ts — getEngineState() 단위 테스트 (P3 폴리싱)
 *
 * 테스트 전략 (TDD — 실패 먼저):
 *   1. fs.read·isAvailable·getVersion·env 를 주입형(deps)으로 받아 Electron 없이 테스트.
 *   2. 신뢰경계 핵심: 반환 EngineState에 token/accessToken/apiKey/secret 평문 없음을 런타임 검사.
 *   3. authed 조합 (credentials accessToken × env.ANTHROPIC_API_KEY) 4가지.
 *   4. graceful 경로 (파일 없음·파싱 실패·isAvailable throw·getVersion throw).
 *   5. available/version 매핑.
 *
 * CRITICAL(신뢰경계 ADR-008):
 *   - 반환 객체의 모든 키를 재귀 순회하여 민감 필드 0 검증.
 *   - authed는 불리언만 — 자격증명 값 노출 금지.
 */

import { describe, it, expect } from 'vitest'

// ── 실 구현 import (TDD: 파일이 없으면 여기서 실패) ──────────────────────────────
const { getEngineState } = await import('../../src/main/engine-state')

// ── 헬퍼: 신뢰경계 검증 ────────────────────────────────────────────────────────

/**
 * EngineState 객체를 재귀 순회하여 토큰/시크릿 관련 키 존재 여부를 검사한다.
 * CRITICAL(ADR-008): 반환 객체에 token/accessToken/apiKey/secret/key/credential 필드가 없어야 한다.
 */
function hasSensitiveField(obj: unknown): boolean {
  if (obj === null || obj === undefined) return false
  if (typeof obj !== 'object') return false
  const sensitiveKeys = ['token', 'secret', 'accessToken', 'access_token', 'apiKey', 'api_key', 'key', 'credential']
  for (const k of Object.keys(obj as Record<string, unknown>)) {
    if (sensitiveKeys.some((s) => k.toLowerCase().includes(s))) return true
    if (hasSensitiveField((obj as Record<string, unknown>)[k])) return true
  }
  return false
}

// ── 픽스처 ────────────────────────────────────────────────────────────────────

/** credentials.json — accessToken 있음 */
const VALID_CREDS_WITH_TOKEN = JSON.stringify({
  claudeAiOauth: { accessToken: 'mock-access-token-do-not-expose' }
})

/** credentials.json — accessToken 빈 문자열 (미인증) */
const CREDS_EMPTY_TOKEN = JSON.stringify({
  claudeAiOauth: { accessToken: '' }
})

/** credentials.json — accessToken 필드 없음 */
const CREDS_NO_TOKEN = JSON.stringify({
  claudeAiOauth: {}
})

/** env 없음 (빈 객체) */
const NO_ENV: Record<string, string | undefined> = {}

/** env에 ANTHROPIC_API_KEY 있음 */
const ENV_WITH_KEY: Record<string, string | undefined> = {
  ANTHROPIC_API_KEY: 'sk-ant-mock-key'
}

// ══════════════════════════════════════════════════════════════════════════════
describe('getEngineState()', () => {

  // ── authed 조합 4가지 ──────────────────────────────────────────────────────

  describe('authed 판정 — credentials × env 조합', () => {
    it('[credentials O, env X] — authed=true', async () => {
      const state = await getEngineState({
        isAvailable: async () => true,
        getVersion: async () => '1.0.0',
        readCredentials: () => VALID_CREDS_WITH_TOKEN,
        env: NO_ENV,
      })
      expect(state.authed).toBe(true)
    })

    it('[credentials X(null), env O] — authed=true', async () => {
      const state = await getEngineState({
        isAvailable: async () => true,
        getVersion: async () => '1.0.0',
        readCredentials: () => null,
        env: ENV_WITH_KEY,
      })
      expect(state.authed).toBe(true)
    })

    it('[credentials X(null), env X] — authed=false', async () => {
      const state = await getEngineState({
        isAvailable: async () => true,
        getVersion: async () => '1.0.0',
        readCredentials: () => null,
        env: NO_ENV,
      })
      expect(state.authed).toBe(false)
    })

    it('[credentials O, env O] — authed=true (OR 조합)', async () => {
      const state = await getEngineState({
        isAvailable: async () => true,
        getVersion: async () => '1.0.0',
        readCredentials: () => VALID_CREDS_WITH_TOKEN,
        env: ENV_WITH_KEY,
      })
      expect(state.authed).toBe(true)
    })

    it('[credentials 빈 토큰(""), env X] — authed=false', async () => {
      const state = await getEngineState({
        isAvailable: async () => true,
        getVersion: async () => '1.0.0',
        readCredentials: () => CREDS_EMPTY_TOKEN,
        env: NO_ENV,
      })
      expect(state.authed).toBe(false)
    })

    it('[credentials 토큰 필드 없음, env X] — authed=false', async () => {
      const state = await getEngineState({
        isAvailable: async () => true,
        getVersion: async () => '1.0.0',
        readCredentials: () => CREDS_NO_TOKEN,
        env: NO_ENV,
      })
      expect(state.authed).toBe(false)
    })
  })

  // ── graceful 경로 ──────────────────────────────────────────────────────────

  describe('graceful 경로 — 오류 시 안전 응답', () => {
    it('credentials 파싱 실패(잘못된 JSON) → env만으로 authed 판정', async () => {
      const state = await getEngineState({
        isAvailable: async () => true,
        getVersion: async () => '1.0.0',
        readCredentials: () => 'NOT_VALID_JSON{{{{',
        env: ENV_WITH_KEY,
      })
      // 파일 파싱 실패 → env.ANTHROPIC_API_KEY 있음 → authed=true
      expect(state.authed).toBe(true)
    })

    it('credentials 파싱 실패, env 없음 → authed=false', async () => {
      const state = await getEngineState({
        isAvailable: async () => true,
        getVersion: async () => '1.0.0',
        readCredentials: () => 'INVALID_JSON',
        env: NO_ENV,
      })
      expect(state.authed).toBe(false)
    })

    it('readCredentials 가 throw → graceful(env만 판정)', async () => {
      const state = await getEngineState({
        isAvailable: async () => true,
        getVersion: async () => '1.0.0',
        readCredentials: () => { throw new Error('ENOENT') },
        env: ENV_WITH_KEY,
      })
      expect(state.authed).toBe(true)
    })

    it('readCredentials throw, env 없음 → authed=false', async () => {
      const state = await getEngineState({
        isAvailable: async () => true,
        getVersion: async () => '1.0.0',
        readCredentials: () => { throw new Error('ENOENT') },
        env: NO_ENV,
      })
      expect(state.authed).toBe(false)
    })

    it('isAvailable throw → available=false, graceful', async () => {
      const state = await getEngineState({
        isAvailable: async () => { throw new Error('SDK not found') },
        getVersion: async () => '1.0.0',
        readCredentials: () => VALID_CREDS_WITH_TOKEN,
        env: NO_ENV,
      })
      expect(state.available).toBe(false)
    })

    it('getVersion throw → version=null, graceful', async () => {
      const state = await getEngineState({
        isAvailable: async () => true,
        getVersion: async () => { throw new Error('version error') },
        readCredentials: () => VALID_CREDS_WITH_TOKEN,
        env: NO_ENV,
      })
      expect(state.version).toBeNull()
    })

    it('getVersion → null 반환 시 version=null', async () => {
      const state = await getEngineState({
        isAvailable: async () => true,
        getVersion: async () => null,
        readCredentials: () => VALID_CREDS_WITH_TOKEN,
        env: NO_ENV,
      })
      expect(state.version).toBeNull()
    })
  })

  // ── available / version 매핑 ───────────────────────────────────────────────

  describe('available / version 매핑', () => {
    it('isAvailable()=true → available=true', async () => {
      const state = await getEngineState({
        isAvailable: async () => true,
        getVersion: async () => '0.3.186',
        readCredentials: () => null,
        env: NO_ENV,
      })
      expect(state.available).toBe(true)
    })

    it('isAvailable()=false → available=false', async () => {
      const state = await getEngineState({
        isAvailable: async () => false,
        getVersion: async () => null,
        readCredentials: () => null,
        env: NO_ENV,
      })
      expect(state.available).toBe(false)
    })

    it('getVersion()="0.3.186" → version="0.3.186"', async () => {
      const state = await getEngineState({
        isAvailable: async () => true,
        getVersion: async () => '0.3.186',
        readCredentials: () => null,
        env: NO_ENV,
      })
      expect(state.version).toBe('0.3.186')
    })

    it('getVersion()=null → version=null', async () => {
      const state = await getEngineState({
        isAvailable: async () => false,
        getVersion: async () => null,
        readCredentials: () => null,
        env: NO_ENV,
      })
      expect(state.version).toBeNull()
    })
  })

  // ── CRITICAL: 신뢰경계 — 토큰 미노출 (ADR-008) ─────────────────────────────

  describe('신뢰경계 — 반환 객체에 토큰/시크릿 없음 (ADR-008)', () => {
    it('정상 응답 반환값에 token/accessToken/apiKey/secret 관련 키가 없다', async () => {
      const state = await getEngineState({
        isAvailable: async () => true,
        getVersion: async () => '1.0.0',
        readCredentials: () => VALID_CREDS_WITH_TOKEN,
        env: ENV_WITH_KEY,
      })
      expect(hasSensitiveField(state)).toBe(false)
    })

    it('available=false 응답에도 민감 필드 없다', async () => {
      const state = await getEngineState({
        isAvailable: async () => false,
        getVersion: async () => null,
        readCredentials: () => null,
        env: NO_ENV,
      })
      expect(hasSensitiveField(state)).toBe(false)
    })

    it('반환 객체의 최상위 키는 available·authed·version 3개만이다', async () => {
      const state = await getEngineState({
        isAvailable: async () => true,
        getVersion: async () => '1.0.0',
        readCredentials: () => VALID_CREDS_WITH_TOKEN,
        env: NO_ENV,
      })
      const keys = Object.keys(state as object).sort()
      expect(keys).toEqual(['authed', 'available', 'version'])
    })

    it('authed 필드는 불리언 타입이다 (문자열·객체·토큰 값이 아님)', async () => {
      const state = await getEngineState({
        isAvailable: async () => true,
        getVersion: async () => '1.0.0',
        readCredentials: () => VALID_CREDS_WITH_TOKEN,
        env: ENV_WITH_KEY,
      })
      expect(typeof state.authed).toBe('boolean')
    })

    it('version 필드는 string 또는 null이다 (토큰 값 아님)', async () => {
      const state = await getEngineState({
        isAvailable: async () => true,
        getVersion: async () => '1.0.0',
        readCredentials: () => null,
        env: NO_ENV,
      })
      expect(state.version === null || typeof state.version === 'string').toBe(true)
    })
  })

  // ── 기본 deps (실 프로덕션 경로 — 인수 미전달) ──────────────────────────────

  describe('기본 deps 사용 (인수 미전달)', () => {
    it('deps 없이 호출해도 throw 없이 EngineState 반환', async () => {
      // 실 fs/SDK/env를 사용 — 환경마다 결과 다를 수 있으나 shape는 일정해야 함
      const state = await getEngineState()
      expect(typeof state.available).toBe('boolean')
      expect(typeof state.authed).toBe('boolean')
      expect(state.version === null || typeof state.version === 'string').toBe(true)
      // 신뢰경계: 어떤 경우에도 민감 필드 없음
      expect(hasSensitiveField(state)).toBe(false)
    })
  })
})
