// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import type { SubAgentInfo } from '../../../02_Source/shared/agentEvents'

afterEach(() => cleanup())

async function getStore() {
  const mod = await import('../../../02_Source/renderer/src/store/appStore')
  return mod
}

async function renderPanel(
  storePatch: Record<string, unknown> = {},
  props: Record<string, unknown> = {}
) {
  const { useAppStore } = await getStore()
  useAppStore.setState({
    isRunning: false,
    changedFiles: new Set<string>(),
    toolCards: [],
    errorMessage: undefined,
    todos: [],
    thinkingText: null,
    subagents: [],
    ...storePatch,
  } as Parameters<typeof useAppStore.setState>[0])
  const { AgentPanel } = await import('../../../02_Source/renderer/src/features/agent/AgentPanel')
  return act(async () => render(<AgentPanel {...(props as Parameters<typeof AgentPanel>[0])} />))
}

const SAMPLE_SUBAGENTS: SubAgentInfo[] = [
  {
    id: 'sa-1',
    name: '탐색 에이전트',
    role: 'explorer',
    status: 'done',
    activity: '프로젝트 탐색 완료.',
    tools: [
      { id: 'tool-1', verb: 'read', target: 'src/main.ts', status: 'done' },
    ],
  },
  {
    id: 'sa-2',
    name: '구현 에이전트',
    role: 'builder',
    status: 'running',
    tools: [],
  },
]

