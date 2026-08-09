import { describe, it, expect } from 'vitest'
import { sanitizeDescription } from '../../../02_Source/main/01_agents/descriptionUtils'

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
    expect(sanitizeDescription('\n'.repeat(200))).toBe('')
  })
})

describe('sanitizeDescription — 비-string 방어 (신뢰경계 ADR-019)', () => {
  it('undefined → 빈 문자열', () => {
    expect(sanitizeDescription(undefined as unknown as string)).toBe('')
  })

  it('null → 빈 문자열', () => {
    expect(sanitizeDescription(null as unknown as string)).toBe('')
  })

  it('숫자 → 빈 문자열', () => {
    expect(sanitizeDescription(123 as unknown as string)).toBe('')
  })

  it('객체 → 빈 문자열 ([object Object] 누출 방지)', () => {
    expect(sanitizeDescription({} as unknown as string)).toBe('')
  })
})
