/**
 * b8-context-strip.test.ts — Phase 26(B8) ContextStrip 3칩 TDD
 *
 * 테스트 순서: 실패 먼저(Red) → 구현(Green) → 리팩터(Refactor).
 *
 * 범위:
 *   (a) resetText 순수 함수 — null / 곧초기화 / 분 / 시간분 / 일시간(useDays)
 *   (b) ContextStrip 3칩 렌더 — 라벨 / usage 있음 → pct%+detail / usage null → '—'+'데이터 없음'
 *   (c) usage fetch — mount 시 getUsage 호출, run done 전이 시 재호출
 *   (d) 기존 컨텍스트 게이지 회귀 — pct / detail 기존 동작 유지
 *
 * Node 환경(순수 함수). 컴포넌트 렌더 테스트는 별도 jsdom 환경에서 관리.
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── (a) resetText 순수 함수 ─────────────────────────────────────────────────

/**
 * resetText(resetsAt, useDays): 원본 Chat.tsx L907 미러
 *   - resetsAt == null → '초기화 시간 미상'
 *   - rem <= 0       → '곧 초기화'
 *   - useDays && h>=24 → 'N일 H시간 후 초기화'
 *   - h > 0          → 'H시간 M분 후 초기화'
 *   - h == 0         → 'M분 후 초기화'
 */
import { resetText } from '../../src/renderer/src/lib/resetText'

describe('(a) resetText — 원본 Chat.tsx L907 미러', () => {
  it('resetsAt=null → "초기화 시간 미상"', () => {
    expect(resetText(null, false)).toBe('초기화 시간 미상')
    expect(resetText(null, true)).toBe('초기화 시간 미상')
  })

  it('rem <= 0 (이미 지난 시각) → "곧 초기화"', () => {
    // 현재보다 100초 전
    const past = Math.floor(Date.now() / 1000) - 100
    expect(resetText(past, false)).toBe('곧 초기화')
    expect(resetText(past, true)).toBe('곧 초기화')
  })

  it('rem = 30분 → "30분 후 초기화" (h=0)', () => {
    const resetsAt = Math.floor(Date.now() / 1000) + 30 * 60
    expect(resetText(resetsAt, false)).toBe('30분 후 초기화')
  })

  it('rem = 1시간 30분 → "1시간 30분 후 초기화"', () => {
    const resetsAt = Math.floor(Date.now() / 1000) + 90 * 60
    expect(resetText(resetsAt, false)).toBe('1시간 30분 후 초기화')
  })

  it('rem = 2일 3시간 / useDays=true → "2일 3시간 후 초기화"', () => {
    const resetsAt = Math.floor(Date.now() / 1000) + (2 * 24 + 3) * 3600
    expect(resetText(resetsAt, true)).toBe('2일 3시간 후 초기화')
  })

  it('rem = 2일 / useDays=false → "48시간 0분 후 초기화" (일 단위 미사용)', () => {
    const resetsAt = Math.floor(Date.now() / 1000) + 48 * 3600
    // useDays=false이면 일 단위 변환 안 함 — h>=24이어도 그냥 h로 출력
    const result = resetText(resetsAt, false)
    expect(result).toBe('48시간 0분 후 초기화')
  })

  it('rem = 1분 → "1분 후 초기화"', () => {
    const resetsAt = Math.floor(Date.now() / 1000) + 60
    expect(resetText(resetsAt, false)).toBe('1분 후 초기화')
  })

  it('rem = 정확히 1시간 → "1시간 0분 후 초기화"', () => {
    const resetsAt = Math.floor(Date.now() / 1000) + 3600
    expect(resetText(resetsAt, false)).toBe('1시간 0분 후 초기화')
  })
})

// ── (b) ContextStrip 칩 데이터 계산 로직 ───────────────────────────────────

/**
 * ContextStrip의 3칩 데이터 계산 함수: buildChips(gauge, usage)
 *   반환: { label, pct, detail }[]
 *   - 0: 현재 컨텍스트 (기존)
 *   - 1: 5시간 한도  (B8 신규)
 *   - 2: 주간 한도   (B8 신규)
 */
import { buildChips } from '../../src/renderer/src/lib/contextChips'
import type { UsageInfo } from '../../src/shared/ipc-contract'

