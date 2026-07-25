/**
 * uc1-p05-keyword-segments.test.ts — UC1 Phase 05: 컴포저 키워드 하이라이트 세그먼트
 * 분해 순수 함수(TDD RED → GREEN).
 *
 * segmentOrchestrationKeywords는 P04의 detectOrchestrationKeyword와 **같은 정규식**
 * (ULTRACODE_RE/WORKFLOWS_RE, orchestrationKeyword.ts 단일 진실원)으로 텍스트를
 * [일반|하이라이트] 세그먼트 배열로 쪼갠다 — 미러 오버레이가 span 렌더링에 그대로 사용.
 * 순수 함수 — DOM/store 미참조, 부수효과 없음.
 */
import { describe, it, expect } from 'vitest'
import { segmentOrchestrationKeywords } from '../../../02.Source/renderer/src/lib/orchestrationKeyword'

describe('segmentOrchestrationKeywords — 키워드 0개', () => {
  it('빈 문자열 → 빈 배열', () => {
    expect(segmentOrchestrationKeywords('')).toEqual([])
  })

  it('키워드 없는 일반 텍스트 → 세그먼트 1개(전체가 non-highlight)', () => {
    expect(segmentOrchestrationKeywords('hello world')).toEqual([
      { text: 'hello world', highlight: false },
    ])
  })
})

describe('segmentOrchestrationKeywords — 키워드 1개', () => {
  it('문두 "ultracode" → [하이라이트, 일반]', () => {
    expect(segmentOrchestrationKeywords('ultracode 실행해줘')).toEqual([
      { text: 'ultracode', highlight: true },
      { text: ' 실행해줘', highlight: false },
    ])
  })

  it('문중 "UltraCode"(대소문자 혼합, 원문 casing 보존) → [일반, 하이라이트, 일반]', () => {
    expect(segmentOrchestrationKeywords('please UltraCode this')).toEqual([
      { text: 'please ', highlight: false },
      { text: 'UltraCode', highlight: true },
      { text: ' this', highlight: false },
    ])
  })

  it('문두 "/workflows" → 슬래시부터 하이라이트(선행 경계문자 제외)', () => {
    expect(segmentOrchestrationKeywords('/workflows 실행')).toEqual([
      { text: '/workflows', highlight: true },
      { text: ' 실행', highlight: false },
    ])
  })

  it('공백 뒤 "/workflows" → 공백은 일반 세그먼트에 포함', () => {
    expect(segmentOrchestrationKeywords('check /workflows now')).toEqual([
      { text: 'check ', highlight: false },
      { text: '/workflows', highlight: true },
      { text: ' now', highlight: false },
    ])
  })
})

describe('segmentOrchestrationKeywords — 복수 키워드', () => {
  it('같은 키워드 2회 등장 → 각각 하이라이트 세그먼트', () => {
    expect(segmentOrchestrationKeywords('ultracode and ultracode again')).toEqual([
      { text: 'ultracode', highlight: true },
      { text: ' and ', highlight: false },
      { text: 'ultracode', highlight: true },
      { text: ' again', highlight: false },
    ])
  })

  it('"ultracode"와 "/workflows" 혼합 등장', () => {
    expect(segmentOrchestrationKeywords('ultracode then /workflows')).toEqual([
      { text: 'ultracode', highlight: true },
      { text: ' then ', highlight: false },
      { text: '/workflows', highlight: true },
    ])
  })
})

describe('segmentOrchestrationKeywords — 인접 키워드(공백 1칸)', () => {
  it('"ultracode /workflows"(공백 1칸) → 두 하이라이트 사이 공백만 일반 세그먼트', () => {
    expect(segmentOrchestrationKeywords('ultracode /workflows')).toEqual([
      { text: 'ultracode', highlight: true },
      { text: ' ', highlight: false },
      { text: '/workflows', highlight: true },
    ])
  })

  it('"ultracode/workflows"(공백 없음) → "/workflows"는 경계 불충족으로 미하이라이트', () => {
    // WORKFLOWS_RE는 문두 또는 공백 뒤만 허용 — "e" 뒤 "/workflows"는 오탐 배제(P04 규칙 그대로).
    expect(segmentOrchestrationKeywords('ultracode/workflows')).toEqual([
      { text: 'ultracode', highlight: true },
      { text: '/workflows', highlight: false },
    ])
  })
})

describe('segmentOrchestrationKeywords — 오탐 배제(P04 규칙과 동일)', () => {
  it('"ultracoded"(뒤에 문자 이어짐) → 하이라이트 없음', () => {
    expect(segmentOrchestrationKeywords('this is ultracoded already')).toEqual([
      { text: 'this is ultracoded already', highlight: false },
    ])
  })

  it('"multracode"(앞에 문자 붙음) → 하이라이트 없음', () => {
    expect(segmentOrchestrationKeywords('run multracode now')).toEqual([
      { text: 'run multracode now', highlight: false },
    ])
  })

  it('"//workflows"(슬래시 2개) → 하이라이트 없음', () => {
    expect(segmentOrchestrationKeywords('see //workflows here')).toEqual([
      { text: 'see //workflows here', highlight: false },
    ])
  })
})

describe('segmentOrchestrationKeywords — 개행 포함', () => {
  it('개행 뒤 "ultracode"도 감지 + 개행 문자 자체는 일반 세그먼트에 보존', () => {
    expect(segmentOrchestrationKeywords('설명:\nultracode --run\n확인')).toEqual([
      { text: '설명:\n', highlight: false },
      { text: 'ultracode', highlight: true },
      { text: ' --run\n확인', highlight: false },
    ])
  })
})

describe('segmentOrchestrationKeywords — 세그먼트 재조립 = 원문(불변식)', () => {
  it('여러 세그먼트를 이어붙이면 원문과 정확히 일치한다', () => {
    const text = 'ultracode and /workflows\n그리고 UltraCode 한 번 더'
    const segs = segmentOrchestrationKeywords(text)
    expect(segs.map((s) => s.text).join('')).toBe(text)
  })
})
