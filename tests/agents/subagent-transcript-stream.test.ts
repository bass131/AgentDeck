/**
 * subagent-transcript-stream.test.ts — Phase 37 #3: claude-stream parentToolId 부여 TDD RED
 *
 * 검증 대상: mapClaudeStreamLine — parent_tool_use_id 있는 메시지에서
 *   text/thinking 이벤트에도 parentToolId를 부여하는 계약.
 *
 * 현재 구현: text/thinking에 parentToolId 미부여(버그) → 이 테스트 RED.
 * 구현 수정 후 GREEN 예정.
 *
 * T1: parent_tool_use_id 있는 메시지 text → parentToolId 부여
 * T2: parent_tool_use_id 있는 메시지 thinking → parentToolId 부여
 * T3: parent_tool_use_id 없는(또는 null) 최상위 text → parentToolId 없음(회귀)
 * T4: parent_tool_use_id 있는 메시지의 tool_use → tool_call에 parentToolId(기존 M4-4 동작 유지)
 */
import { describe, it, expect } from 'vitest'
import { mapClaudeStreamLine } from '../../src/main/01_agents/claude-stream'
import type { AgentEvent } from '../../src/shared/agent-events'

// ── 픽스처 ────────────────────────────────────────────────────────────────────

/** parent_tool_use_id 있는 assistant 메시지 (text 블록) */
function mkChildAssistantText(parentToolId: string, text: string) {
  return {
    type: 'assistant',
    parent_tool_use_id: parentToolId,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text }],
    },
    parent_tool_use_id_resolved: parentToolId,
    uuid: 'uuid-child-text-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'session-child-001',
  }
}

/** parent_tool_use_id 있는 assistant 메시지 (thinking 블록) */
function mkChildAssistantThinking(parentToolId: string, thinking: string) {
  return {
    type: 'assistant',
    parent_tool_use_id: parentToolId,
    message: {
      role: 'assistant',
      content: [{ type: 'thinking', thinking }],
    },
    uuid: 'uuid-child-thk-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'session-child-001',
  }
}

/** parent_tool_use_id 없는(최상위) assistant 메시지 (text 블록) */
function mkTopLevelAssistantText(text: string) {
  return {
    type: 'assistant',
    parent_tool_use_id: null,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text }],
    },
    uuid: 'uuid-toplevel-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'session-top-001',
  }
}

/** parent_tool_use_id 있는 assistant 메시지 (tool_use 블록) */
function mkChildAssistantToolUse(parentToolId: string, toolId: string, toolName: string) {
  return {
    type: 'assistant',
    parent_tool_use_id: parentToolId,
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: toolId,
          name: toolName,
          input: { command: 'ls' },
        },
      ],
    },
    uuid: 'uuid-child-tool-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'session-child-001',
  }
}

// ── T1: parent_tool_use_id 있는 메시지 text → parentToolId 부여 ──────────────

describe('T1 — parent_tool_use_id 있는 메시지 text → text 이벤트에 parentToolId 부여', () => {
  it('child assistant text "child says hi" → [{type:text, delta:"child says hi", parentToolId:"toolu_sa1"}]', () => {
    const obj = mkChildAssistantText('toolu_sa1', 'child says hi')
    const events = mapClaudeStreamLine(obj)

    // RED: 현재 구현은 parentToolId를 text에 부여하지 않음 → 이 단정이 실패해야 함
    expect(events).toHaveLength(1)
    const ev = events[0]
    expect(ev.type).toBe('text')
    if (ev.type === 'text') {
      expect(ev.delta).toBe('child says hi')
      // 핵심 단정: parentToolId 부여 여부 (현재 구현에서 RED)
      expect((ev as AgentEvent & { parentToolId?: string }).parentToolId).toBe('toolu_sa1')
    }
  })

  it('parent_tool_use_id="toolu_task_001" → 반환 배열 = [{type:"text", delta:"Child agent response.", parentToolId:"toolu_task_001"}]', () => {
    const obj = mkChildAssistantText('toolu_task_001', 'Child agent response.')
    const events = mapClaudeStreamLine(obj)

    expect(events).toHaveLength(1)
    expect(events).toEqual<AgentEvent[]>([
      { type: 'text', delta: 'Child agent response.', parentToolId: 'toolu_task_001' }
    ])
  })
})

