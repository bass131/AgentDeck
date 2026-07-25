/**
 * subagentMeta.test.ts — subagentMeta.ts 순수 판별/정제 함수 골든 테스트 (TDD RED)
 *
 * 대상 모듈: 02.Source/main/01_agents/subagentMeta.ts (미존재 → 컴파일-RED)
 * 합의 API:
 *   isInternalAgentMetaText(text: string): boolean
 *   sanitizeSubagentToolResult(output: unknown): unknown
 *
 * 근거(실측 스크린샷): 01.Phases/UC1-ultracode-redesign/Screenshot/
 * "SubAgent_상세페이지가_사람이 읽기에 정보가 너무 난잡함...png" — Task/Agent 서브에이전트
 * launch tool_result에 하네스 내부 지침 원문("Async agent launched successfully...
 * agentId: ... output_file: ... Do NOT Read or tail...")이 그대로 노출됨.
 *
 * 검증 범위:
 *   M1 async 백그라운드 launch 확인 텍스트(단일 문자열, 스크린샷 실측 형태) → 메타 판정
 *   M2 동기 완료 2블록 배열([실제 결과, agentId+usage 메타]) → 메타 블록만 제거
 *   M3 agentId 단독 언급(보강 신호 없음) → 메타 아님(과필터 방지)
 *   M4 실제 결과 텍스트 보존(순수 문자열, 메타 아님)
 *   M5 대소문자: "Use SendMessage"(대문자 U) → 메타 판정(렌더러 helpers.ts 소문자 전용
 *      버그가 실제 노출 원인이었음 — 백엔드 정규화는 case-insensitive 필수)
 *   M6 <usage> 태그만으로도(agentId 동반 시) 메타 판정
 *   M7 text 블록 아닌 배열 원소는 그대로 보존(과필터 방지)
 *   M8 output이 객체/undefined 등 알 수 없는 형태 → 원형 그대로 통과
 */

import { describe, it, expect } from 'vitest'
import { isInternalAgentMetaText, sanitizeSubagentToolResult } from '../../../02.Source/main/01_agents/subagentMeta'

// ── 실측 픽스처 (스크린샷 원문 그대로) ──────────────────────────────────────────

const ASYNC_LAUNCH_META =
  "Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)\n" +
  "agentId: a1eb66c99aa76e143 (internal ID - do not mention to user. Use SendMessage with to: 'a1eb66c99aa76e143', summary: '<5-10 word recap>' to continue this agent.)\n" +
  "The agent is working in the background. You will be notified automatically when it completes.\n" +
  "Do not duplicate this agent's work — avoid working with the same files or topics it is using.\n" +
  "output_file: C:\\Users\\bass1\\AppData\\Local\\Temp\\claude\\C--Dev-Test-Project\\fffbc759-f34c-4795-8da6-f7288e3793af\\tasks\\a1eb66c99aa76e143.output\n" +
  "Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript and reading it will overflow your context. If the user asks for progress, say the agent is still running; you'll be notified when it completes."

const REAL_RESULT_TEXT = 'Button.ts는 `label`과 선택적 `disabled` 속성을 받아 `[label]` 형태의 문자열을 반환하는 간단한 버튼 컴포넌트 함수를 정의합니다.'

const SYNC_META_BLOCK = "agentId: abc123 (use SendMessage with to: 'abc123')\n<usage>subagent_tokens: 10291</usage>"

// ═══════════════════════════════════════════════════════════════════════════════
describe('isInternalAgentMetaText — M1/M5/M6 실측 형태 판정', () => {
  it('M1: 스크린샷 실측 async launch 텍스트 → 메타 판정(true)', () => {
    expect(isInternalAgentMetaText(ASYNC_LAUNCH_META)).toBe(true)
  })

  it('M5: 대문자 "Use SendMessage" 포함 텍스트 → 메타 판정(case-insensitive 필수)', () => {
    const t = "agentId: xyz789 (Use SendMessage with to: 'xyz789' to continue)"
    expect(isInternalAgentMetaText(t)).toBe(true)
  })

  it('M6: agentId + <usage> 태그만으로도 메타 판정', () => {
    expect(isInternalAgentMetaText(SYNC_META_BLOCK)).toBe(true)
  })

  it('M1-b: output_file: 라벨 줄만으로도(agentId 동반) 메타 판정', () => {
    const t = 'agentId: foo\noutput_file: C:\\tmp\\foo.output'
    expect(isInternalAgentMetaText(t)).toBe(true)
  })
})

describe('isInternalAgentMetaText — M3/M4 과필터 방지(실제 결과 보존)', () => {
  it('M3: agentId 단독 언급(보강 신호 없음) → 메타 아님(false)', () => {
    const t = '이 API는 응답에 agentId 필드를 포함합니다.'
    expect(isInternalAgentMetaText(t)).toBe(false)
  })

  it('M4: 실제 결과 텍스트(메타 마커 전혀 없음) → 메타 아님(false)', () => {
    expect(isInternalAgentMetaText(REAL_RESULT_TEXT)).toBe(false)
  })

  it('M4-b: 빈 문자열 → 메타 아님(false), 크래시 0', () => {
    expect(isInternalAgentMetaText('')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('sanitizeSubagentToolResult — 문자열 output', () => {
  it('M1: async launch 메타 전체 문자열 → 빈 문자열로 정제', () => {
    expect(sanitizeSubagentToolResult(ASYNC_LAUNCH_META)).toBe('')
  })

  it('M4: 실제 결과 문자열 → 그대로 보존(회귀 0)', () => {
    expect(sanitizeSubagentToolResult(REAL_RESULT_TEXT)).toBe(REAL_RESULT_TEXT)
  })
})

describe('sanitizeSubagentToolResult — 배열 output(2블록: 결과 + 메타)', () => {
  it('M2: [실제 결과, agentId+usage 메타] → 메타 블록만 제거, 실제 결과 보존', () => {
    const output = [
      { type: 'text', text: '바이너리 서치는 정렬된 배열에서 절반씩 좁혀 찾는다.' },
      { type: 'text', text: SYNC_META_BLOCK },
    ]
    const result = sanitizeSubagentToolResult(output) as Array<{ type: string; text: string }>
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('바이너리 서치는 정렬된 배열에서 절반씩 좁혀 찾는다.')
  })

  it('M2-b: 단일 text 블록(메타 아님) → 그대로 보존(회귀 0)', () => {
    const output = [{ type: 'text', text: 'ALPHA' }]
    const result = sanitizeSubagentToolResult(output) as Array<{ type: string; text: string }>
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('ALPHA')
  })

  it('M7: text 블록이 아닌 원소는 판정 대상 아님 → 그대로 보존', () => {
    const output = [
      { type: 'image', source: 'data:...' },
      { type: 'text', text: SYNC_META_BLOCK },
    ]
    const result = sanitizeSubagentToolResult(output) as unknown[]
    expect(result).toHaveLength(1)
    expect((result[0] as { type: string }).type).toBe('image')
  })
})

describe('sanitizeSubagentToolResult — 알 수 없는 형태(과필터 방지)', () => {
  it('M8: 객체 output(text 블록 배열 아님) → 원형 그대로 통과', () => {
    const output = { result: '완료', files: ['a.ts'] }
    expect(sanitizeSubagentToolResult(output)).toEqual(output)
  })

  it('M8-b: null/undefined → 원형 그대로 통과(크래시 0)', () => {
    expect(sanitizeSubagentToolResult(null)).toBeNull()
    expect(sanitizeSubagentToolResult(undefined)).toBeUndefined()
  })
})
