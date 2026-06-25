// @vitest-environment jsdom
/**
 * b2-task-scope-panel.test.tsx — B2 작업 범위 칩 렌더 (TDD 선행).
 *
 * AgentPanel 의 todos 위에 작업 범위 칩(.ag-scope: "파일 N" · "도구 N")이
 * 실데이터(changedFiles + thread toolgroup)로 렌더된다. 빈상태 → 칩 숨김.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import type { ThreadItem, ToolCard } from '../../src/renderer/src/store/threadTypes'

afterEach(() => cleanup())

function tool(id: string): ToolCard {
  return { id, name: 'bash', input: {}, status: 'done' }
}
function toolgroup(id: string, n: number): ThreadItem {
  return { kind: 'toolgroup', id, tools: Array.from({ length: n }, (_, i) => tool(`${id}-${i}`)) }
}

async function renderPanel(storePatch: Record<string, unknown> = {}) {
  const { useAppStore } = await import('../../src/renderer/src/store/appStore')
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
  const { AgentPanel } = await import('../../src/renderer/src/components/AgentPanel')
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
})
