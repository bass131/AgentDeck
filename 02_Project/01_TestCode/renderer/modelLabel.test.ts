import { describe, it, expect } from 'vitest'
import { modelLabel, modelFamilyColor, isBareModelAlias } from '../../../02_Project/00_Source/renderer/src/lib/modelLabel'
import { KNOWN_MODELS } from '../../../02_Project/00_Source/shared/knownModels'
import { MODELS } from '../../../02_Project/00_Source/renderer/src/lib/pickerOptions'

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

describe('ML7 — 패밀리 목록은 어휘(KNOWN_MODELS)에서 파생된다', () => {
  it('어휘의 모든 모델이 라벨로 변환된다', () => {
    for (const id of KNOWN_MODELS) {
      const label = modelLabel(id)
      expect(label, id).toBeDefined()
      expect(label, id).not.toBe(id)
      expect(label, id).toMatch(/^[A-Z][a-z]+ \d+(?:\.\d+)?$/)
    }
  })

  it('picker에 없는 세대도 같은 패밀리 색을 물려받는다', () => {
    expect(modelFamilyColor('claude-opus-4-8')).toBe(modelFamilyColor('claude-opus-5'))
    expect(modelFamilyColor('claude-opus-4-8')).toBe('var(--violet)')
  })

  it('어휘 밖 패밀리는 미지 모델로 취급된다', () => {
    expect(modelLabel('claude-zeta-1')).toBe('claude-zeta-1')
    expect(modelFamilyColor('claude-zeta-1')).toBeUndefined()
  })
})

describe('ML8 — 색은 picker 팔레트(MODELS)가 단일 출처다', () => {
  it('MODELS의 색을 바꾸면 modelFamilyColor가 따라온다', () => {
    const opus = MODELS.find((m) => m.id === 'claude-opus-5')!
    const original = opus.color
    opus.color = 'var(--test-only)'
    try {
      expect(modelFamilyColor('claude-opus-5')).toBe('var(--test-only)')
      expect(modelFamilyColor('claude-opus-4-8')).toBe('var(--test-only)')
    } finally {
      opus.color = original
    }
  })
})

describe('ML9 — isBareModelAlias: 조기 별칭 판별(모델 미확정, CP1 렌더러 후속)', () => {
  it('알려진 패밀리 별칭 그대로(버전 없음)면 true', () => {
    expect(isBareModelAlias('opus')).toBe(true)
    expect(isBareModelAlias('sonnet')).toBe(true)
    expect(isBareModelAlias('haiku')).toBe(true)
    expect(isBareModelAlias('fable')).toBe(true)
  })

  it('대소문자 무관하게 판별된다', () => {
    expect(isBareModelAlias('Opus')).toBe(true)
  })

  it('원시 모델 ID(버전 포함, 실측 갱신 값)는 false — 정상 배지 노출 대상', () => {
    expect(isBareModelAlias('claude-opus-4-8')).toBe(false)
  })

  it('완전히 미지의 문자열은 false(별칭 목록에 없음 — ML3/MB3 정보 손실 없음 계약과 별개)', () => {
    expect(isBareModelAlias('future-model-x1')).toBe(false)
  })

  it('undefined → false', () => {
    expect(isBareModelAlias(undefined)).toBe(false)
  })
})
