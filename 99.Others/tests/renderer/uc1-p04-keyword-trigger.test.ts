/**
 * uc1-p04-keyword-trigger.test.ts — UC1 Phase 04: UltraCode 키워드 턴 트리거 순수 함수(TDD RED).
 *
 * ADR-032 §2: 메시지 본문에 "ultracode"(대소문자 무관, 단어 경계) 또는 "/workflows"
 * (문두/공백 뒤 리터럴)가 언급되면 토글 상태와 무관하게 그 턴은 orchestration=true.
 * 순수 함수 스펙 — DOM 미참조, 경계 케이스만 검증(단순 규칙, 과설계 금지).
 */
import { describe, it, expect } from 'vitest'
import { detectOrchestrationKeyword } from '../../../02.Source/renderer/src/lib/orchestrationKeyword'

describe('detectOrchestrationKeyword — "ultracode" 대소문자 무관', () => {
  it('"UltraCode" 감지', () => {
    expect(detectOrchestrationKeyword('UltraCode 모드로 해줘')).toBe(true)
  })

  it('"ULTRACODE" 감지', () => {
    expect(detectOrchestrationKeyword('ULTRACODE 실행')).toBe(true)
  })

  it('"ultracode" 감지', () => {
    expect(detectOrchestrationKeyword('ultracode로 병렬 처리해줘')).toBe(true)
  })
})

describe('detectOrchestrationKeyword — 단어 경계(부분단어 오탐 방지)', () => {
  it('"ultracoded"는 오탐 X (뒤에 문자 이어짐)', () => {
    expect(detectOrchestrationKeyword('this is ultracoded already')).toBe(false)
  })

  it('"multracode"는 오탐 X (앞에 문자 붙음)', () => {
    expect(detectOrchestrationKeyword('run multracode now')).toBe(false)
  })
})

describe('detectOrchestrationKeyword — "/workflows" 리터럴', () => {
  it('문장 중간 공백 뒤 "/workflows" 감지', () => {
    expect(detectOrchestrationKeyword('please check /workflows for this')).toBe(true)
  })

  it('문두 "/workflows" 감지', () => {
    expect(detectOrchestrationKeyword('/workflows 실행해줘')).toBe(true)
  })

  it('"//workflows"(슬래시 2개)는 오탐 X', () => {
    expect(detectOrchestrationKeyword('see //workflows in the url')).toBe(false)
  })

  it('"a/workflows"(문자 바로 뒤)는 오탐 X', () => {
    expect(detectOrchestrationKeyword('path is a/workflows here')).toBe(false)
  })

  it('"/workflowsx"(단어 경계 없이 이어짐)는 오탐 X', () => {
    expect(detectOrchestrationKeyword('check /workflowsx dir')).toBe(false)
  })
})

describe('detectOrchestrationKeyword — 빈 문자열', () => {
  it('빈 문자열 → false', () => {
    expect(detectOrchestrationKeyword('')).toBe(false)
  })

  it('키워드 없는 일반 텍스트 → false', () => {
    expect(detectOrchestrationKeyword('hello world, please fix the bug')).toBe(false)
  })
})

describe('detectOrchestrationKeyword — 코드블록 안 언급도 감지(단순 규칙)', () => {
  it('코드펜스 안 "ultracode" 언급도 감지', () => {
    const text = '설명:\n```\nultracode --run\n```\n확인 부탁'
    expect(detectOrchestrationKeyword(text)).toBe(true)
  })

  it('코드펜스 안 "/workflows" 언급도 감지', () => {
    const text = '경로 확인:\n```bash\ncat /workflows/foo.yml\n```'
    // 코드펜스 내부라도 앞이 공백/개행이면 감지(단순 규칙 — 마크다운 파싱 안 함)
    expect(detectOrchestrationKeyword(text)).toBe(true)
  })
})
