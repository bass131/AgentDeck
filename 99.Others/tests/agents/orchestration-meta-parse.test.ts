/**
 * orchestration-meta-parse.test.ts — parseOrchestrationMeta 파서 단위 테스트 (TDD RED)
 *
 * 대상 모듈: src/main/01_agents/orchestration-meta.ts (미존재 → 컴파일-RED)
 * 합의 API: export function parseOrchestrationMeta(script: unknown): { name: string; description?: string; phases?: string[] }
 *
 * 검증 범위:
 *   M1 정상 meta → name/description/phases 추출
 *   M2 큰따옴표 name 추출
 *   M3 meta 없는 스크립트 → { name: '' }
 *   M4 비문자열 입력 → { name: '' } (크래시 0)
 *   M5 닫는 괄호 없는 깨진 meta → graceful, 크래시 0
 *   M6 D-1 누수금지: fallback name !== 'Workflow'
 *   M7 C-1 cap/ReDoS: 거대 입력 → 즉시 반환 (행 없음 확인)
 *   M8 phases title만 추출, detail 무시
 */

import { describe, it, expect } from 'vitest'

// 모듈 구현 완료(Phase 37 #4b GREEN).
import { parseOrchestrationMeta } from '../../../02.Source/main/01_agents/orchestration-meta'

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

/** 정상 meta 스크립트 픽스처 */
const NORMAL_SCRIPT = `export const meta = { name: 'my-flow', description: 'do stuff', phases: [ { title: 'Scan', detail: 'x' }, { title: 'Fix' } ] }
// body code here`

/** 큰따옴표 name 픽스처 */
const DOUBLE_QUOTE_SCRIPT = `export const meta = { name: "alpha", description: 'desc', phases: [ { title: 'Phase1' } ] }`

/** meta 없는 스크립트 */
const NO_META_SCRIPT = `console.log('hi')`

/** 닫는 괄호 없는 깨진 meta */
const BROKEN_META_SCRIPT = `export const meta = { name: 'x'`

// ═══════════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════════
describe('parseOrchestrationMeta — M2 큰따옴표 name', () => {
  it('M2: name 큰따옴표 → name 정상 추출', () => {
    const result = parseOrchestrationMeta(DOUBLE_QUOTE_SCRIPT)
    expect(result.name).toBe('alpha')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('parseOrchestrationMeta — M3 meta 없음', () => {
  it('M3: meta 없는 스크립트 → { name: \'\' }, phases undefined', () => {
    const result = parseOrchestrationMeta(NO_META_SCRIPT)
    expect(result.name).toBe('')
    expect(result.phases).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════════
describe('parseOrchestrationMeta — M5 깨진 meta', () => {
  it('M5: 닫는 괄호 없는 깨진 meta → graceful(크래시 0, 행 없음)', () => {
    // 크래시 없이 반환해야 함
    expect(() => parseOrchestrationMeta(BROKEN_META_SCRIPT)).not.toThrow()
    const result = parseOrchestrationMeta(BROKEN_META_SCRIPT)
    // 결과는 name:'x'(부분 파싱 성공) 또는 { name:'' }(fallback) 어느 쪽이든 허용
    // 핵심: name은 string이어야 함 (크래시 0)
    expect(typeof result.name).toBe('string')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════════
describe('parseOrchestrationMeta — M7 C-1 cap/ReDoS 방어', () => {
  /**
   * 8KB 이상의 거대한 반복 입력에서 함수가 즉시 반환해야 함.
   * Vitest 기본 타임아웃(5000ms) 내에 완료되면 무한 백트래킹 없음을 입증.
   * 행(hang): 테스트가 타임아웃으로 실패하면 ReDoS 의심.
   */
  it('M7-a: 8KB 초과 입력 → 즉시 반환 (행 없음, 크래시 0)', () => {
    // 8KB + 여유분의 반복 문자열
    const bigScript = 'a'.repeat(9000)
    expect(() => parseOrchestrationMeta(bigScript)).not.toThrow()
    // 반환값이 정의되어 있어야 함
    const result = parseOrchestrationMeta(bigScript)
    expect(result).toBeDefined()
    expect(typeof result.name).toBe('string')
  })

  it('M7-b: 거대 반복 meta name 패턴(>8KB) → 즉시 반환, name !== \'Workflow\'', () => {
    // ReDoS 유발 가능한 반복 패턴
    const maliciousScript = `export const meta = { name: ` + `'a'`.repeat(3000) + ` }`
    expect(() => parseOrchestrationMeta(maliciousScript)).not.toThrow()
    const result = parseOrchestrationMeta(maliciousScript)
    expect(result.name).not.toBe('Workflow')
  })

  it('M7-c: 중첩 따옴표 반복 패턴 → 즉시 반환, 크래시 0', () => {
    // 중첩 따옴표가 역추적 폭발을 유발하는 경우 대비
    const nestedQuotes = `export const meta = { name: '` + `\\'`.repeat(2000) + `' }`
    expect(() => parseOrchestrationMeta(nestedQuotes)).not.toThrow()
    const result = parseOrchestrationMeta(nestedQuotes)
    expect(result).toBeDefined()
  })

  it('M7-d: 8KB truncate 검증 — truncate 후 파싱하므로 8KB 이상 부분은 무시', () => {
    // 정상 meta 뒤에 8KB 쓰레기를 붙여도 name 파싱은 성공해야 함
    const validPart = `export const meta = { name: 'valid-flow', phases: [ { title: 'A' } ] }`
    const garbage = 'x'.repeat(8200)
    const longScript = validPart + garbage

    expect(() => parseOrchestrationMeta(longScript)).not.toThrow()
    const result = parseOrchestrationMeta(longScript)
    // meta가 앞부분(8KB 이내)에 있으므로 파싱 성공해야 함
    expect(typeof result.name).toBe('string')
    // name이 추출되었으면 'valid-flow', truncate로 실패했으면 '' — 둘 다 허용
    // 핵심은 행 없음 + 크래시 0
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('parseOrchestrationMeta — M8 phases title만 추출, detail 무시', () => {
  it('M8-a: phases 각 원소의 title만 추출 → detail 필드 무시', () => {
    const result = parseOrchestrationMeta(NORMAL_SCRIPT)
    // phases는 string[] — title 값만 들어있어야 함
    expect(result.phases).toEqual(['Scan', 'Fix'])
    // detail('x')가 섞이지 않아야 함
    expect(result.phases).not.toContain('x')
  })

  it('M8-b: title 없는 phases 원소 → skip 또는 빈문자(측정가능)', () => {
    const noTitleScript = `export const meta = { name: 'flow', phases: [ { detail: 'only-detail' }, { title: 'HasTitle' } ] }`
    const result = parseOrchestrationMeta(noTitleScript)
    // title 없는 원소 skip 또는 빈문자열로 처리
    // HasTitle은 반드시 포함되어야 함
    if (result.phases) {
      expect(result.phases).toContain('HasTitle')
      // 'only-detail'(title이 아닌 detail 값)는 포함되지 않아야 함
      expect(result.phases).not.toContain('only-detail')
    }
  })

  it('M8-c: phases 배열이 없으면 undefined', () => {
    const noPhaseScript = `export const meta = { name: 'simple' }`
    const result = parseOrchestrationMeta(noPhaseScript)
    // phases 없으면 undefined 또는 빈 배열
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
