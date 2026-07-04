/**
 * modelLabel.test.ts — 원시 모델 ID → 표시 이름 순수 함수 (FB2 P07 3단계).
 *
 * main/01_agents/modelFallback.ts의 modelDisplay()와 표시 규칙을 맞춘 renderer 측 미러.
 * ML1: 알려진 패밀리('opus'/'sonnet'/'haiku'/'fable') → 'Opus 4.8'류 표시명.
 * ML2: 날짜 접미(dated suffix) 붙은 ID도 major.minor까지만 추출.
 * ML3: 패턴 불일치(미지 모델) → 원문 그대로(정보 손실 없이 fallback).
 * ML4: undefined/빈 문자열 → undefined(호출측이 조건부 렌더로 미표기).
 * ML5: 영호 추가 요구(2026-07-04) — 배지 라벨은 패밀리명 단독 금지, 항상 버전 넘버 포함.
 *      현행 4패밀리 실측 ID(라이브 경로 = SDK message.model, 항상 버전 있는 실측 값 —
 *      shared/agent-events.ts SubAgentInfo.model JSDoc 참조) 전부가 넘버링을 포함하는지
 *      회귀 고정. Sonnet 최종 확정: SDK 0.3.201 bump로 별칭 'sonnet'=claude-sonnet-5
 *      실측 확인(2026-07-04, agent-backend 재실측 2회) — CURRENT_LIVE_IDS에 반영.
 *      'claude-sonnet-4-6'은 구세대 ID로서 ML1(포매터가 입력을 정직 변환하는 케이스)에서만
 *      별도 유지 — "현행 값"을 의미하는 자리(CURRENT_LIVE_IDS·ML6 색 매핑)는 전부 갱신.
 * ML6: modelFamilyColor — 배지 도트의 패밀리 정체성 색(신규 색 0, pickerOptions.ts MODELS
 *      팔레트 재사용).
 */
import { describe, it, expect } from 'vitest'
import { modelLabel, modelFamilyColor } from '../../../02.Source/renderer/src/lib/modelLabel'

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

describe('ML5 — 넘버링 보장(패밀리명 단독 표기 금지, 영호 2026-07-04)', () => {
  const CURRENT_LIVE_IDS = [
    'claude-opus-4-8',
    'claude-sonnet-5',
    'claude-haiku-4-5-20251001',
    'claude-fable-5',
  ]

  it.each(CURRENT_LIVE_IDS)('현행 실측 모델 ID %s → 라벨에 버전 숫자 포함(패밀리명 단독 X)', (id) => {
    const label = modelLabel(id)
    expect(label).toBeDefined()
    // 패밀리명 4종 중 어느 것도 "숫자 없이 단독으로" 나오면 안 된다.
    expect(label).not.toMatch(/^(Fable|Opus|Sonnet|Haiku)$/)
    expect(label).toMatch(/\d/)
  })

  it('claude-opus-4-8 → "Opus 4.8"(메이저+마이너)', () => {
    expect(modelLabel('claude-opus-4-8')).toBe('Opus 4.8')
  })

  it('claude-sonnet-5(SDK 0.3.201 bump 실측 확인된 현행 sonnet 별칭 결과) → "Sonnet 5"(major-only)', () => {
    expect(modelLabel('claude-sonnet-5')).toBe('Sonnet 5')
  })

  it('claude-fable-5 → "Fable 5"(마이너 없음, 메이저만으로도 넘버링 충족)', () => {
    expect(modelLabel('claude-fable-5')).toBe('Fable 5')
  })

  it('claude-haiku-4-5-20251001 → "Haiku 4.5"(날짜 접미 무시, 메이저.마이너 유지)', () => {
    expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  })

  it('버전 없는 짧은 내부 id("opus")는 알려진 패턴에 안 걸려 원문 그대로 폴백(ML3과 동일 보호 —' +
    ' 라이브에선 도달 불가한 방어적 케이스, message.model은 항상 버전 포함 원본 API 값)', () => {
    expect(modelLabel('opus')).toBe('opus')
  })
})

describe('ML6 — modelFamilyColor: 패밀리 정체성 색(신규 색 0, pickerOptions.ts MODELS 재사용)', () => {
  it('claude-opus-4-8 → var(--violet)', () => {
    expect(modelFamilyColor('claude-opus-4-8')).toBe('var(--violet)')
  })
  it('claude-sonnet-5(현행 sonnet 별칭 결과) → var(--blue)', () => {
    expect(modelFamilyColor('claude-sonnet-5')).toBe('var(--blue)')
  })
  it('claude-haiku-4-5-20251001 → var(--teal)', () => {
    expect(modelFamilyColor('claude-haiku-4-5-20251001')).toBe('var(--teal)')
  })
  it('claude-fable-5 → var(--gold)', () => {
    expect(modelFamilyColor('claude-fable-5')).toBe('var(--gold)')
  })
  it('미지 모델 ID → undefined(중립 폴백)', () => {
    expect(modelFamilyColor('future-model-x1')).toBeUndefined()
  })
  it('undefined → undefined', () => {
    expect(modelFamilyColor(undefined)).toBeUndefined()
  })
})
