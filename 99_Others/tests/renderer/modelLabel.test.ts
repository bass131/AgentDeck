/**
 * modelLabel.test.ts — 원시 모델 ID → 표시 이름·색 (renderer 순수 함수)
 *
 * main의 `01_agents/modelFallback.ts` modelDisplay()와 표시 규칙을 맞춘 renderer 측 미러
 * (renderer는 contextIsolation 때문에 main 모듈을 import할 수 없어 규칙만 복제한다).
 *
 * ML1~4: 라벨 변환 — 알려진 패밀리, 날짜 접미사 무시, 미지 모델 원문 폴백, undefined 처리.
 * ML5:   라벨은 항상 "패밀리명 + 버전"(패밀리명 단독 표기 금지, 영호 요구).
 * ML6:   modelFamilyColor — 배지 도트의 패밀리 정체성 색.
 * ML7:   패밀리 목록이 어휘(KNOWN_MODELS)에서 파생된다.
 * ML8:   색이 picker 팔레트(MODELS) 단일 출처에서 온다.
 * ML9:   isBareModelAlias — 버전 없는 별칭을 "모델 미확정"으로 판별(배지 숨김 조건).
 */
import { describe, it, expect } from 'vitest'
import { modelLabel, modelFamilyColor, isBareModelAlias } from '../../../02_Source/renderer/src/lib/modelLabel'
import { KNOWN_MODELS } from '../../../02_Source/shared/knownModels'
import { MODELS } from '../../../02_Source/renderer/src/lib/pickerOptions'

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

describe('ML7 — 패밀리 목록은 어휘(KNOWN_MODELS)에서 파생된다', () => {
  /**
   * 이전 구현은 패밀리 목록을 picker 팔레트(`MODELS`)의 id에서 뽑았다. 그 id가 짧은
   * 별칭('opus')에서 full ID('claude-opus-5')로 바뀌면서 그 방식이 깨졌으므로
   * (정규식이 `claude-(claude-opus-5)-(\d+)` 꼴이 된다) 어휘 쪽 full ID를 파싱해 뽑는다.
   * `KNOWN_MODELS`는 `as const` readonly라 런타임 확장이 불가능하니, 확장 대신 "현행
   * 어휘 전체가 인식된다"로 파생을 검증한다.
   */
  it('어휘의 모든 모델이 라벨로 변환된다', () => {
    for (const id of KNOWN_MODELS) {
      const label = modelLabel(id)
      expect(label, id).toBeDefined()
      // 원문 그대로 폴백된 것이 아니라 실제로 변환됐는지 — 패밀리명 + 버전 형태여야 한다.
      expect(label, id).not.toBe(id)
      expect(label, id).toMatch(/^[A-Z][a-z]+ \d+(?:\.\d+)?$/)
    }
  })

  it('picker에 없는 세대도 같은 패밀리 색을 물려받는다', () => {
    // claude-opus-4-8은 레거시 'opus' 별칭의 해석 결과로 어휘에만 있고 picker엔 없다.
    // 색은 패밀리 단위로 붙으므로 Opus 5와 같은 색이어야 한다 — 배지가 색을 잃으면
    // 사용자에겐 "모델이 인식되지 않은 상태"로 보인다.
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
      // 같은 패밀리의 다른 세대도 함께 따라온다(패밀리 단위 매핑).
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
