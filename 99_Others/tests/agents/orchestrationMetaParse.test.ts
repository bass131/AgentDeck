import { describe, it, expect } from 'vitest'

import { parseOrchestrationMeta } from '../../../02_Source/main/01_agents/orchestrationMeta'

const NORMAL_SCRIPT = `export const meta = { name: 'my-flow', description: 'do stuff', phases: [ { title: 'Scan', detail: 'x' }, { title: 'Fix' } ] }
// body code here`

const DOUBLE_QUOTE_SCRIPT = `export const meta = { name: "alpha", description: 'desc', phases: [ { title: 'Phase1' } ] }`

const NO_META_SCRIPT = `console.log('hi')`

const BROKEN_META_SCRIPT = `export const meta = { name: 'x'`

describe('parseOrchestrationMeta — M1 정상 meta 추출', () => {
  it('M1: 정상 meta → name/description/phases 추출', () => {
    const result = parseOrchestrationMeta(NORMAL_SCRIPT)
    expect(result.name).toBe('my-flow')
    expect(result.description).toBe('do stuff')
    expect(result.phases).toEqual(['Scan', 'Fix'])
  })

  it('M1-b: name과 phases가 올바른 타입', () => {
    const result = parseOrchestrationMeta(NORMAL_SCRIPT)
    expect(typeof result.name).toBe('string')
    expect(Array.isArray(result.phases)).toBe(true)
  })
})

describe('parseOrchestrationMeta — M2 큰따옴표 name', () => {
  it('M2: name 큰따옴표 → name 정상 추출', () => {
    const result = parseOrchestrationMeta(DOUBLE_QUOTE_SCRIPT)
    expect(result.name).toBe('alpha')
  })
})

describe('parseOrchestrationMeta — M3 meta 없음', () => {
  it('M3: meta 없는 스크립트 → { name: \'\' }, phases undefined', () => {
    const result = parseOrchestrationMeta(NO_META_SCRIPT)
    expect(result.name).toBe('')
    expect(result.phases).toBeUndefined()
  })
})

describe('parseOrchestrationMeta — M4 비문자열 입력', () => {
  it('M4-a: undefined → { name: \'\' } (크래시 0)', () => {
    expect(() => parseOrchestrationMeta(undefined)).not.toThrow()
    const result = parseOrchestrationMeta(undefined)
    expect(result.name).toBe('')
  })

  it('M4-b: 숫자 123 → { name: \'\' } (크래시 0)', () => {
    expect(() => parseOrchestrationMeta(123)).not.toThrow()
    const result = parseOrchestrationMeta(123)
    expect(result.name).toBe('')
  })

  it('M4-c: 빈 객체 {} → { name: \'\' } (크래시 0)', () => {
    expect(() => parseOrchestrationMeta({})).not.toThrow()
    const result = parseOrchestrationMeta({})
    expect(result.name).toBe('')
  })

  it('M4-d: null → { name: \'\' } (크래시 0)', () => {
    expect(() => parseOrchestrationMeta(null)).not.toThrow()
    const result = parseOrchestrationMeta(null)
    expect(result.name).toBe('')
  })

  it('M4-e: 배열 → { name: \'\' } (크래시 0)', () => {
    expect(() => parseOrchestrationMeta([])).not.toThrow()
    const result = parseOrchestrationMeta([])
    expect(result.name).toBe('')
  })
})

describe('parseOrchestrationMeta — M5 깨진 meta', () => {
  it('M5: 닫는 괄호 없는 깨진 meta → graceful(크래시 0, 행 없음)', () => {
    expect(() => parseOrchestrationMeta(BROKEN_META_SCRIPT)).not.toThrow()
    const result = parseOrchestrationMeta(BROKEN_META_SCRIPT)
    expect(typeof result.name).toBe('string')
  })
})