describe('Phase 24b — AgentPanel subagents store 연결', () => {
  it('store subagents=[] → 빈상태 "아직 서브에이전트가 없어요"', async () => {
    await renderPanel({ subagents: [] })
    expect(screen.getByText('아직 서브에이전트가 없어요')).toBeTruthy()
  })

  it('store subagents 채워지면 → 서브에이전트 카드 렌더', async () => {
    const { container } = await renderPanel({ subagents: SAMPLE_SUBAGENTS })
    const cards = container.querySelectorAll('.subagent')
    expect(cards.length).toBe(2)
  })

  it('store subagents → 이름 텍스트 표시', async () => {
    await renderPanel({ subagents: SAMPLE_SUBAGENTS })
    expect(screen.getByText('탐색 에이전트')).toBeTruthy()
    expect(screen.getByText('구현 에이전트')).toBeTruthy()
  })

  it('store subagents → status 클래스 반영(done/running)', async () => {
    const { container } = await renderPanel({ subagents: SAMPLE_SUBAGENTS })
    expect(container.querySelector('.subagent.done')).toBeTruthy()
    expect(container.querySelector('.subagent.running')).toBeTruthy()
  })

  it('subagents prop이 있으면 prop 우선(store subagents 무시)', async () => {
    const storeSubs: SubAgentInfo[] = [
      { id: 'store-sa', name: 'store 에이전트', role: 'r', status: 'queued', tools: [] },
    ]
    const propSubs: SubAgentInfo[] = [
      { id: 'prop-sa-1', name: 'prop 에이전트 A', role: 'r', status: 'running', tools: [] },
      { id: 'prop-sa-2', name: 'prop 에이전트 B', role: 'r', status: 'done', tools: [] },
    ]
    const { container } = await renderPanel({ subagents: storeSubs }, { subagents: propSubs })
    const cards = container.querySelectorAll('.subagent')
    expect(cards.length).toBe(2)
    expect(screen.getByText('prop 에이전트 A')).toBeTruthy()
  })

  it('subagents prop=[] 명시 시 빈상태(store 무시)', async () => {
    const storeSubs: SubAgentInfo[] = [
      { id: 'sa-1', name: '탐색 에이전트', role: 'r', status: 'running', tools: [] },
    ]
    await renderPanel({ subagents: storeSubs }, { subagents: [] })
    expect(screen.getByText('아직 서브에이전트가 없어요')).toBeTruthy()
  })

  it('SubAgent 카드 클릭 → SubAgentModal 오픈(에이전트 이름 표시)', async () => {
    const subs: SubAgentInfo[] = [
      { id: 'sa-modal', name: '모달 테스트 에이전트', role: 'r', status: 'running', tools: [] },
    ]
    await renderPanel({ subagents: subs })
    const card = screen.getByText('모달 테스트 에이전트').closest('button')
    expect(card).toBeTruthy()
    await act(async () => {
      fireEvent.click(card!)
    })
    const names = screen.getAllByText('모달 테스트 에이전트')
    expect(names.length).toBeGreaterThanOrEqual(2)
  })

  it('[NG-1] 이름(.sa-name)=subagent_type 고정, role(.sa-sub)과 절대 혼입되지 않음', async () => {
    const subs: SubAgentInfo[] = [
      { id: 'sa-ng1', name: 'general-purpose', role: 'Sonnet 테스트 에이전트 1', status: 'running', tools: [] },
    ]
    const { container } = await renderPanel({ subagents: subs })
    const nameEl = container.querySelector('.sa-name')
    const roleEl = container.querySelector('.sa-sub')
    expect(nameEl?.textContent).toBe('general-purpose')
    expect(roleEl?.textContent).toBe('Sonnet 테스트 에이전트 1')
    expect(nameEl?.textContent).not.toContain('Sonnet')
    expect(nameEl?.textContent).not.toContain('테스트')
  })

  it('agent.model 있음 → SubAgent 행에 모델 배지 렌더(role과 분리, .sa-sub 순수 텍스트 유지)', async () => {
    const subs: SubAgentInfo[] = [
      { id: 'sa-badge-1', name: 'general-purpose', role: 'explorer: 코드 구조 분석', status: 'done', model: 'claude-opus-4-8', tools: [] },
    ]
    const { container } = await renderPanel({ subagents: subs })
    const roleEl = container.querySelector('.sa-sub')
    expect(roleEl?.textContent).toBe('explorer: 코드 구조 분석')
    const badge = container.querySelector('.sa-model-badge')
    expect(badge).toBeTruthy()
    expect(badge?.textContent).toContain('Opus 4.8')
  })

  it('agent.model 없음(undefined) → 배지 미렌더, role만 표시(자리 예약 없음)', async () => {
    const subs: SubAgentInfo[] = [
      { id: 'sa-badge-2', name: 'general-purpose', role: 'builder', status: 'running', tools: [] },
    ]
    const { container } = await renderPanel({ subagents: subs })
    expect(container.querySelector('.sa-sub')?.textContent).toBe('builder')
    expect(container.querySelector('.sa-model-badge')).toBeNull()
  })

  it('실행 중(running) → 배지가 살아있는 느낌(.running, 기존 ag-pulse 재사용)', async () => {
    const subs: SubAgentInfo[] = [
      { id: 'sa-badge-3', name: 'general-purpose', role: 'builder', status: 'running', model: 'claude-sonnet-4-6', tools: [] },
    ]
    const { container } = await renderPanel({ subagents: subs })
    expect(container.querySelector('.sa-model-badge.running')).toBeTruthy()
  })

  it('[회귀] todos store 연결 정상 동작 유지', async () => {
    const todos = [
      { id: 't1', label: '회귀 테스트', status: 'done' as const },
    ]
    const { container } = await renderPanel({ todos, subagents: [] })
    expect(container.querySelector('.progress')).toBeTruthy()
    expect(screen.getByText('회귀 테스트')).toBeTruthy()
  })

  it('[회귀] isRunning=true → 상태 라벨 "작업 중"', async () => {
    await renderPanel({ isRunning: true, subagents: [] })
    expect(screen.getByText('작업 중')).toBeTruthy()
  })

  it('[회귀] subagents 카운터: running > 0이면 "N 실행 중" 표시', async () => {
    const subs: SubAgentInfo[] = [
      { id: 'sa-1', name: 'A', role: 'r', status: 'running', tools: [] },
      { id: 'sa-2', name: 'B', role: 'r', status: 'done', tools: [] },
    ]
    await renderPanel({ subagents: subs })
    expect(screen.getByText('1 실행 중')).toBeTruthy()
  })

  it('[회귀] subagents 카운터: running=0이면 "done/total" 표시', async () => {
    const subs: SubAgentInfo[] = [
      { id: 'sa-1', name: 'A', role: 'r', status: 'done', tools: [] },
      { id: 'sa-2', name: 'B', role: 'r', status: 'done', tools: [] },
    ]
    await renderPanel({ subagents: subs })
    expect(screen.getByText('2/2')).toBeTruthy()
  })
})

