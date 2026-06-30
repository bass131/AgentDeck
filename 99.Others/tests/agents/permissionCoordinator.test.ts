/**
 * permissionCoordinator.test.ts — PermissionCoordinator 골든 테스트 (RF1-followup P03)
 *
 * ClaudeCodeBackend.ts에서 분리된 권한/질문 결정 로직(canUseTool + 양방향 응답 waiter)의
 * 거동을 고정한다. 분해 전 ClaudeAgentRun._makeCanUseTool/_requestPermission/
 * _handleAskQuestion/respond/abort(waiter cancel)와 1:1 동일.
 *
 * 권한경계(canUseTool) 모듈 경계 검증 — 이 클래스의 외부 의존은 push 콜백 하나뿐.
 */

import { describe, it, expect } from 'vitest'
import {
  PermissionCoordinator,
  parseQuestions,
  formatAnswers,
  permissionSummary,
} from '../../../02.Source/main/01_agents/permissionCoordinator'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

/** push된 이벤트를 수집하는 코디네이터 + 버퍼 생성 */
function mk(): { coord: PermissionCoordinator; pushed: AgentEvent[] } {
  const pushed: AgentEvent[] = []
  const coord = new PermissionCoordinator((e) => pushed.push(e))
  return { coord, pushed }
}

describe('PermissionCoordinator.makeCanUseTool — early-allow', () => {
  it("mode=auto → push 없이 allow", async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('auto', false)
    const r = await canUse('Bash', { command: 'rm -rf /' })
    expect(r).toEqual({ behavior: 'allow', updatedInput: { command: 'rm -rf /' } })
    expect(pushed).toEqual([])
  })

  it('READONLY 도구(Read) → push 없이 allow', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('normal', false)
    const r = await canUse('Read', { file_path: '/x' })
    expect(r.behavior).toBe('allow')
    expect(pushed).toEqual([])
  })

  it('acceptEdits + non-bash/non-mutating → allow', async () => {
    const { coord } = mk()
    const canUse = coord.makeCanUseTool('acceptEdits', false)
    const r = await canUse('WebFetch', { url: 'x' })
    expect(r.behavior).toBe('allow')
  })
})

describe('PermissionCoordinator.makeCanUseTool — 권한 요청 흐름', () => {
  it('Bash(normal) → permission_request push 후 respond(allow) 대기 해제', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('normal', false)
    const p = canUse('Bash', { command: 'ls' })
    // 동기적으로 permission_request가 push됨
    expect(pushed.length).toBe(1)
    const req = pushed[0] as { type: string; requestId: string; toolName: string; summary: string }
    expect(req.type).toBe('permission_request')
    expect(req.toolName).toBe('Bash')
    expect(req.summary).toContain('명령 실행')
    coord.respond(req.requestId, { kind: 'permission', behavior: 'allow' })
    const r = await p
    expect(r).toEqual({ behavior: 'allow', updatedInput: { command: 'ls' } })
  })

  it('respond(deny) → behavior deny + message', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('normal', false)
    const p = canUse('Write', { file_path: '/x' })
    const req = pushed[0] as { requestId: string }
    coord.respond(req.requestId, { kind: 'permission', behavior: 'deny' })
    const r = await p
    expect(r.behavior).toBe('deny')
    expect((r as { message: string }).message).toContain('거부')
  })

  it('respond(allow_always) → allow + 세션 규칙', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('normal', false)
    const p = canUse('Bash', { command: 'ls' })
    const req = pushed[0] as { requestId: string }
    coord.respond(req.requestId, { kind: 'permission', behavior: 'allow_always' })
    const r = await p
    expect(r.behavior).toBe('allow')
    expect((r as { updatedPermissions?: unknown[] }).updatedPermissions).toBeDefined()
  })
})

