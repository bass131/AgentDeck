/**
 * workingPhrases.test.ts — WORKING_PHRASES/nextPhraseIndex 순수 자산 직접경로 검증
 * (TG1 P04: Conversation.tsx 내부 정의를 lib/workingPhrases.ts로 추출 — 순환참조 회피,
 * 자세한 근거는 lib/workingPhrases.ts 파일 주석 참조).
 *
 * p14a-working-phrases.test.tsx가 이미 Conversation.tsx 재-export 경로로 이 값들을
 * 검증하고 있다 — 이 파일은 추출된 lib 파일 자체(직접 경로)에 대한 동등 계약을 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { WORKING_PHRASES, nextPhraseIndex } from '../../../02.Source/renderer/src/lib/workingPhrases'

describe('tg1-p04 — lib/workingPhrases (직접 경로)', () => {
  it('WORKING_PHRASES: 10개 이상, 각 항목 비어있지 않은 문자열', () => {
    expect(Array.isArray(WORKING_PHRASES)).toBe(true)
    expect(WORKING_PHRASES.length).toBeGreaterThanOrEqual(10)
    for (const phrase of WORKING_PHRASES) {
      expect(typeof phrase).toBe('string')
      expect(phrase.length).toBeGreaterThan(0)
    }
  })

  it('nextPhraseIndex: 순환 범위 내(0 <= idx < len), len<2면 항상 0', () => {
    const len = WORKING_PHRASES.length
    let cur = 0
    for (let n = 0; n < 50; n++) {
      cur = nextPhraseIndex(cur, len)
      expect(cur).toBeGreaterThanOrEqual(0)
      expect(cur).toBeLessThan(len)
    }
    expect(nextPhraseIndex(0, 1)).toBe(0)
    expect(nextPhraseIndex(0, 0)).toBe(0)
  })

  it('nextPhraseIndex: (cur+1) % len 결정적 순환 — non-repeating(len>=2)', () => {
    expect(nextPhraseIndex(0, 3)).toBe(1)
    expect(nextPhraseIndex(1, 3)).toBe(2)
    expect(nextPhraseIndex(2, 3)).toBe(0)
  })
})
