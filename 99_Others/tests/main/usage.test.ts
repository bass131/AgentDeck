/**
 * usage.test.ts — getUsage() 단위 테스트 (Phase 26, B8)
 *
 * 테스트 전략(TDD — 실패 먼저):
 *   1. fs.read 함수 + fetch 함수를 주입형(의존성 주입)으로 받아 Electron 없이 테스트.
 *   2. 신뢰경계 핵심: 반환 UsageInfo에 token/secret/accessToken 평문 없음을 런타임 검사.
 *   3. graceful 경로(파일 없음·파싱 실패·토큰 없음·네트워크 오류) → {fiveHour:null, weekly:null}.
 *   4. TTL 캐시: 5분 내 재호출은 fetch 미재호출.
 *
 * CRITICAL(신뢰경계 ADR-008):
 *   - 테스트 내에서도 mock 토큰('mock-access-token')이 반환 객체에 절대 포함되지 않아야 함.
 *   - 반환 객체의 모든 키를 재귀 순회하여 토큰 관련 필드 0 검증.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetUsageCache } from '../../../02.Source/main/usage'

// ── import (구현 파일에서 로드) ──────────────────────────────────────────────
const { getUsage } = await import('../../../02.Source/main/usage')

// ── 헬퍼: 신뢰경계 검증 ────────────────────────────────────────────────────────

/**
 * UsageInfo 객체를 재귀 순회하여 토큰/시크릿 관련 키 존재 여부를 검사한다.
 * CRITICAL(ADR-008): 반환 객체에 token/secret/accessToken/key 필드가 없어야 한다.
 */
function hasSensitiveField(obj: unknown): boolean {
  if (obj === null || obj === undefined) return false
  if (typeof obj !== 'object') return false
  const sensitiveKeys = ['token', 'secret', 'accessToken', 'access_token', 'key', 'credential']
  for (const k of Object.keys(obj as Record<string, unknown>)) {
    if (sensitiveKeys.some((s) => k.toLowerCase().includes(s))) return true
    if (hasSensitiveField((obj as Record<string, unknown>)[k])) return true
  }
  return false
}

/**
 * mock Response 생성 헬퍼.
 * ok=true/false, json 바디를 지정하여 fetch mock 응답 생성.
 */
function makeResponse(ok: boolean, body: unknown): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
    status: ok ? 200 : 500,
  } as unknown as Response
}

/**
 * 정상 응답 바디 픽스처.
 * five_hour: utilization=42%, resets_at ISO 문자열.
 * seven_day: utilization=7%, resets_at ISO 문자열.
 */
const NORMAL_BODY = {
  five_hour: { utilization: 42, resets_at: '2026-06-24T10:00:00Z' },
  seven_day: { utilization: 7, resets_at: '2026-06-30T00:00:00Z' },
}

/** 정상 credentials.json 내용 픽스처 */
const VALID_CREDS = JSON.stringify({
  claudeAiOauth: { accessToken: 'mock-access-token' }
})

