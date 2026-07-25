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
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import type { SubAgentInfo } from '../../../02.Source/shared/agent-events'

afterEach(() => cleanup())

async function getStore() {
  const mod = await import('../../../02.Source/renderer/src/store/appStore')
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
  const { AgentPanel } = await import('../../../02.Source/renderer/src/components/05_agent/AgentPanel')
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

  // ── NG-1 회귀 잠금(2026-07-04 영호 재육안): 이름=subagent_type 고정, description/role
  // 혼입 금지 — 영호가 실제로 목격한 문자열("Sonnet 테스트 에이전트 1")을 role/description에
  // 넣고, name은 실제 subagent_type("general-purpose")로 고정해 두 필드가 절대 섞이지
  // 않음을 잠근다. 코드 실증(claude-stream.ts:315-322, AgentPanel.tsx SubAgent 함수 .sa-name/
  // .sa-sub 분리 렌더)상 합성 지점이 없음을 확인했고, 이 테스트가 그 계약을 고정한다.
  it('[NG-1] 이름(.sa-name)=subagent_type 고정, role(.sa-sub)과 절대 혼입되지 않음', async () => {
    const subs: SubAgentInfo[] = [
      { id: 'sa-ng1', name: 'general-purpose', role: 'Sonnet 테스트 에이전트 1', status: 'running', tools: [] },
    ]
    const { container } = await renderPanel({ subagents: subs })
    const nameEl = container.querySelector('.sa-name')
    const roleEl = container.querySelector('.sa-sub')
    expect(nameEl?.textContent).toBe('general-purpose')
    expect(roleEl?.textContent).toBe('Sonnet 테스트 에이전트 1')
    // name에 role/모델 계열 텍스트가 섞여 들어가지 않는다(합성 금지).
    expect(nameEl?.textContent).not.toContain('Sonnet')
    expect(nameEl?.textContent).not.toContain('테스트')
  })

  // ── 모델 배지 노출 지점(영호 재육안 2026-07-04 진단) ──────────────────────────
  // SubAgentInline/SubAgentFullscreen(영호 육안 피드백 2026-07-04)에 이미 있던
  // SubAgentModelBadge가 AgentPanel의 SubAgent 행에는 누락돼 있었다 — 단일챗 전용
  // 우측 패널(멀티패널엔 이 패널 자체가 없음)이라 "멀티는 되는데 단일은 안 된다"는
  // 재육안 신고와 정확히 겹치는 세 번째 지점. 이 블록이 그 배선을 잠근다.
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

// ── F-D 자동숨김 — 데이터 갱신 시 타이머 리셋(coordinator 결정 (b), 2026-07-04) ──────
// 배경: AgentPanel은 완료된 서브에이전트를 우측 패널에서 자동 숨김(F-D, 이 파일 상단
// 참조 — 과거 명시적 사용자 요구로 도입된 기존 기능, 오늘 회귀 아님). 그런데 모델
// 필드는 FB2 P07대로 tool_result(ack, 즉시 done 전이) *이후*에 별도 이벤트로 늦게
// 도착한다(subagent-model-order-replay.test.ts 실측 순서 재사용). 최초 진단(같은 날짜)
// 에서 "최초 done 관측 시점" 기준 고정 스케줄이 이 지연과 경합해 배지를 영영 못 보는
// 경로를 실증했고([위험 실증], 아래 두 번째 테스트가 그 자리를 대체), coordinator가
// (b) 데이터 갱신 시 타이머 리셋을 채택했다 — 근거: (a) 임의 연장은 지연폭 실측 근거
// 0, (c) 모델 미도착 에이전트는 카드가 영구 잔존(정리 기능 자체가 무력화). (b)는
// "done 후 2초"가 "마지막 갱신 후 2초"로 자연스럽게 바뀌고 신규 상수 0.
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

    // t=0: tool_result 도착 — done 전이(모델 필드 아직 없음, 라이브 실측 순서 1단계).
    // 이 시점 타이머는 "리셋 안 되면" t=2000에 발화할 예정.
    await act(async () => {
      useAppStore.setState({
        subagents: [{ id: 'sa-race-1', name: 'general-purpose', role: 'r', status: 'done', tools: [] }],
      } as Parameters<typeof useAppStore.setState>[0])
    })
    expect(container.querySelector('.subagent')).toBeTruthy()
    expect(container.querySelector('.sa-model-badge')).toBeNull()

    // t=1500ms: 숨김 전에 모델 필드 도착(라이브 실측 순서 2단계) → 리셋: 새 타이머가
    // 지금(t=1500)부터 2초 뒤인 t=3500에 발화하도록 재스케줄된다.
    await act(async () => {
      vi.advanceTimersByTime(1500)
    })
    await act(async () => {
      useAppStore.setState({
        subagents: [{ id: 'sa-race-1', name: 'general-purpose', role: 'r', status: 'done', model: 'claude-opus-4-8', tools: [] }],
      } as Parameters<typeof useAppStore.setState>[0])
    })
    expect(container.querySelector('.sa-model-badge')?.textContent).toContain('Opus 4.8')

    // t=2100ms — 리셋 전이었다면 이미 숨겨졌을 시점(2000ms). 리셋됐으므로 아직 보인다
    // (이 assert가 "리셋이 실제로 일어났다"를 증명하는 핵심 지점).
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(container.querySelector('.subagent')).toBeTruthy()
    expect(container.querySelector('.sa-model-badge')).toBeTruthy()

    // t=3500ms(모델 도착 시점 기준 +2000ms) — 이제 숨겨진다.
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

    // t=0: tool_result 도착 — done 전이.
    await act(async () => {
      useAppStore.setState({
        subagents: [{ id: 'sa-race-2', name: 'general-purpose', role: 'r', status: 'done', tools: [] }],
      } as Parameters<typeof useAppStore.setState>[0])
    })

    // t=2100ms: 갱신이 없었으므로 예정대로 숨김(베이스라인 — 기존 F-D 거동 유지).
    await act(async () => {
      vi.advanceTimersByTime(2100)
    })
    expect(container.querySelector('.subagent')).toBeNull()

    // t=2100ms+: 그제서야 모델 필드가 도착(네트워크/스트림 지연 시나리오) → 갱신 감지 →
    // 즉시 재노출 + 이 시점부터 새 2초 카운트다운 시작(fix 이전엔 hiddenIds에 한 번
    // 들어가면 다시 나타나지 않아 배지를 영영 볼 수 없었다).
    await act(async () => {
      useAppStore.setState({
        subagents: [{ id: 'sa-race-2', name: 'general-purpose', role: 'r', status: 'done', model: 'claude-opus-4-8', tools: [] }],
      } as Parameters<typeof useAppStore.setState>[0])
    })
    // 즉시 재노출 + 배지 표시(fix 확인 — 이전엔 여기서 둘 다 null이었다).
    expect(container.querySelector('.subagent')).toBeTruthy()
    expect(container.querySelector('.sa-model-badge')?.textContent).toContain('Opus 4.8')

    // 재노출 후 1900ms(아직 2초 미만) — 계속 보인다.
    await act(async () => {
      vi.advanceTimersByTime(1900)
    })
    expect(container.querySelector('.subagent')).toBeTruthy()

    // 재노출 후 2000ms 초과 — 새 카운트다운이 발화해 다시 숨겨진다.
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

    // 1900ms — 아직 안 숨겨짐.
    await act(async () => {
      vi.advanceTimersByTime(1900)
    })
    expect(container.querySelector('.subagent')).toBeTruthy()

    // 2000ms 초과 — 추가 갱신이 전혀 없었으므로 원래 스케줄대로 숨겨진다.
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

    clearSpy.mockClear() // 마운트까지의 무관 호출 배제 — 언마운트 시 호출만 본다.
    unmount()
    expect(clearSpy).toHaveBeenCalled()

    // 정리가 안 됐다면 이 시점에 언마운트된 컴포넌트에 setState를 시도했을 타이밍 —
    // 에러/경고 없이 통과하면 cleanup이 실제로 타이머를 끊었다는 방증.
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    clearSpy.mockRestore()
  })
})