describe('PermissionCoordinator.makeCanUseTool — AskUserQuestion', () => {
  it('질문 있으면 question_request push 후 respond → deny+answers 메시지', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('normal', false)
    const input = {
      questions: [{ question: 'Q1', options: [{ label: 'A' }, { label: 'B' }] }],
    }
    const p = canUse('AskUserQuestion', input)
    expect(pushed.length).toBe(1)
    const req = pushed[0] as { type: string; requestId: string }
    expect(req.type).toBe('question_request')
    coord.respond(req.requestId, { kind: 'question', answers: [['A']] })
    const r = await p
    expect(r.behavior).toBe('deny')
    expect((r as { message: string }).message).toContain('A')
  })

  it('질문 없으면(빈 배열) 즉시 allow, push 없음', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('normal', false)
    const r = await canUse('AskUserQuestion', { questions: [] })
    expect(r.behavior).toBe('allow')
    expect(pushed).toEqual([])
  })
})

describe('PermissionCoordinator.makeCanUseTool — Workflow 게이트', () => {
  it('orchestration=false → Workflow 즉시 deny(push 없음)', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('auto', false)
    const r = await canUse('Workflow', {})
    expect(r.behavior).toBe('deny')
    expect(pushed).toEqual([])
  })

  it('orchestration=true → auto여도 Workflow 권한 요청', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('auto', true)
    const p = canUse('Workflow', {})
    expect(pushed.length).toBe(1)
    expect((pushed[0] as { type: string }).type).toBe('permission_request')
    const req = pushed[0] as { requestId: string }
    coord.respond(req.requestId, { kind: 'permission', behavior: 'allow' })
    const r = await p
    expect(r.behavior).toBe('allow')
  })
})

describe('PermissionCoordinator.respond / cancelAll', () => {
  it('미존재 requestId respond → no-op', () => {
    const { coord } = mk()
    expect(() => coord.respond('nope', { kind: 'permission', behavior: 'allow' })).not.toThrow()
  })

  it('cancelAll → 미해결 permission waiter deny resolve', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('normal', false)
    const p = canUse('Bash', { command: 'ls' })
    expect(pushed.length).toBe(1)
    coord.cancelAll()
    const r = await p
    expect(r.behavior).toBe('deny')
  })

  it('cancelAll → 미해결 question waiter null answers resolve(건너뜀 안내)', async () => {
    const { coord, pushed } = mk()
    const canUse = coord.makeCanUseTool('normal', false)
    const p = canUse('AskUserQuestion', { questions: [{ question: 'Q', options: [{ label: 'A' }] }] })
    expect(pushed.length).toBe(1)
    coord.cancelAll()
    const r = await p
    expect(r.behavior).toBe('deny')
    expect((r as { message: string }).message).toContain('건너뛰었습니다')
  })
})

describe('순수 헬퍼', () => {
  it('parseQuestions: options 없는 항목 제외', () => {
    const out = parseQuestions({
      questions: [
        { question: 'Q1', options: [{ label: 'A' }] },
        { question: 'Q2', options: [] },
        { question: 'Q3' },
      ],
    })
    expect(out.length).toBe(1)
    expect(out[0].question).toBe('Q1')
  })

  it('formatAnswers(null) → 건너뜀 안내', () => {
    const s = formatAnswers([], null)
    expect(s).toContain('건너뛰었습니다')
  })

  it('formatAnswers: 질문별 선택 나열', () => {
    const qs = parseQuestions({ questions: [{ question: 'Q1', header: 'H1', options: [{ label: 'A' }] }] })
    const s = formatAnswers(qs, [['A']])
    expect(s).toContain('H1')
    expect(s).toContain('A')
  })

  it('permissionSummary: 도구별 1줄 요약', () => {
    expect(permissionSummary('Bash', { command: 'ls -la' })).toContain('명령 실행')
    expect(permissionSummary('Write', { file_path: '/a' })).toContain('파일 생성')
    expect(permissionSummary('Edit', { file_path: '/a' })).toContain('파일 편집')
    expect(permissionSummary('Glob', {})).toBe('Glob 실행')
  })
})
