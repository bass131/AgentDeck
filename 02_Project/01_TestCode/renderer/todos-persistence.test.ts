import { describe, it, expect } from 'vitest'
import { applyAgentEvent, makeInitialState } from '../../../02_Project/00_Source/renderer/src/store/reducer'
import type { AgentEventPayload } from '../../../02_Project/00_Source/shared/ipcContract'

function payload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId: 'run-td', event }
}

const TODOS_A = [
  { id: '1', label: '분석', status: 'running' as const },
  { id: '2', label: '구현', status: 'planned' as const },
]

describe('F-D — todos는 다음 TodoWrite까지 유지', () => {
  it('TD1: todos 설정 후 done → todos 유지', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'todos', todos: TODOS_A }))
    expect(s.todos).toHaveLength(2)
    s = applyAgentEvent(s, payload({ type: 'done' }))
    expect(s.todos).toHaveLength(2)
    expect(s.todos[0].label).toBe('분석')
  })

  it('TD2: 새 todos 이벤트 → 교체', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'todos', todos: TODOS_A }))
    s = applyAgentEvent(s, payload({ type: 'todos', todos: [{ id: '9', label: '검증', status: 'running' }] }))
    expect(s.todos).toHaveLength(1)
    expect(s.todos[0].label).toBe('검증')
  })

  it('TD3: text/tool_call → todos 불변', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'todos', todos: TODOS_A }))
    s = applyAgentEvent(s, payload({ type: 'text', delta: '진행 중' }))
    s = applyAgentEvent(s, payload({ type: 'tool_call', id: 'tc1', name: 'Read', input: {} }))
    expect(s.todos).toHaveLength(2)
  })
})
