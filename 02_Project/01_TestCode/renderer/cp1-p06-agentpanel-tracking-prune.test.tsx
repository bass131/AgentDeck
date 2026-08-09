// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import type { SubAgentInfo } from '../../../02_Project/00_Source/renderer/src/lib/agentSampleData'
import { AgentPanel } from '../../../02_Project/00_Source/renderer/src/features/agent/AgentPanel'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('CP1 P06 ② — AgentPanel lastSeenRef·timersRef 프루닝', () => {
  it('배열에서 id가 사라지면 예약된 숨김 타이머를 즉시 취소(프루닝) — conversationKey 불변', async () => {
    vi.useFakeTimers()
    const subs: SubAgentInfo[] = [
      { id: 'sa-x', name: 'explorer', role: 'x', status: 'done', tools: [] },
    ]
    const { rerender } = await act(async () => render(<AgentPanel subagents={subs} />))

    expect(vi.getTimerCount()).toBe(1)

    await act(async () => {
      rerender(<AgentPanel subagents={[]} />)
    })

    expect(vi.getTimerCount()).toBe(0)
  })

  it('일부 id만 사라지면 남은 id의 타이머는 유지, 사라진 id만 취소', async () => {
    vi.useFakeTimers()
    const subs: SubAgentInfo[] = [
      { id: 'sa-keep', name: 'keeper', role: 'x', status: 'done', tools: [] },
      { id: 'sa-drop', name: 'dropper', role: 'y', status: 'done', tools: [] },
    ]
    const { rerender } = await act(async () => render(<AgentPanel subagents={subs} />))
    expect(vi.getTimerCount()).toBe(2)

    await act(async () => {
      rerender(<AgentPanel subagents={[subs[0]]} />)
    })
    expect(vi.getTimerCount()).toBe(1)
  })
})

describe('CP1 P06 ③ — 대화 전환 감지 시 lastSeenRef·timersRef 초기화', () => {
  it('conversationKey 변경 시 이전 대화의 예약 타이머가 즉시 취소된다(배열 레퍼런스 불변이어도)', async () => {
    vi.useFakeTimers()
    const subs: SubAgentInfo[] = [
      { id: 'sa-dup', name: 'a1', role: 'x', status: 'done', tools: [] },
    ]
    const { rerender } = await act(async () =>
      render(<AgentPanel subagents={subs} conversationKey="conv-A" />)
    )
    expect(vi.getTimerCount()).toBe(1)

    await act(async () => {
      rerender(<AgentPanel subagents={subs} conversationKey="conv-B" />)
    })

    expect(vi.getTimerCount()).toBe(0)
  })

  it('conversationKey가 같으면(같은 대화 내 갱신) 예약 타이머를 건드리지 않는다', async () => {
    vi.useFakeTimers()
    const subs: SubAgentInfo[] = [
      { id: 'sa-y', name: 'b1', role: 'x', status: 'done', tools: [] },
    ]
    const { rerender } = await act(async () =>
      render(<AgentPanel subagents={subs} conversationKey="conv-A" />)
    )
    expect(vi.getTimerCount()).toBe(1)

    await act(async () => {
      rerender(<AgentPanel subagents={subs} conversationKey="conv-A" />)
    })
    expect(vi.getTimerCount()).toBe(1)
  })

  it('최초 마운트 시(conversationKey 최초 값)는 전환으로 취급하지 않는다(불필요 초기화 방지)', async () => {
    vi.useFakeTimers()
    const subs: SubAgentInfo[] = [
      { id: 'sa-mount', name: 'm1', role: 'x', status: 'done', tools: [] },
    ]
    await act(async () => render(<AgentPanel subagents={subs} conversationKey="conv-A" />))
    expect(vi.getTimerCount()).toBe(1)
  })
})
