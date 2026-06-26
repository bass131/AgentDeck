// @vitest-environment jsdom
/**
 * m4-4-agentpanel-store.test.tsx — Phase 24a AgentPanel store 연결 테스트.
 *
 * 검증 대상:
 *   - store todos가 AgentPanel에 자동 반영(prop 없이)
 *   - todos prop이 있으면 prop 우선(override)
 *   - 빈 todos → 빈상태 텍스트
 *   - 채워진 todos → 진행바 + 행
 *   - selectTodos 셀렉터 동작
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

afterEach(() => cleanup())

async function getStore() {
  const mod = await import('../../src/renderer/src/store/appStore')
  return mod
}

async function renderPanel(storePatch: Record<string, unknown> = {}, props: Record<string, unknown> = {}) {
  const { useAppStore } = await getStore()
  useAppStore.setState({
    isRunning: false,
    changedFiles: new Set<string>(),
    toolCards: [],
    errorMessage: undefined,
    todos: [],
    thinkingText: null,
    ...storePatch,
  } as Parameters<typeof useAppStore.setState>[0])
  const { AgentPanel } = await import('../../src/renderer/src/components/05_agent/AgentPanel')
  return act(async () => render(<AgentPanel {...(props as Parameters<typeof AgentPanel>[0])} />))
}

describe('Phase 24a — AgentPanel store 연결', () => {
  it('store todos=[] → 빈상태 "아직 할 일이 없어요"', async () => {
    await renderPanel({ todos: [] })
    expect(screen.getByText('아직 할 일이 없어요')).toBeTruthy()
  })

  it('store todos 채워지면 → progress 바 + todo 행 렌더', async () => {
    const todos = [
      { id: 't1', label: '분석', status: 'done' as const },
      { id: 't2', label: '구현', status: 'running' as const },
      { id: 't3', label: '테스트', status: 'planned' as const },
    ]
    const { container } = await renderPanel({ todos })
    expect(container.querySelector('.progress')).toBeTruthy()
    expect(container.querySelectorAll('.todo').length).toBe(3)
  })

  it('store todos → done/running/planned 상태 클래스 렌더', async () => {
    const todos = [
      { id: 't1', label: '완료', status: 'done' as const },
      { id: 't2', label: '실행 중', status: 'running' as const },
      { id: 't3', label: '예정', status: 'planned' as const },
    ]
    const { container } = await renderPanel({ todos })
    expect(container.querySelector('.todo.done')).toBeTruthy()
    expect(container.querySelector('.todo.running')).toBeTruthy()
    expect(container.querySelector('.todo.planned')).toBeTruthy()
  })

  it('todos prop 있으면 prop 우선(store todos 무시)', async () => {
    const storeTodos = [{ id: 'store-1', label: 'store 항목', status: 'done' as const }]
    const propTodos = [
      { id: 'prop-1', label: 'prop 항목 A', status: 'running' as const },
      { id: 'prop-2', label: 'prop 항목 B', status: 'planned' as const },
    ]
    // store에 1개, prop에 2개 → prop 우선 → 2개 렌더
    const { container } = await renderPanel({ todos: storeTodos }, { todos: propTodos })
    expect(container.querySelectorAll('.todo').length).toBe(2)
    expect(screen.getByText('prop 항목 A')).toBeTruthy()
  })

  it('selectTodos 셀렉터가 store todos를 반환한다', async () => {
    const { useAppStore, selectTodos } = await getStore()
    const todos = [{ id: 't1', label: '셀렉터 테스트', status: 'planned' as const }]
    useAppStore.setState({ todos } as Parameters<typeof useAppStore.setState>[0])
    const result = selectTodos(useAppStore.getState())
    expect(result).toEqual(todos)
  })

  it('selectThinkingText 셀렉터가 store thinkingText를 반환한다', async () => {
    const { useAppStore, selectThinkingText } = await getStore()
    useAppStore.setState({ thinkingText: '분석 중…' } as Parameters<typeof useAppStore.setState>[0])
    const result = selectThinkingText(useAppStore.getState())
    expect(result).toBe('분석 중…')
  })

  it('selectThinkingText: null인 경우', async () => {
    const { useAppStore, selectThinkingText } = await getStore()
    useAppStore.setState({ thinkingText: null } as Parameters<typeof useAppStore.setState>[0])
    const result = selectThinkingText(useAppStore.getState())
    expect(result).toBeNull()
  })
})