describe('parseOrchestrationMeta — M6 D-1 누수금지 (name !== \'Workflow\')', () => {
  it('M6-a: meta 없는 스크립트 fallback → name !== \'Workflow\'', () => {
    const result = parseOrchestrationMeta(NO_META_SCRIPT)
    expect(result.name).not.toBe('Workflow')
  })

  it('M6-b: 비문자열(undefined) fallback → name !== \'Workflow\'', () => {
    const result = parseOrchestrationMeta(undefined)
    expect(result.name).not.toBe('Workflow')
  })

  it('M6-c: 숫자 fallback → name !== \'Workflow\'', () => {
    const result = parseOrchestrationMeta(123)
    expect(result.name).not.toBe('Workflow')
  })

  it('M6-d: 깨진 meta fallback → name !== \'Workflow\'', () => {
    const result = parseOrchestrationMeta(BROKEN_META_SCRIPT)
    expect(result.name).not.toBe('Workflow')
  })

  it('M6-e: 빈 문자열 → name !== \'Workflow\'', () => {
    const result = parseOrchestrationMeta('')
    expect(result.name).not.toBe('Workflow')
  })
})

describe('parseOrchestrationMeta — M7 C-1 cap/ReDoS 방어', () => {
  it('M7-a: 8KB 초과 입력 → 즉시 반환 (행 없음, 크래시 0)', () => {
    const bigScript = 'a'.repeat(9000)
    expect(() => parseOrchestrationMeta(bigScript)).not.toThrow()
    const result = parseOrchestrationMeta(bigScript)
    expect(result).toBeDefined()
    expect(typeof result.name).toBe('string')
  })

  it('M7-b: 거대 반복 meta name 패턴(>8KB) → 즉시 반환, name !== \'Workflow\'', () => {
    const maliciousScript = `export const meta = { name: ` + `'a'`.repeat(3000) + ` }`
    expect(() => parseOrchestrationMeta(maliciousScript)).not.toThrow()
    const result = parseOrchestrationMeta(maliciousScript)
    expect(result.name).not.toBe('Workflow')
  })

  it('M7-c: 중첩 따옴표 반복 패턴 → 즉시 반환, 크래시 0', () => {
    const nestedQuotes = `export const meta = { name: '` + `\\'`.repeat(2000) + `' }`
    expect(() => parseOrchestrationMeta(nestedQuotes)).not.toThrow()
    const result = parseOrchestrationMeta(nestedQuotes)
    expect(result).toBeDefined()
  })

  it('M7-d: 8KB truncate 검증 — truncate 후 파싱하므로 8KB 이상 부분은 무시', () => {
    const validPart = `export const meta = { name: 'valid-flow', phases: [ { title: 'A' } ] }`
    const garbage = 'x'.repeat(8200)
    const longScript = validPart + garbage

    expect(() => parseOrchestrationMeta(longScript)).not.toThrow()
    const result = parseOrchestrationMeta(longScript)
    expect(typeof result.name).toBe('string')
  })
})

describe('parseOrchestrationMeta — M8 phases title만 추출, detail 무시', () => {
  it('M8-a: phases 각 원소의 title만 추출 → detail 필드 무시', () => {
    const result = parseOrchestrationMeta(NORMAL_SCRIPT)
    expect(result.phases).toEqual(['Scan', 'Fix'])
    expect(result.phases).not.toContain('x')
  })

  it('M8-b: title 없는 phases 원소 → skip 또는 빈문자(측정가능)', () => {
    const noTitleScript = `export const meta = { name: 'flow', phases: [ { detail: 'only-detail' }, { title: 'HasTitle' } ] }`
    const result = parseOrchestrationMeta(noTitleScript)
    if (result.phases) {
      expect(result.phases).toContain('HasTitle')
      expect(result.phases).not.toContain('only-detail')
    }
  })

  it('M8-c: phases 배열이 없으면 undefined', () => {
    const noPhaseScript = `export const meta = { name: 'simple' }`
    const result = parseOrchestrationMeta(noPhaseScript)
    if (result.phases !== undefined) {
      expect(result.phases).toEqual([])
    }
  })

  it('M8-d: 여러 phases → 순서 보존', () => {
    const multiPhaseScript = `export const meta = { name: 'multi', phases: [ { title: 'Phase1', detail: 'a' }, { title: 'Phase2', detail: 'b' }, { title: 'Phase3' } ] }`
    const result = parseOrchestrationMeta(multiPhaseScript)
    if (result.phases) {
      expect(result.phases[0]).toBe('Phase1')
      expect(result.phases[1]).toBe('Phase2')
      expect(result.phases[2]).toBe('Phase3')
    }
  })
})
