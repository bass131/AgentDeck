/**
 * tg1-p04-status-line-format.test.ts — 한 줄 상태 라인 포맷터 순수 함수 (TG1 P04, TDD RED 선행).
 *
 * 대상: 02.Source/renderer/src/lib/statusLineFormat.ts (아직 없음 — RED)
 *   - formatElapsedLabel(seconds: number | null): string | null
 *     경과 초(P02 computeThinkingElapsedSeconds 결과)를 "12s" 형태로. null=세그먼트 미표시.
 *   - formatTokenCount(tokens: number): string
 *     estimatedTokens 런닝 토탈을 "3.4k"/"340" 축약 표기로.
 *   - formatTokenSegment(tokens: number | undefined): string | null
 *     "↑ 3.4k tokens" 형태 세그먼트. undefined=미표시.
 *   - buildStatusMeta(elapsedSeconds, tokens): string | null
 *     "(12s · ↑ 3.4k tokens)" 형태로 두 세그먼트를 합성. 둘 다 없으면 null(괄호 자체 미표시).
 *   - formatPhraseLabel(label: string): string (TG1 P07 헌팅 결함 봉합, 아직 없음 — RED)
 *     label 말미에 항상 단일 "…"가 붙도록 정규화. label이 이미 "…"(U+2026) 또는 "..."(ASCII
 *     점 2개 이상) 런으로 끝나면 그 트레일을 제거한 뒤 단일 "…"만 붙인다 — StatusLine.tsx가
 *     무조건 "…"를 append하던 구 로직은 thinkingText(모델 라이브 사고 요약)가 이미 "…"류로
 *     끝나면 "……"(점 6개)로 렌더되는 결함이 있었다(재현 컷:
 *     01.Phases/18_TG1-thinking-gui/ScreenShot/p04-double-ellipsis-{dark,light}.png).
 *
 * 결정론: 순수 함수 — Date.now()/타이머/window.api 호출 0.
 */
import { describe, it, expect } from 'vitest'
import {
  formatElapsedLabel,
  formatTokenCount,
  formatTokenSegment,
  buildStatusMeta,
  formatPhraseLabel,
} from '../../../02.Source/renderer/src/lib/statusLineFormat'

// ── formatElapsedLabel ───────────────────────────────────────────────────────

describe('tg1-p04 — formatElapsedLabel', () => {
  it('null(경과 판정 불가) → null(세그먼트 미표시)', () => {
    expect(formatElapsedLabel(null)).toBeNull()
  })

  it('0초 → "0s"(미표시가 아니라 값 그대로 표기)', () => {
    expect(formatElapsedLabel(0)).toBe('0s')
  })

  it('12 → "12s"', () => {
    expect(formatElapsedLabel(12)).toBe('12s')
  })

  it('큰 값도 그대로 초 단위 접미(예: 125 → "125s")', () => {
    expect(formatElapsedLabel(125)).toBe('125s')
  })
})

// ── formatTokenCount ─────────────────────────────────────────────────────────

describe('tg1-p04 — formatTokenCount', () => {
  it('<1000 토큰은 축약 없이 그대로 표기(예: 340 → "340")', () => {
    expect(formatTokenCount(340)).toBe('340')
  })

  it('999 → "999"(경계값, k 표기 없음)', () => {
    expect(formatTokenCount(999)).toBe('999')
  })

  it('0 → "0"', () => {
    expect(formatTokenCount(0)).toBe('0')
  })

  it('3400 → "3.4k"', () => {
    expect(formatTokenCount(3400)).toBe('3.4k')
  })

  it('1000 → "1.0k"(경계값, k 표기 진입)', () => {
    expect(formatTokenCount(1000)).toBe('1.0k')
  })
})

// ── formatTokenSegment ───────────────────────────────────────────────────────

describe('tg1-p04 — formatTokenSegment', () => {
  it('undefined(추정치 없음) → null(세그먼트 미표시)', () => {
    expect(formatTokenSegment(undefined)).toBeNull()
  })

  it('340 → "↑ 340 tokens"(<1000 축약 없이)', () => {
    expect(formatTokenSegment(340)).toBe('↑ 340 tokens')
  })

  it('3400 → "↑ 3.4k tokens"', () => {
    expect(formatTokenSegment(3400)).toBe('↑ 3.4k tokens')
  })
})

// ── buildStatusMeta ──────────────────────────────────────────────────────────

describe('tg1-p04 — buildStatusMeta(경과 초 + 토큰 세그먼트 합성)', () => {
  it('둘 다 없음 → null(괄호 자체 미표시)', () => {
    expect(buildStatusMeta(null, undefined)).toBeNull()
  })

  it('경과 초만 있음 → "(12s)"', () => {
    expect(buildStatusMeta(12, undefined)).toBe('(12s)')
  })

  it('토큰만 있음 → "(↑ 3.4k tokens)"', () => {
    expect(buildStatusMeta(null, 3400)).toBe('(↑ 3.4k tokens)')
  })

  it('둘 다 있음 → "(12s · ↑ 3.4k tokens)"(가운뎃점 결합)', () => {
    expect(buildStatusMeta(12, 3400)).toBe('(12s · ↑ 3.4k tokens)')
  })

  it('경과 0초 + 토큰 340 → "(0s · ↑ 340 tokens)"', () => {
    expect(buildStatusMeta(0, 340)).toBe('(0s · ↑ 340 tokens)')
  })
})

// ── formatPhraseLabel(TG1 P07 헌팅 결함 봉합 — 이중 말줄임 방지) ──────────────

describe('tg1-p07 — formatPhraseLabel(말줄임표 이중 방지)', () => {
  it('label이 U+2026("…")로 끝남 → 트레일 제거 후 단일 "…"만 붙음(점 6개 방지)', () => {
    expect(formatPhraseLabel('결정을 마무리하는 중…')).toBe('결정을 마무리하는 중…')
  })

  it('label이 ASCII "..."로 끝남 → 트레일 제거 후 단일 "…"만 붙음', () => {
    expect(formatPhraseLabel('코드를 분석하는 중...')).toBe('코드를 분석하는 중…')
  })

  it('label이 말줄임 없이 정상 종료 → 그대로 단일 "…" 첨부', () => {
    expect(formatPhraseLabel('사고 중')).toBe('사고 중…')
  })
})
