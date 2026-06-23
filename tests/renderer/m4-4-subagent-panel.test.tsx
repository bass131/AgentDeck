// @vitest-environment jsdom
/**
 * m4-4-subagent-panel.test.tsx — Phase 24b AgentPanel subagents store 연결 테스트 (TDD 선행).
 *
 * 검증 대상:
 *   - store subagents=[] → 빈상태 "아직 서브에이전트가 없어요"
 *   - store subagents 채워지면 → SubAgent 카드 행 렌더
 *   - subagents prop이 있으면 prop 우선(store 무시)
 *   - subagents prop=[] 명시 → 빈상태
 *   - SubAgent 클릭 → SubAgentModal 오픈
 *   - 기존 회귀: todos(24a) 정상 렌더
 *   - 기존 회귀: toolCards → Conversation 독립(AgentPanel 무영향)
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import type { SubAgentInfo } from '../../src/shared/agent-events'

afterEach(() => cleanup())

async function getStore() {
  const mod = await import('../../src/renderer/src/store/appStore')
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
  const { AgentPanel } = await import('../../src/renderer/src/components/AgentPanel')
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
    // .subagent 버튼이 2개 렌더
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
    // store에 1개, prop에 2개 → prop 우선 → 2개 렌더
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
    // SubAgentModal이 오픈되어 이름이 한 번 더 렌더(카드+모달)
    const names = screen.getAllByText('모달 테스트 에이전트')
    expect(names.length).toBeGreaterThanOrEqual(2)
  })

  // ── 기존 회귀: todos(24a) ─────────────────────────────────────────────────
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