// ══════════════════════════════════════════════════════════════════════════════
describe('getUsage()', () => {

  // 각 테스트 전에 캐시 초기화 — 테스트 격리 보장
  beforeEach(() => {
    resetUsageCache()
  })

  // ── graceful 경로 ─────────────────────────────────────────────────────────

  describe('graceful 경로 — empty 반환', () => {
    it('credentials 파일이 없으면 {fiveHour:null, weekly:null}', async () => {
      const result = await getUsage({
        readCredentials: () => null, // 파일 없음 시뮬레이션
        fetchFn: vi.fn(), // 호출되면 안 됨
      })
      expect(result).toEqual({ fiveHour: null, weekly: null })
    })

    it('credentials JSON 파싱 실패 → {fiveHour:null, weekly:null}', async () => {
      const result = await getUsage({
        readCredentials: () => 'NOT_VALID_JSON{{{{',
        fetchFn: vi.fn(),
      })
      expect(result).toEqual({ fiveHour: null, weekly: null })
    })

    it('claudeAiOauth.accessToken 필드 없음 → {fiveHour:null, weekly:null}', async () => {
      const result = await getUsage({
        readCredentials: () => JSON.stringify({ claudeAiOauth: {} }),
        fetchFn: vi.fn(),
      })
      expect(result).toEqual({ fiveHour: null, weekly: null })
    })

    it('claudeAiOauth 자체 없음 → {fiveHour:null, weekly:null}', async () => {
      const result = await getUsage({
        readCredentials: () => JSON.stringify({}),
        fetchFn: vi.fn(),
      })
      expect(result).toEqual({ fiveHour: null, weekly: null })
    })

    it('readCredentials 가 throw 하면 → {fiveHour:null, weekly:null}', async () => {
      const result = await getUsage({
        readCredentials: () => { throw new Error('ENOENT') },
        fetchFn: vi.fn(),
      })
      expect(result).toEqual({ fiveHour: null, weekly: null })
    })

    it('fetch res.ok=false → {fiveHour:null, weekly:null}', async () => {
      const result = await getUsage({
        readCredentials: () => VALID_CREDS,
        fetchFn: async () => makeResponse(false, {}),
      })
      expect(result).toEqual({ fiveHour: null, weekly: null })
    })

    it('fetch 자체가 throw → {fiveHour:null, weekly:null}', async () => {
      const result = await getUsage({
        readCredentials: () => VALID_CREDS,
        fetchFn: async () => { throw new Error('network error') },
      })
      expect(result).toEqual({ fiveHour: null, weekly: null })
    })

    it('타임아웃(AbortError) → {fiveHour:null, weekly:null}', async () => {
      const result = await getUsage({
        readCredentials: () => VALID_CREDS,
        fetchFn: async (_url, init) => {
          // AbortSignal이 주입됐을 때 즉시 abort 시뮬레이션
          const signal = (init as RequestInit | undefined)?.signal as AbortSignal | undefined
          if (signal) {
            const err = new DOMException('AbortError', 'AbortError')
            throw err
          }
          throw new Error('no signal')
        },
      })
      expect(result).toEqual({ fiveHour: null, weekly: null })
    })
  })

  // ── 정상 응답 처리 ────────────────────────────────────────────────────────

  describe('정상 응답 변환', () => {
    it('five_hour utilization=42, seven_day utilization=7 → pct 42/7', async () => {
      const result = await getUsage({
        readCredentials: () => VALID_CREDS,
        fetchFn: async () => makeResponse(true, NORMAL_BODY),
      })
      expect(result.fiveHour).not.toBeNull()
      expect(result.weekly).not.toBeNull()
      expect(result.fiveHour!.pct).toBe(42)
      expect(result.weekly!.pct).toBe(7)
    })

    it('resetsAt은 ISO 문자열을 Date.parse/1000 한 unix seconds', async () => {
      const result = await getUsage({
        readCredentials: () => VALID_CREDS,
        fetchFn: async () => makeResponse(true, NORMAL_BODY),
      })
      const expectedFiveHour = Math.floor(Date.parse('2026-06-24T10:00:00Z') / 1000)
      const expectedWeekly = Math.floor(Date.parse('2026-06-30T00:00:00Z') / 1000)
      expect(result.fiveHour!.resetsAt).toBe(expectedFiveHour)
      expect(result.weekly!.resetsAt).toBe(expectedWeekly)
    })

    it('resets_at이 없으면 resetsAt=null', async () => {
      const result = await getUsage({
        readCredentials: () => VALID_CREDS,
        fetchFn: async () => makeResponse(true, {
          five_hour: { utilization: 10 },
          seven_day: { utilization: 20 },
        }),
      })
      expect(result.fiveHour!.resetsAt).toBeNull()
      expect(result.weekly!.resetsAt).toBeNull()
    })

    it('resets_at이 invalid ISO면 resetsAt=null', async () => {
      const result = await getUsage({
        readCredentials: () => VALID_CREDS,
        fetchFn: async () => makeResponse(true, {
          five_hour: { utilization: 10, resets_at: 'NOT_A_DATE' },
          seven_day: { utilization: 20, resets_at: 'ALSO_BAD' },
        }),
      })
      expect(result.fiveHour!.resetsAt).toBeNull()
      expect(result.weekly!.resetsAt).toBeNull()
    })

    it('응답 바디에 five_hour/seven_day 필드가 없으면 null', async () => {
      const result = await getUsage({
        readCredentials: () => VALID_CREDS,
        fetchFn: async () => makeResponse(true, {}),
      })
      expect(result.fiveHour).toBeNull()
      expect(result.weekly).toBeNull()
    })
  })

  // ── clamp 검증 ───────────────────────────────────────────────────────────

  describe('utilization clamp (0~100)', () => {
    it('utilization이 문자열 "42"이면 pct=42 (parseFloat 처리)', async () => {
      const result = await getUsage({
        readCredentials: () => VALID_CREDS,
        fetchFn: async () => makeResponse(true, {
          five_hour: { utilization: '42' },
          seven_day: { utilization: '7' },
        }),
      })
      expect(result.fiveHour!.pct).toBe(42)
      expect(result.weekly!.pct).toBe(7)
    })

    it('utilization이 누락(undefined)이면 pct=0', async () => {
      const result = await getUsage({
        readCredentials: () => VALID_CREDS,
        fetchFn: async () => makeResponse(true, {
          five_hour: {},
          seven_day: {},
        }),
      })
      expect(result.fiveHour!.pct).toBe(0)
      expect(result.weekly!.pct).toBe(0)
    })

    it('utilization이 음수이면 pct=0 (하한 clamp)', async () => {
      const result = await getUsage({
        readCredentials: () => VALID_CREDS,
        fetchFn: async () => makeResponse(true, {
          five_hour: { utilization: -10 },
          seven_day: { utilization: -1 },
        }),
      })
      expect(result.fiveHour!.pct).toBe(0)
      expect(result.weekly!.pct).toBe(0)
    })

    it('utilization이 100 초과이면 pct=100 (상한 clamp)', async () => {
      const result = await getUsage({
        readCredentials: () => VALID_CREDS,
        fetchFn: async () => makeResponse(true, {
          five_hour: { utilization: 150 },
          seven_day: { utilization: 999 },
        }),
      })
      expect(result.fiveHour!.pct).toBe(100)
      expect(result.weekly!.pct).toBe(100)
    })

    it('utilization이 비-숫자 문자열이면 pct=0', async () => {
      const result = await getUsage({
        readCredentials: () => VALID_CREDS,
        fetchFn: async () => makeResponse(true, {
          five_hour: { utilization: 'not-a-number' },
          seven_day: { utilization: '' },
        }),
      })
      expect(result.fiveHour!.pct).toBe(0)
      expect(result.weekly!.pct).toBe(0)
    })
  })

  // ── TTL 캐시 ─────────────────────────────────────────────────────────────
  //
  // TTL(5분) 캐시 검증: nowOverride를 주입하여 시간 경과를 시뮬레이션한다.
  // 1차 호출: nowOverride=T1 → 캐시 at=T1 저장.
  // 2차 호출(TTL 내): nowOverride=T1+1분 → (T1+1분-T1)=1분 < 5분 → 캐시 히트.
  // 2차 호출(TTL 초과): nowOverride=T1+6분 → (T1+6분-T1)=6분 > 5분 → 재fetch.

  describe('TTL 캐시', () => {
    it('5분 내 재호출 시 fetch를 다시 호출하지 않는다', async () => {
      const fetchMock = vi.fn().mockResolvedValue(makeResponse(true, NORMAL_BODY))
      const T1 = 1_000_000 // 고정 시각(ms) — 실제 Date.now와 무관

      // 1차 호출: nowOverride=T1 → 캐시 저장 at=T1
      await getUsage({ readCredentials: () => VALID_CREDS, fetchFn: fetchMock, nowOverride: T1 })
      // 2차 호출: nowOverride=T1+1분 → TTL 내 → 캐시 히트
      await getUsage({ readCredentials: () => VALID_CREDS, fetchFn: fetchMock, nowOverride: T1 + 60_000 })

      // fetch는 1회만 호출돼야 한다
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('캐시 만료(TTL 경과) 후 재호출 시 fetch를 다시 호출한다', async () => {
      const fetchMock = vi.fn().mockResolvedValue(makeResponse(true, NORMAL_BODY))
      const T1 = 1_000_000 // 고정 시각(ms)

      // 1차 호출: nowOverride=T1 → 캐시 저장 at=T1
      await getUsage({ readCredentials: () => VALID_CREDS, fetchFn: fetchMock, nowOverride: T1 })
      // 2차 호출: nowOverride=T1+6분 → TTL(5분) 초과 → 재fetch
      await getUsage({ readCredentials: () => VALID_CREDS, fetchFn: fetchMock, nowOverride: T1 + 6 * 60_000 })

      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  // ── CRITICAL: 신뢰경계 — 토큰 미노출 ────────────────────────────────────

  describe('신뢰경계 — 반환 객체에 토큰/시크릿 없음 (ADR-008)', () => {
    it('정상 응답 반환값에 token/secret/accessToken 관련 키가 없다', async () => {
      const result = await getUsage({
        readCredentials: () => VALID_CREDS,
        fetchFn: async () => makeResponse(true, NORMAL_BODY),
      })
      // 반환 객체 재귀 검사 — 민감 키 0
      expect(hasSensitiveField(result)).toBe(false)
    })

    it('empty 응답 반환값에도 token/secret/accessToken 관련 키가 없다', async () => {
      const result = await getUsage({
        readCredentials: () => null,
        fetchFn: vi.fn(),
      })
      expect(hasSensitiveField(result)).toBe(false)
    })

    it('반환 객체의 최상위 키는 fiveHour와 weekly만이다', async () => {
      const result = await getUsage({
        readCredentials: () => VALID_CREDS,
        fetchFn: async () => makeResponse(true, NORMAL_BODY),
      })
      const keys = Object.keys(result as object)
      expect(keys.sort()).toEqual(['fiveHour', 'weekly'])
    })

    it('UsageWindow 내부 키는 pct와 resetsAt만이다 (토큰 미포함)', async () => {
      const result = await getUsage({
        readCredentials: () => VALID_CREDS,
        fetchFn: async () => makeResponse(true, NORMAL_BODY),
      })
      if (result.fiveHour) {
        const keys = Object.keys(result.fiveHour)
        expect(keys.sort()).toEqual(['pct', 'resetsAt'])
      }
      if (result.weekly) {
        const keys = Object.keys(result.weekly)
        expect(keys.sort()).toEqual(['pct', 'resetsAt'])
      }
    })
  })
})
