/**
 * composerHighlight.test.ts — FB2 Phase 06: 컴포저 하이라이트 통합 세그먼트 분해
 * (오케스트레이션 키워드 + 슬래시 커맨드 토큰 병합) 순수 함수 테스트(TDD RED → GREEN).
 *
 * segmentComposerHighlights는 orchestrationKeyword.ts(ADR-032 단일 진실원, 미변경)의
 * segmentOrchestrationKeywords와 slashTokenHighlight.ts의 segmentSlashTokens을 한 번의
 * 선형 스캔 결과로 병합한다. 핵심 불변식: "/workflows"처럼 두 규칙에 동시에 걸리는
 * 구간은 orchestration이 우선(중복 하이라이트·타입 충돌 방지) — 이미 ultracode 브랜드
 * 그라데이션으로 특별 취급되는 키워드라 일반 슬래시 색으로 덮어써지면 안 된다.
 */
import { describe, it, expect } from 'vitest'
import { segmentComposerHighlights } from '../../../02.Source/renderer/src/lib/composerHighlight'

describe('segmentComposerHighlights — 빈 입력/하이라이트 없음', () => {
  it('빈 문자열 → 빈 배열', () => {
    expect(segmentComposerHighlights('')).toEqual([])
  })

  it('키워드도 슬래시 토큰도 없는 텍스트 → 세그먼트 1개(kind:none)', () => {
    expect(segmentComposerHighlights('hello world')).toEqual([
      { text: 'hello world', kind: 'none' },
    ])
  })
})

describe('segmentComposerHighlights — 오케스트레이션 키워드만', () => {
  it('"ultracode" → kind:orchestration', () => {
    expect(segmentComposerHighlights('ultracode 실행')).toEqual([
      { text: 'ultracode', kind: 'orchestration' },
      { text: ' 실행', kind: 'none' },
    ])
  })
})

describe('segmentComposerHighlights — 슬래시 커맨드만', () => {
  it('"/work-run" → kind:slash', () => {
    expect(segmentComposerHighlights('/work-run 실행')).toEqual([
      { text: '/work-run', kind: 'slash' },
      { text: ' 실행', kind: 'none' },
    ])
  })

  it('"/session:end"(콜론 네임스페이스) → kind:slash', () => {
    expect(segmentComposerHighlights('이제 /session:end')).toEqual([
      { text: '이제 ', kind: 'none' },
      { text: '/session:end', kind: 'slash' },
    ])
  })
})

describe('segmentComposerHighlights — 핵심 불변식: "/workflows"는 orchestration 우선', () => {
  it('"/workflows"는 슬래시 정규식에도 걸리지만 kind는 orchestration(중복 없음)', () => {
    expect(segmentComposerHighlights('/workflows 시작')).toEqual([
      { text: '/workflows', kind: 'orchestration' },
      { text: ' 시작', kind: 'none' },
    ])
  })
})

describe('segmentComposerHighlights — 혼합', () => {
  it('"ultracode"와 "/work-run"이 한 문장에 등장 → 각각 orchestration/slash', () => {
    expect(segmentComposerHighlights('ultracode 하고 /work-run 실행')).toEqual([
      { text: 'ultracode', kind: 'orchestration' },
      { text: ' 하고 ', kind: 'none' },
      { text: '/work-run', kind: 'slash' },
      { text: ' 실행', kind: 'none' },
    ])
  })

  it('"/workflows"와 일반 슬래시 커맨드가 함께 등장 → 각각 orchestration/slash로 구분', () => {
    expect(segmentComposerHighlights('먼저 /workflows 다음 /session:end')).toEqual([
      { text: '먼저 ', kind: 'none' },
      { text: '/workflows', kind: 'orchestration' },
      { text: ' 다음 ', kind: 'none' },
      { text: '/session:end', kind: 'slash' },
    ])
  })
})

describe('segmentComposerHighlights — 오탐 배제(슬래시 쪽 규칙 그대로 적용)', () => {
  it('"/c/Dev/AgentDeck" 경로는 orchestration도 slash도 아님', () => {
    expect(segmentComposerHighlights('파일은 /c/Dev/AgentDeck/foo.ts 에')).toEqual([
      { text: '파일은 /c/Dev/AgentDeck/foo.ts 에', kind: 'none' },
    ])
  })
})

describe('segmentComposerHighlights — 세그먼트 재조립 = 원문(불변식)', () => {
  it('여러 세그먼트를 이어붙이면 원문과 정확히 일치한다', () => {
    const text = 'ultracode 하고 /workflows 다음 /session:end 그리고 /c/Dev/AgentDeck 은 경로'
    const segs = segmentComposerHighlights(text)
    expect(segs.map((s) => s.text).join('')).toBe(text)
  })
})
