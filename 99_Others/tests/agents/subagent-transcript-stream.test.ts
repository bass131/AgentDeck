import { describe, it, expect } from 'vitest'
import { mapClaudeStreamLine } from '../../../02_Source/main/01_agents/claudeStream'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'

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

describe('T1 — parent_tool_use_id 있는 메시지 text → text 이벤트에 parentToolId 부여', () => {
  it('child assistant text "child says hi" → [{type:text, delta:"child says hi", parentToolId:"toolu_sa1"}]', () => {
    const obj = mkChildAssistantText('toolu_sa1', 'child says hi')
    const events = mapClaudeStreamLine(obj)

    expect(events).toHaveLength(1)
    const ev = events[0]
    expect(ev.type).toBe('text')
    if (ev.type === 'text') {
      expect(ev.delta).toBe('child says hi')
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

describe('T2 — parent_tool_use_id 있는 메시지 thinking → thinking 이벤트에 parentToolId 부여', () => {
  it('child assistant thinking → [{type:thinking, text:..., parentToolId:"toolu_sa1"}]', () => {
    const obj = mkChildAssistantThinking('toolu_sa1', '서브에이전트가 생각 중입니다')
    const events = mapClaudeStreamLine(obj)

    expect(events).toHaveLength(1)
    const ev = events[0]
    expect(ev.type).toBe('thinking')
    if (ev.type === 'thinking') {
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
      expect(ev.text.length).toBeLessThanOrEqual(90)
      expect((ev as AgentEvent & { parentToolId?: string }).parentToolId).toBe('toolu_sa2')
    }
  })
})

describe('T3 — parent_tool_use_id 없는(null) 최상위 메시지 text → parentToolId 없음(회귀)', () => {
  it('parent_tool_use_id=null → 반환 text 이벤트에 parentToolId 없음', () => {
    const obj = mkTopLevelAssistantText('최상위 응답입니다')
    const events = mapClaudeStreamLine(obj)

    expect(events).toHaveLength(1)
    const ev = events[0]
    expect(ev.type).toBe('text')
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

    const textEvs = events.filter(e => e.type === 'text')
    expect(textEvs).toHaveLength(1)
    expect((textEvs[0] as AgentEvent & { parentToolId?: string }).parentToolId).toBeUndefined()
  })
})

describe('T4 — parent_tool_use_id 있는 메시지 tool_use → tool_call에 parentToolId(M4-4 회귀 유지)', () => {
  it('child assistant tool_use(Bash) → [{type:tool_call, parentToolId:"toolu_sa1"}]', () => {
    const obj = mkChildAssistantToolUse('toolu_sa1', 'toolu_child_bash_001', 'Bash')
    const events = mapClaudeStreamLine(obj)

    expect(events).toHaveLength(1)
    const ev = events[0] as AgentEvent & { type: 'tool_call' }
    expect(ev.type).toBe('tool_call')
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
