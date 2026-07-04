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
 * ML7(CP1 P06 ⑥): 패밀리 id 목록 단일 출처화 회귀 가드 — modelLabel.ts의
 *      buildModelIdPattern()이 pickerOptions.ts MODELS의 id를 하드코딩 중복 없이 그대로
 *      따라간다는 것을 MODELS 배열에 임시 패밀리를 추가해 검증한다(main의
 *      01_agents/modelFallback.ts는 프로세스 경계라 이 단일화 대상에서 제외 — 그대로 둠).
 * ML8(CP1 렌더러 후속, reviewer 🟡 봉합): buildModelIdPattern()이 MODELS의 id를 정규식
 *      조각으로 삽입하기 전 이스케이프하는지 — id에 정규식 메타문자('.')가 섞여도 리터럴로만
 *      매칭됨을 검증(이스케이프 누락 시 '.'이 임의 문자에 매칭돼 아래 두 번째 단언이 깨진다).
 * ML9(CP1 렌더러 후속, 조기 별칭 배지 UX): isBareModelAlias — CP1 P07 조기 스냅샷이 담을
 *      수 있는 버전 없는 별칭('opus' 등)을 판별. SubAgentModelBadge가 이 값을 "모델
 *      미확정"으로 취급해 배지를 숨기는 데 쓰인다(컴포넌트 단위 계약은 SubAgentModelBadge.
 *      test.tsx/SubAgentInline.test.tsx/subagent-fullscreen.test.tsx가 커버 — 여기서는
 *      순수 판별 함수 자체만 검증).
 */
import { describe, it, expect } from 'vitest'
import { modelLabel, modelFamilyColor, isBareModelAlias } from '../../../02.Source/renderer/src/lib/modelLabel'
import { MODELS } from '../../../02.Source/renderer/src/lib/pickerOptions'

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

describe('ML7 — 패밀리 id 단일 출처화(pickerOptions.ts MODELS, CP1 P06 ⑥)', () => {
  it('MODELS에 새 패밀리를 추가하면 modelLabel.ts 하드코딩 목록 갱신 없이 즉시 인식된다', () => {
    MODELS.push({ id: 'zeta', label: 'Zeta 1', desc: '테스트 전용 임시 패밀리', ctx: 1, color: 'var(--red)' })
    try {
      expect(modelLabel('claude-zeta-1')).toBe('Zeta 1')
      expect(modelFamilyColor('claude-zeta-1')).toBe('var(--red)')
    } finally {
      MODELS.pop()
    }
  })

  it('임시 패밀리 제거 후에는 다시 미지 모델로 취급된다(격리 확인)', () => {
    expect(modelLabel('claude-zeta-1')).toBe('claude-zeta-1')
    expect(modelFamilyColor('claude-zeta-1')).toBeUndefined()
  })
})

describe('ML8 — 패밀리 id 정규식 이스케이프(특수문자 방어, CP1 렌더러 후속)', () => {
  it('점(.) 같은 정규식 메타문자가 포함된 id도 리터럴로만 매칭된다(이스케이프 확인)', () => {
    MODELS.push({ id: 'te.st', label: 'Test 1', desc: '테스트 전용 특수문자 id', ctx: 1, color: 'var(--red)' })
    try {
      // 리터럴 매칭 — 점이 실제 문자 '.'일 때만 매칭돼야 한다.
      expect(modelLabel('claude-te.st-1')).toBe('Te.st 1')
      // 이스케이프 안 됐다면 정규식 메타 '.'이 임의 한 문자를 매칭해 아래도 성공했을 것 —
      // 반드시 실패(원문 그대로 폴백)해야 이스케이프가 걸린 것이다.
      expect(modelLabel('claude-teXst-1')).toBe('claude-teXst-1')
    } finally {
      MODELS.pop()
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
