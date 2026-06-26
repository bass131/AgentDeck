/**
 * todos-persistence.test.ts — F-D(2부): 할 일은 다음 계획(새 TodoWrite)까지 유지.
 *
 * 사용자 요구: "Task도 다음 Task가 새로 생기기 전까지는 그대로 두다가, 새로운 Task
 * 생기면 새로 업데이트". 즉 done/text/tool 이벤트로 todos가 비워지지 않고, 새 todos
 * 이벤트(TodoWrite)가 올 때만 교체된다(현 동작 보존 가드).
 *
 * TD1: todos 설정 후 done 이벤트 → todos 유지(미clear)
 * TD2: 새 todos 이벤트 → 교체(overwrite)
 * TD3: text/tool_call 이벤트 → todos 불변
 */
import { describe, it, expect } from 'vitest'
import { applyAgentEvent, makeInitialState } from '../../src/renderer/src/store/reducer'
import type { AgentEventPayload } from '../../src/shared/ipc-contract'

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
    // done에 clear 안 함 — 다음 계획까지 유지
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
