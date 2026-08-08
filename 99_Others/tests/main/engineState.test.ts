import { describe, it, expect } from 'vitest'

const { getEngineState } = await import('../../../02_Source/main/07_engine/engineState')

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

const VALID_CREDS_WITH_TOKEN = JSON.stringify({
  claudeAiOauth: { accessToken: 'mock-access-token-do-not-expose' }
})

const CREDS_EMPTY_TOKEN = JSON.stringify({
  claudeAiOauth: { accessToken: '' }
})

const CREDS_NO_TOKEN = JSON.stringify({
  claudeAiOauth: {}
})

const NO_ENV: Record<string, string | undefined> = {}

const ENV_WITH_KEY: Record<string, string | undefined> = {
  ANTHROPIC_API_KEY: 'sk-ant-mock-key'
}

describe('getEngineState()', () => {

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

  describe('graceful 경로 — 오류 시 안전 응답', () => {
    it('credentials 파싱 실패(잘못된 JSON) → env만으로 authed 판정', async () => {
      const state = await getEngineState({
        isAvailable: async () => true,
        getVersion: async () => '1.0.0',
        readCredentials: () => 'NOT_VALID_JSON{{{{',
        env: ENV_WITH_KEY,
      })
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

  describe('기본 deps 사용 (인수 미전달)', () => {
    it('deps 없이 호출해도 throw 없이 EngineState 반환', async () => {
      const state = await getEngineState()
      expect(typeof state.available).toBe('boolean')
      expect(typeof state.authed).toBe('boolean')
      expect(state.version === null || typeof state.version === 'string').toBe(true)
      expect(hasSensitiveField(state)).toBe(false)
    })
  })
})