describe('(b) buildChips — 3칩 데이터 계산', () => {
  const baseGauge = { pct: 10, used: 100_000, window: 1_000_000 }
  const now = Math.floor(Date.now() / 1000)

  it('3개 칩 반환 — 라벨 순서 확인', () => {
    const usage: UsageInfo = { fiveHour: null, weekly: null }
    const chips = buildChips(baseGauge, usage)
    expect(chips).toHaveLength(3)
    expect(chips[0].label).toBe('현재 컨텍스트')
    expect(chips[1].label).toBe('5시간 한도')
    expect(chips[2].label).toBe('주간 한도')
  })

  it('usage null → pct=null, detail="데이터 없음"', () => {
    const usage: UsageInfo = { fiveHour: null, weekly: null }
    const chips = buildChips(baseGauge, usage)
    expect(chips[1].pct).toBeNull()
    expect(chips[1].detail).toBe('데이터 없음')
    expect(chips[2].pct).toBeNull()
    expect(chips[2].detail).toBe('데이터 없음')
  })

  it('fiveHour 있음 → pct=해당값, detail=resetText(resetsAt,false)', () => {
    const resetsAt = now + 3600 // 1시간 후
    const usage: UsageInfo = {
      fiveHour: { pct: 45, resetsAt },
      weekly: null,
    }
    const chips = buildChips(baseGauge, usage)
    expect(chips[1].pct).toBe(45)
    expect(chips[1].detail).toBe('1시간 0분 후 초기화')
  })

  it('weekly 있음 → pct=해당값, detail=resetText(resetsAt,true)', () => {
    const resetsAt = now + (2 * 24 + 5) * 3600 // 2일 5시간 후
    const usage: UsageInfo = {
      fiveHour: null,
      weekly: { pct: 72, resetsAt },
    }
    const chips = buildChips(baseGauge, usage)
    expect(chips[2].pct).toBe(72)
    expect(chips[2].detail).toBe('2일 5시간 후 초기화')
  })

  it('fiveHour.resetsAt=null → detail="초기화 시간 미상"', () => {
    const usage: UsageInfo = {
      fiveHour: { pct: 30, resetsAt: null },
      weekly: null,
    }
    const chips = buildChips(baseGauge, usage)
    expect(chips[1].detail).toBe('초기화 시간 미상')
  })
})

// ── (c) usage fetch 시점 — store loadUsage 액션 ───────────────────────────

describe('(c) usage fetch — store loadUsage 액션', () => {
  const mockUsage: UsageInfo = {
    fiveHour: { pct: 50, resetsAt: Math.floor(Date.now() / 1000) + 3600 },
    weekly: { pct: 20, resetsAt: Math.floor(Date.now() / 1000) + 86400 * 7 },
  }
  const mockGetUsage = vi.fn().mockResolvedValue(mockUsage)

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUsage.mockResolvedValue(mockUsage)
    Object.defineProperty(globalThis, 'window', {
      value: {
        api: {
          getUsage: mockGetUsage,
          agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
          agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
          conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
          conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
          onAgentEvent: vi.fn().mockReturnValue(vi.fn()),
          listFiles: vi.fn().mockResolvedValue({ files: [] }),
        },
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('loadUsage()가 window.api.getUsage()를 호출하고 store에 저장한다', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')

    await useAppStore.getState().loadUsage()

    expect(mockGetUsage).toHaveBeenCalledTimes(1)
    const state = useAppStore.getState()
    expect(state.usage.fiveHour?.pct).toBe(50)
    expect(state.usage.weekly?.pct).toBe(20)
  })

  it('loadUsage()가 실패해도 에러를 throw하지 않는다 (catch-and-ignore)', async () => {
    mockGetUsage.mockRejectedValueOnce(new Error('network'))
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')

    await expect(useAppStore.getState().loadUsage()).resolves.toBeUndefined()
  })
})

// ── (d) 기존 컨텍스트 게이지 회귀 ───────────────────────────────────────────

import { calcGauge } from '../../src/renderer/src/lib/gaugeCalc'

describe('(d) 기존 컨텍스트 게이지 회귀', () => {
  it('현재 컨텍스트 칩의 pct/detail은 calcGauge 결과와 일치한다', () => {
    const gauge = calcGauge({ inputTokens: 100_000, outputTokens: 100_000 }, 'haiku')
    const usage: UsageInfo = { fiveHour: null, weekly: null }
    const chips = buildChips(gauge, usage)

    expect(chips[0].label).toBe('현재 컨텍스트')
    expect(chips[0].pct).toBe(gauge.pct)
    // detail은 토큰 포매팅 포함 — null이 아님을 확인
    expect(typeof chips[0].detail).toBe('string')
    expect(chips[0].detail.length).toBeGreaterThan(0)
  })

  it('usage가 있어도 현재 컨텍스트 칩(0번)은 영향받지 않는다', () => {
    const gauge = calcGauge({ inputTokens: 500_000, outputTokens: 0 }, 'opus')
    const usage: UsageInfo = {
      fiveHour: { pct: 99, resetsAt: Math.floor(Date.now() / 1000) + 100 },
      weekly: { pct: 88, resetsAt: null },
    }
    const chips = buildChips(gauge, usage)

    // 0번 칩은 gauge와 동일
    expect(chips[0].pct).toBe(gauge.pct)
    // 1,2번 칩은 usage와 동일
    expect(chips[1].pct).toBe(99)
    expect(chips[2].pct).toBe(88)
  })
})
