/**
 * modelLabel.test.ts — 원시 모델 ID → 표시 이름 순수 함수 (FB2 P07 3단계).
 *
 * main/01_agents/modelFallback.ts의 modelDisplay()와 표시 규칙을 맞춘 renderer 측 미러.
 * ML1: 알려진 패밀리('opus'/'sonnet'/'haiku'/'fable') → 'Opus 4.8'류 표시명.
 * ML2: 날짜 접미(dated suffix) 붙은 ID도 major.minor까지만 추출.
 * ML3: 패턴 불일치(미지 모델) → 원문 그대로(정보 손실 없이 fallback).
 * ML4: undefined/빈 문자열 → undefined(호출측이 조건부 렌더로 미표기).
 */
import { describe, it, expect } from 'vitest'
import { modelLabel } from '../../../02.Source/renderer/src/lib/modelLabel'

describe('ML1 — 알려진 모델 ID → 표시명', () => {
  it('claude-opus-4-8 → Opus 4.8', () => {
    expect(modelLabel('claude-opus-4-8')).toBe('Opus 4.8')
  })
  it('claude-sonnet-4-6 → Sonnet 4.6', () => {
    expect(modelLabel('claude-sonnet-4-6')).toBe('Sonnet 4.6')
  })
  it('claude-fable-5 → Fable 5(마이너 없음)', () => {
    expect(modelLabel('claude-fable-5')).toBe('Fable 5')
  })
})

describe('ML2 — 날짜 접미 ID', () => {
  it('claude-haiku-4-5-20251001 → Haiku 4.5', () => {
    expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  })
})

describe('ML3 — 미지 모델 ID → 원문 그대로', () => {
  it('패턴 불일치면 원본 문자열 반환', () => {
    expect(modelLabel('gpt-4-turbo')).toBe('gpt-4-turbo')
  })
  it('완전히 임의의 문자열도 원본 그대로', () => {
    expect(modelLabel('future-model-x1')).toBe('future-model-x1')
  })
})

describe('ML4 — 미지정 입력 → undefined(미표기)', () => {
  it('undefined → undefined', () => {
    expect(modelLabel(undefined)).toBeUndefined()
  })
  it('빈 문자열 → undefined', () => {
    expect(modelLabel('')).toBeUndefined()
  })
})