describe('F-D 자동숨김 — 데이터 갱신 시 타이머 리셋(coordinator 결정 (b), 2026-07-04)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('모델이 숨김 전에 도착 → 타이머가 리셋되어 "마지막 갱신 후 2초"에 숨겨진다(최초 done 기준 아님)', async () => {
    vi.useFakeTimers()
    const { useAppStore } = await getStore()
    const { container } = await renderPanel({
      subagents: [{ id: 'sa-race-1', name: 'general-purpose', role: 'r', status: 'running', tools: [] }],
    })

    await act(async () => {
      useAppStore.setState({
        subagents: [{ id: 'sa-race-1', name: 'general-purpose', role: 'r', status: 'done', tools: [] }],
      } as Parameters<typeof useAppStore.setState>[0])
    })
    expect(container.querySelector('.subagent')).toBeTruthy()
    expect(container.querySelector('.sa-model-badge')).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })
    await act(async () => {
      useAppStore.setState({
        subagents: [{ id: 'sa-race-1', name: 'general-purpose', role: 'r', status: 'done', model: 'claude-opus-4-8', tools: [] }],
      } as Parameters<typeof useAppStore.setState>[0])
    })
    expect(container.querySelector('.sa-model-badge')?.textContent).toContain('Opus 4.8')

    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(container.querySelector('.subagent')).toBeTruthy()
    expect(container.querySelector('.sa-model-badge')).toBeTruthy()

    await act(async () => {
      vi.advanceTimersByTime(1400)
    })
    expect(container.querySelector('.subagent')).toBeNull()
  })

  it('모델이 숨김 이후에 도착해도 도착 시점부터 2초간 재노출된 뒤 숨겨진다(구 "[위험 실증]" 자리 — fix 확인)', async () => {
    vi.useFakeTimers()
    const { useAppStore } = await getStore()
    const { container } = await renderPanel({
      subagents: [{ id: 'sa-race-2', name: 'general-purpose', role: 'r', status: 'running', tools: [] }],
    })

    await act(async () => {
      useAppStore.setState({
        subagents: [{ id: 'sa-race-2', name: 'general-purpose', role: 'r', status: 'done', tools: [] }],
      } as Parameters<typeof useAppStore.setState>[0])
    })

    await act(async () => {
      vi.advanceTimersByTime(2100)
    })
    expect(container.querySelector('.subagent')).toBeNull()

    await act(async () => {
      useAppStore.setState({
        subagents: [{ id: 'sa-race-2', name: 'general-purpose', role: 'r', status: 'done', model: 'claude-opus-4-8', tools: [] }],
      } as Parameters<typeof useAppStore.setState>[0])
    })
    expect(container.querySelector('.subagent')).toBeTruthy()
    expect(container.querySelector('.sa-model-badge')?.textContent).toContain('Opus 4.8')

    await act(async () => {
      vi.advanceTimersByTime(1900)
    })
    expect(container.querySelector('.subagent')).toBeTruthy()

    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(container.querySelector('.subagent')).toBeNull()
  })

  it('갱신 없이 done만 유지되면 기존처럼 2초 뒤 숨김(회귀 0 — 베이스라인 유지)', async () => {
    vi.useFakeTimers()
    const { useAppStore } = await getStore()
    const { container } = await renderPanel({
      subagents: [{ id: 'sa-baseline', name: 'general-purpose', role: 'r', status: 'running', tools: [] }],
    })

    await act(async () => {
      useAppStore.setState({
        subagents: [{ id: 'sa-baseline', name: 'general-purpose', role: 'r', status: 'done', tools: [] }],
      } as Parameters<typeof useAppStore.setState>[0])
    })
    expect(container.querySelector('.subagent')).toBeTruthy()

    await act(async () => {
      vi.advanceTimersByTime(1900)
    })
    expect(container.querySelector('.subagent')).toBeTruthy()

    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(container.querySelector('.subagent')).toBeNull()
  })

  it('언마운트 시 예정된 숨김 타이머를 clear한다(cleanup, 누수 0)', async () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { container, unmount } = await renderPanel({
      subagents: [{ id: 'sa-cleanup', name: 'general-purpose', role: 'r', status: 'done', tools: [] }],
    })
    expect(container.querySelector('.subagent')).toBeTruthy()

    clearSpy.mockClear()
    unmount()
    expect(clearSpy).toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    clearSpy.mockRestore()
  })
})
