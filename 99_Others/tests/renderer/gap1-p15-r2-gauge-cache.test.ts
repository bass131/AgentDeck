/**
 * gap1-p15-r2-gauge-cache.test.ts — GAP1 P15 라운드 2 T3: 컨텍스트 게이지 캐시 토큰 미합산 (RED).
 *
 * 라이브 실측(P15 R2 L5): REPL 지속세션(ADR-024) 턴 3+에서 컨텍스트 게이지가 "9/1M"처럼
 * 사실상 0%로 고정된다 — 실제 점유는 수만 토큰. 원인은 소비처:
 *   - 어댑터는 usage를 온전히 전달한다(claude-stream.ts:627-631 —
 *     cache_creation_input_tokens → cacheCreationTokens, cache_read_input_tokens →
 *     cacheReadTokens 매핑 완료. m4-1-picker-gauge.test.ts (a)가 reducer 저장도 핀).
 *   - gaugeCalc.ts:35 `used = inputTokens + outputTokens`만 합산 — 캐시 토큰 미소비.
 *
 * 기대 산식(interface-of-record — 봉합은 renderer Worker, gaugeCalc.ts:35):
 *   used = inputTokens + (cacheCreationTokens ?? 0) + (cacheReadTokens ?? 0) + outputTokens
 *
 * 근거(왜 캐시를 점유로 세는가): Anthropic Messages API의 usage.input_tokens는 **캐시
 * 미적중 입력만** 계수한다 — 프롬프트 측 총 토큰 = input_tokens +
 * cache_creation_input_tokens + cache_read_input_tokens (Anthropic prompt caching 의미론.
 * 캐시에서 읽힌 프리픽스도 이번 턴 컨텍스트 윈도우를 그대로 점유한다). Claude Code CLI의
 * 컨텍스트 표시도 같은 의미(현재 점유 = 캐시 읽기 포함 프롬프트 측 총량 + 이번 턴 출력).
 * REPL 턴 3+에서는 직전 대화 전체가 캐시 읽기로 넘어가 input_tokens가 한 자릿수로
 * 떨어진다 — cacheRead를 빼면 게이지가 구조적으로 0%에 고정된다(L5 "9/1M" 실측).
 * trade-off: cacheCreation(이번 턴 새로 캐시에 써진 프롬프트 토큰)도 프롬프트 측 점유라
 * 포함한다 — 제외하면 캐시 경계가 갱신되는 턴마다 게이지가 일시적으로 꺼져 보인다.
 *
 * TDD 상태: 캐시 반영 3건 RED · 비캐시 회귀 핀 2건 GREEN(기존 거동 불변 —
 * m4-1-picker-gauge.test.ts (c)와 동일 축, 봉합 후에도 불변이어야 한다).
 */
import { describe, it, expect } from 'vitest'
import { calcGauge } from '../../../02.Source/renderer/src/lib/gaugeCalc'

describe('GAP1 P15-R2 T3 — calcGauge 캐시 토큰 합산 (RED)', () => {
  it('cacheReadTokens 반영: {input 9, cacheRead 45000, output 1200} → used=46209 (현행 1209)', () => {
    // L5 실측 형상 — REPL 턴 3+의 전형: 프리픽스 전체가 캐시 읽기, input은 한 자릿수.
    const r = calcGauge({ inputTokens: 9, outputTokens: 1_200, cacheReadTokens: 45_000 }, 'opus')
    expect(r.used).toBe(46_209)
  })

  it('cacheCreationTokens도 프롬프트 측 점유로 합산: {input 9, cacheCreation 2500, cacheRead 45000, output 1200} → used=48709', () => {
    const r = calcGauge(
      { inputTokens: 9, outputTokens: 1_200, cacheCreationTokens: 2_500, cacheReadTokens: 45_000 },
      'opus'
    )
    expect(r.used).toBe(48_709)
  })

  it('pct도 캐시 포함 used 기준: 46209 / 200K(contextWindow 3rd arg) → 23% (현행 1%)', () => {
    // Phase 21c contextWindow 우선 적용 경로와의 조합 — used만 바뀌고 window 로직은 불변.
    const r = calcGauge(
      { inputTokens: 9, outputTokens: 1_200, cacheReadTokens: 45_000 },
      'opus',
      200_000
    )
    expect(r.window).toBe(200_000)
    expect(r.pct).toBe(23) // Math.round(46209 / 200000 * 100)
  })
})

describe('GAP1 P15-R2 T3 — 비캐시(비REPL) 회귀 핀 (GREEN 불변)', () => {
  it('캐시 필드 없는 usage → used = input + output 그대로 (기존 거동)', () => {
    const r = calcGauge({ inputTokens: 500, outputTokens: 300 }, 'opus')
    expect(r.used).toBe(800)
    expect(r.window).toBe(1_000_000)
  })

  it('usage undefined → used=0, pct=0 (기존 거동)', () => {
    const r = calcGauge(undefined, 'opus')
    expect(r.used).toBe(0)
    expect(r.pct).toBe(0)
  })
})
