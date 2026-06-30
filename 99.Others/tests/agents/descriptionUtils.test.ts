/**
 * descriptionUtils.test.ts — sanitizeDescription 순수 함수 단위 테스트 (RF1-followup P02)
 *
 * TDD: 두 클래스(ClaudeAgentRun · RunEventNormalizer)에 중복돼 있던 static
 * `_sanitizeDescription`을 공통 순수 함수 `sanitizeDescription`으로 추출하기 전에
 * 기대 거동을 먼저 고정한다(거동 불변 자물쇠).
 *
 * 거동 사양(원본 engine.ts 미러):
 *  1. 개행(\r\n, \r, \n) → 공백 치환 + 양끝 trim.
 *  2. 200자 cap: 초과 시 199자 + '…'(줄임표). 결과 길이는 항상 ≤ 200.
 *  3. 200자 이내는 그대로 유지.
 */

import { describe, it, expect } from 'vitest'
import { sanitizeDescription } from '../../../02.Source/main/01_agents/descriptionUtils'

describe('sanitizeDescription — 개행 제거', () => {
  it('\\n을 공백으로 치환한다', () => {
    expect(sanitizeDescription('a\nb')).toBe('a b')
  })

  it('\\r\\n을 공백 하나로 치환한다', () => {
    expect(sanitizeDescription('a\r\nb')).toBe('a b')
  })

  it('\\r을 공백으로 치환한다', () => {
    expect(sanitizeDescription('a\rb')).toBe('a b')
  })

  it('혼합 개행을 모두 공백으로 치환한다', () => {
    expect(sanitizeDescription('a\nb\r\nc\rd')).toBe('a b c d')
  })

  it('양끝 공백을 trim한다', () => {
    expect(sanitizeDescription('  hello  ')).toBe('hello')
  })

  it('개행 치환 후 생긴 양끝 공백도 trim한다', () => {
    expect(sanitizeDescription('\nhello\n')).toBe('hello')
  })
})

describe('sanitizeDescription — 200자 길이 cap', () => {
  it('200자 이내는 그대로 유지한다', () => {
    const s = 'x'.repeat(200)
    expect(sanitizeDescription(s)).toBe(s)
    expect(sanitizeDescription(s).length).toBe(200)
  })

  it('정확히 200자는 자르지 않는다(경계)', () => {
    const s = 'a'.repeat(200)
    const out = sanitizeDescription(s)
    expect(out).not.toContain('…')
    expect(out.length).toBe(200)
  })

  it('201자는 199자 + …로 자른다', () => {
    const s = 'a'.repeat(201)
    const out = sanitizeDescription(s)
    expect(out.length).toBe(200)
    expect(out.endsWith('…')).toBe(true)
    expect(out.slice(0, 199)).toBe('a'.repeat(199))
  })

  it('매우 긴 입력도 결과 길이는 항상 200 이하', () => {
    const s = 'b'.repeat(5000)
    const out = sanitizeDescription(s)
    expect(out.length).toBeLessThanOrEqual(200)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('sanitizeDescription — 엣지 케이스', () => {
  it('빈 문자열은 빈 문자열을 반환한다', () => {
    expect(sanitizeDescription('')).toBe('')
  })

  it('공백만 있는 문자열은 빈 문자열로 trim된다', () => {
    expect(sanitizeDescription('   \n  ')).toBe('')
  })

  it('개행 제거가 cap보다 먼저 적용된다(개행 후 199자 미만)', () => {
    // 개행 200개 → 공백 200개 → trim → '' (cap 무관)
    expect(sanitizeDescription('\n'.repeat(200))).toBe('')
  })
})
