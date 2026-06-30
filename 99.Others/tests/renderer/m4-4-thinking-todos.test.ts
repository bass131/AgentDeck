/**
 * m4-4-thinking-todos.test.ts — Phase 24a store reducer 단위 테스트.
 *
 * 검증 대상:
 *   - thinking 이벤트 → thinkingText 설정
 *   - thinking_clear 이벤트 → thinkingText null
 *   - text 이벤트 → thinkingText 정리(null)
 *   - todos 이벤트 → todos 갱신
 *   - done 이벤트 → thinkingText null, todos 보존
 *   - error 이벤트 → thinkingText null
 *   - makeInitialState → thinkingText:null, todos:[]
 *
 * Node 환경(window.api 불필요) — 순수 리듀서 테스트.
 */
import { describe, it, expect } from 'vitest'
import {
  applyAgentEvent,
  makeInitialState,
} from '../../../02.Source/renderer/src/store/reducer'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

const runId = 'run-m44'

function payload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

describe('Phase 24a — store reducer: thinking / todos', () => {
  it('makeInitialState: thinkingText=null, todos=[]', () => {
    const s = makeInitialState()
    expect(s.thinkingText).toBeNull()
    expect(s.todos).toEqual([])
  })

  it('thinking 이벤트 → thinkingText 설정', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'thinking', text: '코드 분석 중…' }))
    expect(s1.thinkingText).toBe('코드 분석 중…')
    expect(s1.isRunning).toBe(true)
  })

  it('thinking 이벤트 연속 → 마지막 text로 덮어씀', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'thinking', text: '첫 번째 생각' }))
    const s2 = applyAgentEvent(s1, payload({ type: 'thinking', text: '두 번째 생각' }))
    expect(s2.thinkingText).toBe('두 번째 생각')
  })

  it('thinking_clear 이벤트 → thinkingText null', () => {
    const s0 = { ...makeInitialState(), thinkingText: '생각 중…' }
    const s1 = applyAgentEvent(s0, payload({ type: 'thinking_clear' }))
    expect(s1.thinkingText).toBeNull()
  })

  it('text 이벤트 → thinkingText null(크로스-메시지 정리)', () => {
    const s0 = { ...makeInitialState(), thinkingText: '생각 중…' }
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: '안녕하세요' }))
    expect(s1.thinkingText).toBeNull()
    // Phase A-2: streamingText 없음 → thread의 assistant msg에 텍스트 누적
    const assistantMsg = s1.thread.find(
      (item) => item.kind === 'msg' && item.role === 'assistant'
    ) as Extract<import('../../../02.Source/renderer/src/store/threadTypes').ThreadItem, { kind: 'msg' }> | undefined
    expect(assistantMsg?.text).toBe('안녕하세요')
  })

  it('todos 이벤트 → todos 갱신', () => {
    const s0 = makeInitialState()
    const todos = [
      { id: 't1', label: '분석', status: 'done' as const },
      { id: 't2', label: '구현', status: 'running' as const },
      { id: 't3', label: '테스트', status: 'planned' as const },
    ]
    const s1 = applyAgentEvent(s0, payload({ type: 'todos', todos }))
    expect(s1.todos).toHaveLength(3)
    expect(s1.todos[0].id).toBe('t1')
    expect(s1.todos[1].status).toBe('running')
  })

  it('todos 이벤트 → 전체 스냅샷 덮어쓰기(이전 todos 대체)', () => {
    const s0 = {
      ...makeInitialState(),
      todos: [{ id: 'old', label: '구버전', status: 'planned' as const }],
    }
    const newTodos = [{ id: 'new1', label: '새 항목', status: 'running' as const }]
    const s1 = applyAgentEvent(s0, payload({ type: 'todos', todos: newTodos }))
    expect(s1.todos).toHaveLength(1)
    expect(s1.todos[0].id).toBe('new1')
  })

  it('done 이벤트 → thinkingText null, todos 보존', () => {
    const todos = [{ id: 't1', label: '완료', status: 'done' as const }]
    const s0 = {
      ...makeInitialState(),
      thinkingText: '아직 생각 중…',
      todos,
      isRunning: true,
    }
    const s1 = applyAgentEvent(s0, payload({ type: 'done' }))
    expect(s1.thinkingText).toBeNull()
    expect(s1.todos).toEqual(todos) // todos는 완료 후에도 보존
    expect(s1.isRunning).toBe(false)
  })

  it('error 이벤트 → thinkingText null', () => {
    const s0 = { ...makeInitialState(), thinkingText: '분석 중…', isRunning: true }
    const s1 = applyAgentEvent(s0, payload({ type: 'error', message: '엔진 오류' }))
    expect(s1.thinkingText).toBeNull()
    expect(s1.isRunning).toBe(false)
  })

  it('리듀서는 원본 상태를 변경하지 않는다 (순수함수 — thinking)', () => {
    const s0 = Object.freeze(makeInitialState())
    const s1 = applyAgentEvent(s0 as ReturnType<typeof makeInitialState>, payload({ type: 'thinking', text: 'x' }))
    expect(s1).not.toBe(s0)
    expect(s0.thinkingText).toBeNull()
  })

  it('리듀서는 원본 상태를 변경하지 않는다 (순수함수 — todos)', () => {
    const base = makeInitialState()
    const s0 = Object.freeze({ ...base, todos: [] as ReturnType<typeof makeInitialState>['todos'] })
    const todos = [{ id: 't1', label: 'a', status: 'done' as const }]
    const s1 = applyAgentEvent(s0 as unknown as ReturnType<typeof makeInitialState>, payload({ type: 'todos', todos }))
    expect(s1.todos).toHaveLength(1)
    expect(s0.todos).toHaveLength(0)
  })
})
