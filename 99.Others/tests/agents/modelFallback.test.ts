/**
 * modelFallback.test.ts — 모델 폴백 표시 헬퍼 골든 테스트 (RF1-followup P03)
 *
 * eventNormalizer.ts에서 분리된 순수 헬퍼(modelDisplay/REFUSAL_CATEGORY_LABEL/fallbackNotice)의
 * 거동을 고정한다. 분해 전 동작과 1:1 동일해야 한다(거동 불변 자물쇠).
 *
 * 원본 위치: eventNormalizer.ts L90-119 (원본 engine.ts L807-823 미러).
 */

import { describe, it, expect } from 'vitest'
import {
  modelDisplay,
  REFUSAL_CATEGORY_LABEL,
  fallbackNotice,
} from '../../../02.Source/main/01_agents/modelFallback'

describe('modelDisplay()', () => {
  it("'claude-fable-5' → 'Fable 5'", () => {
    expect(modelDisplay('claude-fable-5')).toBe('Fable 5')
  })

  it("'claude-opus-4-8' → 'Opus 4.8'", () => {
    expect(modelDisplay('claude-opus-4-8')).toBe('Opus 4.8')
  })

  it("'claude-sonnet-4-6' → 'Sonnet 4.6'", () => {
    expect(modelDisplay('claude-sonnet-4-6')).toBe('Sonnet 4.6')
  })

  it('마이너 없는 모델 → 메이저만', () => {
    expect(modelDisplay('claude-haiku-5')).toBe('Haiku 5')
  })

  it('빈 문자열 → 다른 모델 폴백', () => {
    expect(modelDisplay('')).toBe('다른 모델')
  })

  it('패턴 불일치 비-빈 문자열 → 원문 그대로', () => {
    expect(modelDisplay('gpt-4o')).toBe('gpt-4o')
  })

  it('non-string → 다른 모델 폴백', () => {
    expect(modelDisplay(null)).toBe('다른 모델')
    expect(modelDisplay(undefined)).toBe('다른 모델')
    expect(modelDisplay(42)).toBe('다른 모델')
  })
})

describe('REFUSAL_CATEGORY_LABEL', () => {
  it('cyber/bio 라벨 매핑', () => {
    expect(REFUSAL_CATEGORY_LABEL['cyber']).toBe('사이버 보안')
    expect(REFUSAL_CATEGORY_LABEL['bio']).toBe('생물학')
  })
})

describe('fallbackNotice()', () => {
  it('from/to/category 모두 있으면 분류 포함 배너', () => {
    const s = fallbackNotice('claude-fable-5', 'claude-opus-4-8', 'cyber')
    expect(s).toContain('Fable 5')
    expect(s).toContain('Opus 4.8')
    expect(s).toContain('사이버 보안')
  })

  it('category 없으면 분류 미포함', () => {
    const s = fallbackNotice('claude-fable-5', 'claude-opus-4-8', undefined)
    expect(s).toContain('Fable 5')
    expect(s).toContain('Opus 4.8')
    expect(s).not.toContain('감지 분류')
  })

  it('미지 category → 코드 그대로', () => {
    const s = fallbackNotice('claude-fable-5', 'claude-opus-4-8', 'unknown_cat')
    expect(s).toContain('unknown_cat')
  })
})