// ── T2: parent_tool_use_id 있는 메시지 thinking → parentToolId 부여 ───────────

describe('T2 — parent_tool_use_id 있는 메시지 thinking → thinking 이벤트에 parentToolId 부여', () => {
  it('child assistant thinking → [{type:thinking, text:..., parentToolId:"toolu_sa1"}]', () => {
    const obj = mkChildAssistantThinking('toolu_sa1', '서브에이전트가 생각 중입니다')
    const events = mapClaudeStreamLine(obj)

    expect(events).toHaveLength(1)
    const ev = events[0]
    expect(ev.type).toBe('thinking')
    if (ev.type === 'thinking') {
      // oneLine 90자 cap 적용됨
      expect((ev as AgentEvent & { parentToolId?: string }).parentToolId).toBe('toolu_sa1')
    }
  })

  it('thinking parentToolId — text 필드는 oneLine 정규화(90자 cap) 유지', () => {
    const longThinking = '서브에이전트의 긴 사고 과정: ' + 'a'.repeat(100)
    const obj = mkChildAssistantThinking('toolu_sa2', longThinking)
    const events = mapClaudeStreamLine(obj)

    expect(events).toHaveLength(1)
    const ev = events[0]
    expect(ev.type).toBe('thinking')
    if (ev.type === 'thinking') {
      // text는 90자 이하
      expect(ev.text.length).toBeLessThanOrEqual(90)
      // parentToolId는 그대로 전달
      expect((ev as AgentEvent & { parentToolId?: string }).parentToolId).toBe('toolu_sa2')
    }
  })
})

// ── T3: parent_tool_use_id 없는(또는 null) 최상위 text → parentToolId 없음(회귀) ──

describe('T3 — parent_tool_use_id 없는(null) 최상위 메시지 text → parentToolId 없음(회귀)', () => {
  it('parent_tool_use_id=null → 반환 text 이벤트에 parentToolId 없음', () => {
    const obj = mkTopLevelAssistantText('최상위 응답입니다')
    const events = mapClaudeStreamLine(obj)

    expect(events).toHaveLength(1)
    const ev = events[0]
    expect(ev.type).toBe('text')
    // 회귀 단정: 최상위 메시지는 parentToolId 미부여
    expect((ev as AgentEvent & { parentToolId?: string }).parentToolId).toBeUndefined()
  })

  it('parent_tool_use_id 필드 자체가 없는 경우도 parentToolId 없음', () => {
    const obj = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: '일반 응답' }],
      },
    }
    const events = mapClaudeStreamLine(obj)

    // 텍스트 이벤트 존재 여부
    const textEvs = events.filter(e => e.type === 'text')
    expect(textEvs).toHaveLength(1)
    // parentToolId 없음 (회귀 가드)
    expect((textEvs[0] as AgentEvent & { parentToolId?: string }).parentToolId).toBeUndefined()
  })
})

// ── T4: parent_tool_use_id 있는 메시지의 tool_use → tool_call에 parentToolId(기존 M4-4) ──

describe('T4 — parent_tool_use_id 있는 메시지 tool_use → tool_call에 parentToolId(M4-4 회귀 유지)', () => {
  it('child assistant tool_use(Bash) → [{type:tool_call, parentToolId:"toolu_sa1"}]', () => {
    const obj = mkChildAssistantToolUse('toolu_sa1', 'toolu_child_bash_001', 'Bash')
    const events = mapClaudeStreamLine(obj)

    expect(events).toHaveLength(1)
    const ev = events[0] as AgentEvent & { type: 'tool_call' }
    expect(ev.type).toBe('tool_call')
    // M4-4 기존 동작: tool_call에 parentToolId 부여
    expect(ev.parentToolId).toBe('toolu_sa1')
  })

  it('child assistant tool_use(Read) → tool_call id/name/input 정상 전달 + parentToolId 유지', () => {
    const obj = mkChildAssistantToolUse('toolu_sa1', 'toolu_child_read_001', 'Read')
    const events = mapClaudeStreamLine(obj)

    expect(events).toHaveLength(1)
    const ev = events[0] as AgentEvent & { type: 'tool_call' }
    expect(ev.type).toBe('tool_call')
    expect(ev.id).toBe('toolu_child_read_001')
    expect(ev.name).toBe('Read')
    expect(ev.parentToolId).toBe('toolu_sa1')
  })
})
