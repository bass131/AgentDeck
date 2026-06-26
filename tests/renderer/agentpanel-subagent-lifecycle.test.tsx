// @vitest-environment jsdom
/**
 * agentpanel-subagent-lifecycle.test.tsx — F-D: 완료 서브에이전트 2초 뒤 우측 패널 제거.
 *
 * 사용자 요구: 작업 끝난 SubAgent가 우측 패널에 계속 남는 문제 → 완료 즉시가 아니라
 * 2초 뒤 표기 제거. 타이머는 컴포넌트 effect(reducer 밖, 순수성 보존). 채팅 인라인(F-G)은 영속.
 *
 * FD1: done 서브에이전트 → 처음엔 보이고, 2초 경과 후 우측 패널에서 사라짐
 * FD2: running 서브에이전트 → 2초 경과해도 유지(완료 아님)
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import type { SubAgentInfo } from '../../src/renderer/src/lib/agentSampleData'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function renderPanel(subagents: SubAgentInfo[]) {
  const { useAppStore } = await import('../../src/renderer/src/store/appStore')
  useAppStore.setState({
    isRunning: false,
    changedFiles: new Set<string>(),
    toolCards: [],
    errorMessage: undefined,
  } as Parameters<typeof useAppStore.setState>[0])
  const { AgentPanel } = await import('../../src/renderer/src/components/05_agent/AgentPanel')
  return act(async () => render(<AgentPanel subagents={subagents} />))
}

describe('AgentPanel — F-D 서브에이전트 2초 제거', () => {
  it('FD1: done 서브에이전트 → 처음 보이고, 2초 후 우측 패널에서 제거', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const subs: SubAgentInfo[] = [
      { id: 'sa-done', name: 'explorer', role: 'x', status: 'done', tools: [] },
    ]
    const { container } = await renderPanel(subs)

    // 처음엔 보임
    expect(container.querySelector('.subagent')).not.toBeNull()
    expect(screen.getByText('explorer')).not.toBeNull()

    // 2초 경과 → 제거
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
    // running은 제거되지 않음
    expect(container.querySelector('.subagent')).not.toBeNull()
  })

  it('FD3: done→hide 후 running 역전 → 다시 표시(reviewer #2 가드)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      isRunning: false, changedFiles: new Set<string>(), toolCards: [], errorMessage: undefined,
    } as Parameters<typeof useAppStore.setState>[0])
    const { AgentPanel } = await import('../../src/renderer/src/components/05_agent/AgentPanel')

    // done으로 렌더 → 2초 hide
    const { rerender, container } = await act(async () =>
      render(<AgentPanel subagents={[{ id: 'sa-x', name: 'explorer', role: 'x', status: 'done', tools: [] }]} />)
    )
    await act(async () => { vi.advanceTimersByTime(2100) })
    expect(container.querySelector('.subagent')).toBeNull()

    // 같은 id가 running으로 역전 → hiddenIds에 있어도 현재 done 아니므로 다시 표시
    await act(async () => {
      rerender(<AgentPanel subagents={[{ id: 'sa-x', name: 'explorer', role: 'x', status: 'running', tools: [] }]} />)
    })
    expect(container.querySelector('.subagent')).not.toBeNull()
  })
})
