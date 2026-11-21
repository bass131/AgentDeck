// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import type { ThreadItem, ToolCard } from '@renderer/05_Conversation/state/threadTypes'

afterEach(() => cleanup())

function tool(id: string): ToolCard {
  return { id, name: 'bash', input: {}, status: 'done' }
}
function toolgroup(id: string, n: number): ThreadItem {
  return { kind: 'toolgroup', id, tools: Array.from({ length: n }, (_, i) => tool(`${id}-${i}`)) }
}

async function renderPanel(storePatch: Record<string, unknown> = {}) {
  const { useAppStore } = await import('@renderer/00_App/appStore')
  useAppStore.setState({
    isRunning: false,
    changedFiles: new Set<string>(),
    toolCards: [],
    errorMessage: undefined,
    todos: [],
    thinkingText: null,
    subagents: [],
    thread: [],
    ...storePatch,
  } as Parameters<typeof useAppStore.setState>[0])
  const { AgentPanel } = await import('@renderer/03_Agent/AgentPanel')
  return act(async () => render(<AgentPanel />))
}

describe('B2 — AgentPanel 작업 범위 칩', () => {
  it('실데이터(파일 2 · 도구 3) → .ag-scope 칩 렌더', async () => {
    const { container } = await renderPanel({
      changedFiles: new Set(['src/a.ts', 'src/b.ts']),
      thread: [toolgroup('g1', 2), toolgroup('g2', 1)],
    })
    const scope = container.querySelector('.ag-scope')
    expect(scope).toBeTruthy()
    expect(scope?.textContent).toContain('파일 2')
    expect(scope?.textContent).toContain('도구 3')
  })

  it('빈상태(파일0·도구0) → 칩 숨김', async () => {
    const { container } = await renderPanel({ changedFiles: new Set<string>(), thread: [] })
    expect(container.querySelector('.ag-scope')).toBeNull()
  })

  it('파일만 있고 도구 없으면 → 칩 표시(파일 1 · 도구 0)', async () => {
    const { container } = await renderPanel({
      changedFiles: new Set(['only.ts']),
      thread: [],
    })
    const scope = container.querySelector('.ag-scope')
    expect(scope).toBeTruthy()
    expect(scope?.textContent).toContain('파일 1')
    expect(scope?.textContent).toContain('도구 0')
  })

  // 구독 selector가 호출마다 새 객체를 주면 store가 바뀔 때마다 패널이 다시 그려진다.
  it('selectTaskScope는 입력(changedFiles·thread)이 같으면 같은 객체를, 바뀌면 새 값을 준다', async () => {
    const { useAppStore, selectTaskScope } = await import('@renderer/00_App/appStore')
    const changedFiles = new Set(['a.ts'])
    const thread = [toolgroup('g', 2)]
    useAppStore.setState({ changedFiles, thread } as Parameters<typeof useAppStore.setState>[0])
    const first = selectTaskScope(useAppStore.getState())
    useAppStore.setState({ isRunning: true } as Parameters<typeof useAppStore.setState>[0])
    expect(selectTaskScope(useAppStore.getState())).toBe(first)
    useAppStore.setState({ changedFiles: new Set(['a.ts', 'b.ts']) } as Parameters<typeof useAppStore.setState>[0])
    const next = selectTaskScope(useAppStore.getState())
    expect(next).not.toBe(first)
    expect(next).toEqual({ fileCount: 2, toolCount: 2, changedFiles: ['a.ts', 'b.ts'] })
    useAppStore.setState({ thread: [toolgroup('g', 3)] } as Parameters<typeof useAppStore.setState>[0])
    expect(selectTaskScope(useAppStore.getState()).toolCount).toBe(3)
  })
})
