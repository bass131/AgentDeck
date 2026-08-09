// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import type { SubAgentInfo } from '../../../02_Project/00_Source/renderer/src/lib/agentSampleData'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function renderPanel(subagents: SubAgentInfo[]) {
  const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
  useAppStore.setState({
    isRunning: false,
    changedFiles: new Set<string>(),
    toolCards: [],
    errorMessage: undefined,
  } as Parameters<typeof useAppStore.setState>[0])
  const { AgentPanel } = await import('../../../02_Project/00_Source/renderer/src/features/agent/AgentPanel')
  return act(async () => render(<AgentPanel subagents={subagents} />))
}

describe('AgentPanel — F-D 서브에이전트 2초 제거', () => {
  it('FD1: done 서브에이전트 → 처음 보이고, 2초 후 우측 패널에서 제거', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const subs: SubAgentInfo[] = [
      { id: 'sa-done', name: 'explorer', role: 'x', status: 'done', tools: [] },
    ]
    const { container } = await renderPanel(subs)

    expect(container.querySelector('.subagent')).not.toBeNull()
    expect(screen.getByText('explorer')).not.toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(2100)
    })
    expect(container.querySelector('.subagent')).toBeNull()
  })

  it('FD2: running 서브에이전트 → 2초 경과해도 유지', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const subs: SubAgentInfo[] = [
      { id: 'sa-run', name: 'builder', role: 'y', status: 'running', tools: [] },
    ]
    const { container } = await renderPanel(subs)

    expect(container.querySelector('.subagent')).not.toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(2100)
    })
    expect(container.querySelector('.subagent')).not.toBeNull()
  })

  it('FD3: done→hide 후 running 역전 → 다시 표시(reviewer #2 가드)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    useAppStore.setState({
      isRunning: false, changedFiles: new Set<string>(), toolCards: [], errorMessage: undefined,
    } as Parameters<typeof useAppStore.setState>[0])
    const { AgentPanel } = await import('../../../02_Project/00_Source/renderer/src/features/agent/AgentPanel')

    const { rerender, container } = await act(async () =>
      render(<AgentPanel subagents={[{ id: 'sa-x', name: 'explorer', role: 'x', status: 'done', tools: [] }]} />)
    )
    await act(async () => { vi.advanceTimersByTime(2100) })
    expect(container.querySelector('.subagent')).toBeNull()

    await act(async () => {
      rerender(<AgentPanel subagents={[{ id: 'sa-x', name: 'explorer', role: 'x', status: 'running', tools: [] }]} />)
    })
    expect(container.querySelector('.subagent')).not.toBeNull()
  })
})
