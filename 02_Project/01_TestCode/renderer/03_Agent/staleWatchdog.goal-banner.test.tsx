// 작업 ID: bl1-p03 · 옛 이름 bl1-p03-goal-banner-stale-watchdog.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import {
  GOAL_BANNER_STALE_THRESHOLD_MS,
  isStaleNow,
  remainingStaleMs,
  isActivityEvent,
  createStaleTimer,
} from '@renderer/03_Agent/state/staleWatchdog'
import {
  applyAgentEvent,
  applyBeginCommand,
  makeInitialState,
} from '@renderer/05_Conversation/state/reducer'
import type { AppState } from '@renderer/05_Conversation/state/reducer'
import { resolveLoopStatus } from '@renderer/03_Agent/loopStatus'
import { LoopStatusBanner } from '@renderer/03_Agent'
import type { AgentEvent } from '@shared/agentEvents'
import type { AgentEventPayload } from '@shared/ipcContract'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

afterEach(() => cleanup())

function payload(event: AgentEvent, runId = 'run-p03'): AgentEventPayload {
  return { runId, event }
}

function autonomyActiveEvt(): AgentEvent {
  return { type: 'autonomy_status', status: 'active' }
}

describe('staleWatchdog.ts — isStaleNow/remainingStaleMs (순수 함수)', () => {
  it('lastActivityAt=null → 항상 false(판정 불가 — 활동 신호 아직 없음)', () => {
    expect(isStaleNow(null, Date.now())).toBe(false)
  })

  it('임계 미만 → false, 임계 도달/초과 → true', () => {
    const t0 = 1_000_000
    expect(isStaleNow(t0, t0 + GOAL_BANNER_STALE_THRESHOLD_MS - 1)).toBe(false)
    expect(isStaleNow(t0, t0 + GOAL_BANNER_STALE_THRESHOLD_MS)).toBe(true)
    expect(isStaleNow(t0, t0 + GOAL_BANNER_STALE_THRESHOLD_MS + 1000)).toBe(true)
  })

  it('remainingStaleMs — 남은 시간(음수=이미 초과)', () => {
    const t0 = 1_000_000
    expect(remainingStaleMs(t0, t0 + 1000)).toBe(GOAL_BANNER_STALE_THRESHOLD_MS - 1000)
    expect(remainingStaleMs(t0, t0 + GOAL_BANNER_STALE_THRESHOLD_MS + 500)).toBe(-500)
  })
})

describe('staleWatchdog.ts — isActivityEvent (활동 신호 목록 실측 — reducer.ts 스위치 전체와 대응)', () => {
  it('reducer.ts applyAgentEvent가 처리하는 19종 AgentEvent 타입 전부 활동으로 집계된다', () => {
    const ALL: AgentEvent['type'][] = [
      'text', 'tool_call', 'tool_result', 'file_changed', 'thinking', 'thinking_clear',
      'orchestration', 'orchestration_progress', 'orchestration_denied', 'subagent', 'todos',
      'permission_request', 'question_request', 'model-fallback', 'done', 'error', 'session',
      'loops', 'autonomy_status',
    ]
    for (const t of ALL) expect(isActivityEvent(t)).toBe(true)
  })
})

describe('staleWatchdog.ts — createStaleTimer (setTimeout 재설정 방식, setInterval 금지)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('arm(ms) 후 정확히 ms 경과 시 onStale 1회 발화', () => {
    const onStale = vi.fn()
    const timer = createStaleTimer(onStale)
    timer.arm(1000)
    vi.advanceTimersByTime(999)
    expect(onStale).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onStale).toHaveBeenCalledTimes(1)
  })

  it('재무장(신호 수신 시점 기준 재설정) — 이전 타이머 취소 + 새 임계로 리셋', () => {
    const onStale = vi.fn()
    const timer = createStaleTimer(onStale)
    timer.arm(1000)
    vi.advanceTimersByTime(700)
    timer.arm(1000)
    vi.advanceTimersByTime(700)
    expect(onStale).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(onStale).toHaveBeenCalledTimes(1)
  })

  it('dispose — 대기 중 타이머 취소, onStale 미호출', () => {
    const onStale = vi.fn()
    const timer = createStaleTimer(onStale)
    timer.arm(1000)
    timer.dispose()
    vi.advanceTimersByTime(5000)
    expect(onStale).not.toHaveBeenCalled()
  })

  it('arm(0 이하) — 이미 임계 초과, 타이머 걸지 않고 즉시 동기 호출(setTimeout 등록 0)', () => {
    const onStale = vi.fn()
    const timer = createStaleTimer(onStale)
    expect(vi.getTimerCount()).toBe(0)
    timer.arm(-500)
    expect(onStale).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('setInterval을 사용하지 않는다 — 발화 후 재등록 없음(vi.getTimerCount 0으로 복귀)', () => {
    const onStale = vi.fn()
    const timer = createStaleTimer(onStale)
    timer.arm(1000)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('reducer.ts — makeInitialState (BL1 P03 신규 필드 시드)', () => {
  it('lastActivityAt=null · bannerStale=false · staleDismissed=false', () => {
    const s = makeInitialState()
    expect(s.lastActivityAt).toBeNull()
    expect(s.bannerStale).toBe(false)
    expect(s.staleDismissed).toBe(false)
  })
})

describe('reducer.ts — applyAgentEvent nowMs 활동 스탬프', () => {
  it('nowMs 전달 + 활동 이벤트(text) → lastActivityAt이 그 값으로 갱신된다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: 'hi' }), '오후 1:00', 12345)
    expect(s1.lastActivityAt).toBe(12345)
  })

  it('nowMs 미전달(하위호환 — 구 호출부) → lastActivityAt 불변(no-op)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(autonomyActiveEvt()), '오후 1:00')
    expect(s1.lastActivityAt).toBeNull()
  })

  it('활동 신호 도착 시 bannerStale/staleDismissed가 자동으로 해제된다(새 신호 → 복귀)', () => {
    const s0: AppState = { ...makeInitialState(), bannerStale: true, staleDismissed: true }
    const s1 = applyAgentEvent(s0, payload(autonomyActiveEvt()), '오후 1:00', 999)
    expect(s1.bannerStale).toBe(false)
    expect(s1.staleDismissed).toBe(false)
  })

  it('begin-command(로컬 액션)는 AgentEvent가 아니므로 lastActivityAt 스탬프 대상이 아니다', () => {
    const s0 = makeInitialState()
    const s1 = applyBeginCommand(s0, { type: 'begin-command', name: 'goal', cardId: 'c1', time: '오후 1:00' })
    expect(s1.lastActivityAt).toBeNull()
  })

  it('연속 활동 — 이후 이벤트가 더 최신 nowMs로 계속 갱신된다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: 'a' }), '오후 1:00', 100)
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_call', id: 't1', name: 'bash', input: {} }), '오후 1:01', 200)
    expect(s2.lastActivityAt).toBe(200)
  })
})

describe('resolveLoopStatus — goal-stale 변형 (BL1 P03, BL1 후속: 시그니처 개정 — goalRun 단일 소스)', () => {
  it('goalRun 존재 + bannerStale=true → goal-stale', () => {
    const st = resolveLoopStatus([], { turns: 3, detail: '문서 정리' }, false, true)
    expect(st.kind).toBe('goal-stale')
  })

  it('goalRun 존재 + bannerStale=false → 기존과 동일하게 goal(회귀 0)', () => {
    const st = resolveLoopStatus([], { turns: 3, detail: null }, false, false)
    expect(st.kind).toBe('goal')
  })

  it('bannerStale=true여도 staleDismissed=true면 표시가 숨겨진다(none) — 수동 해제', () => {
    const st = resolveLoopStatus([], { turns: 3, detail: null }, false, true, true)
    expect(st.kind).toBe('none')
  })

  it('staleDismissed=true + stoppedNotice=true → stopped(정지확인이 있으면 그쪽을 보여준다)', () => {
    const st = resolveLoopStatus([], null, true, true, true)
    expect(st.kind).toBe('stopped')
  })

  it('단일 표시 불변식: sdk가 goal-stale보다 우선', () => {
    const st = resolveLoopStatus(
      [{ id: 'cc1', summary: '매분 점검', interval: 'Every minute' }],
      { turns: 1, detail: null }, false, true,
    )
    expect(st.kind).toBe('sdk')
  })

  it('goalRun=null이면 bannerStale=true여도 goal-stale이 아니다(게이트 우선)', () => {
    const st = resolveLoopStatus([], null, false, true)
    expect(st.kind).toBe('none')
  })

  it('3번째~5번째 인자 전부 미전달(기존 2인자 호출부) → 회귀 0', () => {
    expect(resolveLoopStatus([], { turns: 2, detail: null }).kind).toBe('goal')
  })
})

describe('LoopStatusBanner — goal-stale 변형 (BL1 P03)', () => {
  it('.loop-indicator.loop-goal-stale 렌더 + "신호 없음" 라벨 + 접근성 라벨', () => {
    const { container } = render(<LoopStatusBanner status={{ kind: 'goal-stale', turns: 2, detail: null }} />)
    const root = container.querySelector('.loop-indicator.loop-goal-stale')
    expect(root).not.toBeNull()
    expect(container.textContent ?? '').toContain('신호 없음')
  })

  it('회전 스피너 없음(진행 확신 없음 — stopped 변형과 동일 원칙)', () => {
    const { container } = render(<LoopStatusBanner status={{ kind: 'goal-stale', turns: 1, detail: null }} />)
    expect(container.querySelector('.loop-goal-stale .loop-spinner')).toBeNull()
  })

  it('detail(작업 주제) 있으면 표시 — stale 이전에 뭘 하고 있었는지 맥락 유지', () => {
    const { container } = render(<LoopStatusBanner status={{ kind: 'goal-stale', turns: 3, detail: '리팩토링 마무리' }} />)
    expect(container.textContent ?? '').toContain('리팩토링 마무리')
  })

  it('onDismissStale 전달 → .loop-dismiss 버튼 렌더 + 클릭 시 호출(수동 해제)', () => {
    const onDismissStale = vi.fn()
    const { container } = render(
      <LoopStatusBanner status={{ kind: 'goal-stale', turns: 1, detail: null }} onDismissStale={onDismissStale} />,
    )
    const btn = container.querySelector('.loop-dismiss') as HTMLButtonElement
    expect(btn).not.toBeNull()
    fireEvent.click(btn)
    expect(onDismissStale).toHaveBeenCalledTimes(1)
  })

  it('onDismissStale 미전달 → 닫기 버튼 미표시(기존 onDismissStopped 옵셔널 계약과 동형)', () => {
    const { container } = render(<LoopStatusBanner status={{ kind: 'goal-stale', turns: 1, detail: null }} />)
    expect(container.querySelector('.loop-dismiss')).toBeNull()
  })

  it('상태 전환: goal(진행) → goal-stale로 rerender 시 표시가 완전히 교체된다', () => {
    const running: import('@renderer/03_Agent/loopStatus').LoopStatus =
      { kind: 'goal', turns: 3, detail: '문서 정리' }
    const { container, rerender } = render(<LoopStatusBanner status={running} />)
    expect(container.querySelector('.loop-goal')).not.toBeNull()
    expect(container.querySelector('.loop-spinner')).not.toBeNull()

    rerender(<LoopStatusBanner status={{ kind: 'goal-stale', turns: 3, detail: '문서 정리' }} />)
    expect(container.querySelector('.loop-goal-stale')).not.toBeNull()
    expect(container.querySelector('.loop-spinner')).toBeNull()
  })
})

let runIdCounter = 0
let capturedHandler: ((payload: AgentEventPayload) => void) | null = null

const mockApi = {
  conversationLoad: async (req: { id?: string; limit?: number }) => {
    if (req.id) {
      return {
        conversations: [{
          id: req.id, title: req.id, messages: [], backendId: 'claude-code',
          createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
        }],
      }
    }
    return { conversations: [] }
  },
  conversationSave: async () => ({ id: 'cv-x' }),
  conversationRename: async () => ({ ok: true }),
  conversationDelete: async () => ({ ok: true }),
  setUiPref: async () => ({ ok: true }),
  agentRun: vi.fn().mockImplementation(() => {
    const runId = `run-${runIdCounter}`
    runIdCounter++
    return Promise.resolve({ runId })
  }),
  agentAbort: vi.fn().mockResolvedValue({ ok: true }),
  agentInterrupt: vi.fn().mockResolvedValue({ ok: false }),
  onAgentEvent: (cb: (payload: AgentEventPayload) => void) => {
    capturedHandler = cb
    return () => { capturedHandler = null }
  },
  workspaceOpen: async (req: { folderPath?: string }) => ({ rootPath: req.folderPath ?? null, tree: null }),
  listFiles: async () => ({ files: [] }),
  pathForFile: () => '',
  saveImageData: async () => ({ path: '' }),
  referenceList: async () => ({ references: [] }),
  referenceTree: async () => ({ tree: null }),
  referenceAdd: async () => ({ reference: null }),
  fsRead: async () => ({ kind: 'not-found' }),
}

Object.defineProperty(globalThis, 'window', {
  value: { api: adaptFlatApi(mockApi) },
  writable: true,
  configurable: true,
})

import { useAppStore } from '@renderer/00_App/appStore'
import { __backgroundRunOf, __resetBackgroundRunsForTests } from '@renderer/03_Agent/state/backgroundRuns'

describe('appStore(단일챗) — foreground stale-watchdog 라이브 배선 (fake timer)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    capturedHandler = null
    __resetBackgroundRunsForTests()
    useAppStore.setState({
      conversationId: null,
      currentRunId: null,
      runGeneration: null,
      isRunning: false,
      thread: [],
      autonomyActive: false,
      lastActivityAt: null,
      bannerStale: false,
      staleDismissed: false,
      loopsStoppedNotice: false,
      pendingCommand: null,
      activeLoops: [],
      goalRun: null,
    } as Parameters<typeof useAppStore.setState>[0])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('refreshStaleWatchdog: 신선한 lastActivityAt → 남은 시간 경과 후 자동으로 bannerStale=true(setTimeout 1회, 폴링 없음)', () => {
    const t0 = Date.now()
    useAppStore.setState({
      autonomyActive: true, goalRun: { detail: null, turns: 1, startedAt: t0 }, lastActivityAt: t0, bannerStale: false,
    } as Parameters<typeof useAppStore.setState>[0])
    useAppStore.getState().refreshStaleWatchdog()
    expect(useAppStore.getState().bannerStale).toBe(false)
    vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS - 1)
    expect(useAppStore.getState().bannerStale).toBe(false)
    vi.advanceTimersByTime(1)
    expect(useAppStore.getState().bannerStale).toBe(true)
  })

  it('refreshStaleWatchdog: 이미 임계 초과된 lastActivityAt → 타이머 없이 즉시 bannerStale=true', () => {
    const t0 = Date.now()
    vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS + 1000)
    useAppStore.setState({
      autonomyActive: true, goalRun: { detail: null, turns: 1, startedAt: t0 }, lastActivityAt: t0, bannerStale: false,
    } as Parameters<typeof useAppStore.setState>[0])
    useAppStore.getState().refreshStaleWatchdog()
    expect(useAppStore.getState().bannerStale).toBe(true)
  })

  it('refreshStaleWatchdog: goalRun=null → 타이머 미가동(경과해도 bannerStale 불변, autonomyActive 값과 무관 — BL1 후속: 게이트가 goalRun으로 교체됨)', () => {
    useAppStore.setState({
      autonomyActive: true, goalRun: null, lastActivityAt: Date.now(), bannerStale: false,
    } as Parameters<typeof useAppStore.setState>[0])
    useAppStore.getState().refreshStaleWatchdog()
    vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS + 1000)
    expect(useAppStore.getState().bannerStale).toBe(false)
  })

  it('실시간 활동 신호(subscribeAgentEvents 경로1) 도착 시 타이머가 재무장되고 bannerStale이 해제된다', () => {
    useAppStore.setState({
      currentRunId: 'run-live', autonomyActive: true, goalRun: { detail: null, turns: 1, startedAt: Date.now() },
      lastActivityAt: Date.now(), bannerStale: false,
    } as Parameters<typeof useAppStore.setState>[0])
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    useAppStore.getState().refreshStaleWatchdog()

    vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS - 1000)
    expect(capturedHandler).toBeTruthy()
    capturedHandler!({ runId: 'run-live', event: { type: 'text', delta: '진행 중' } })

    vi.advanceTimersByTime(1000)
    expect(useAppStore.getState().bannerStale).toBe(false)

    vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS - 1000)
    expect(useAppStore.getState().bannerStale).toBe(true)

    unsubscribe()
  })

  it('dismissGoalStale: 수동 해제 — staleDismissed=true, autonomyActive는 불변(자동 강제 해제 아님)', () => {
    useAppStore.setState({ autonomyActive: true, bannerStale: true, staleDismissed: false } as Parameters<typeof useAppStore.setState>[0])
    useAppStore.getState().dismissGoalStale()
    const s = useAppStore.getState()
    expect(s.staleDismissed).toBe(true)
    expect(s.autonomyActive).toBe(true)
  })

  it('정상 경로 회귀: abortRun은 bannerStale/staleDismissed/lastActivityAt을 리셋한다(+ goalRun도 소멸, BL1 후속)', async () => {
    useAppStore.setState({
      currentRunId: 'run-abort-p03',
      runGeneration: null,
      isRunning: true,
      autonomyActive: true,
      goalRun: { detail: '목표', turns: 2, startedAt: Date.now() },
      lastActivityAt: Date.now(),
      bannerStale: true,
      staleDismissed: true,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().abortRun()

    const s = useAppStore.getState()
    expect(s.autonomyActive).toBe(false)
    expect(s.bannerStale).toBe(false)
    expect(s.staleDismissed).toBe(false)
    expect(s.lastActivityAt).toBeNull()
    expect(s.goalRun).toBeNull()
  })

  it('정상 경로 회귀: ended(autonomy_status) 도착 시 기존 해제 동작 불변 + stale 필드도 함께 정리(+ goalRun 소멸, BL1 후속)', () => {
    useAppStore.setState({
      currentRunId: 'run-ended', autonomyActive: true, goalRun: { detail: '목표', turns: 1, startedAt: Date.now() },
      bannerStale: true, staleDismissed: true,
    } as Parameters<typeof useAppStore.setState>[0])
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    capturedHandler!({ runId: 'run-ended', event: { type: 'autonomy_status', status: 'ended', reason: 'grace-expired' } })
    const s = useAppStore.getState()
    expect(s.autonomyActive).toBe(false)
    expect(s.bannerStale).toBe(false)
    expect(s.staleDismissed).toBe(false)
    expect(s.goalRun).toBeNull()
    unsubscribe()
  })
})

describe('대화 전환 연속성 — bgRuns 복귀 (BG_RUNS_CAP 이내)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    capturedHandler = null
    __resetBackgroundRunsForTests()
    useAppStore.setState({
      conversationId: null, currentRunId: null, autonomyActive: false,
      lastActivityAt: null, bannerStale: false, staleDismissed: false,
      activeLoops: [], loopsStoppedNotice: false, pendingCommand: null,
      goalRun: null,
    } as Parameters<typeof useAppStore.setState>[0])
  })
  afterEach(() => vi.useRealTimers())

  it('A(goal 진행, 아직 신선) → B로 전환 → 임계 초과만큼 대기 → A로 복귀 시 즉시 stale로 표시된다(타이머가 리셋되지 않는다)', async () => {
    const t0 = Date.now()
    useAppStore.setState({
      conversationId: 'A', currentRunId: 'run-a', autonomyActive: true,
      goalRun: { detail: null, turns: 1, startedAt: t0 }, lastActivityAt: t0, bannerStale: false,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().selectConversation('B')
    expect(__backgroundRunOf('A') !== undefined).toBe(true)

    vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS + 1000)

    await useAppStore.getState().selectConversation('A')
    const after = useAppStore.getState()
    expect(after.conversationId).toBe('A')
    expect(after.autonomyActive).toBe(true)
    expect(after.bannerStale).toBe(true)
  })

  it('A(goal 진행, 아직 신선) → B로 전환 → 임계 미달 대기 → A로 복귀 시 아직 stale 아님 + 남은시간만큼 지나면 라이브로 stale 전환된다', async () => {
    const t0 = Date.now()
    useAppStore.setState({
      conversationId: 'A', currentRunId: 'run-a', autonomyActive: true,
      goalRun: { detail: null, turns: 1, startedAt: t0 }, lastActivityAt: t0, bannerStale: false,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().selectConversation('B')
    vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS - 60_000)

    await useAppStore.getState().selectConversation('A')
    expect(useAppStore.getState().bannerStale).toBe(false)

    vi.advanceTimersByTime(60_000)
    expect(useAppStore.getState().bannerStale).toBe(true)
  })
})

describe('대화 전환 연속성 — BG_RUNS_CAP(8) 초과 축출 후 복귀(레지스트리 폴백)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    capturedHandler = null
    __resetBackgroundRunsForTests()
    useAppStore.setState({
      conversationId: null, currentRunId: null, autonomyActive: false,
      lastActivityAt: null, bannerStale: false, staleDismissed: false,
      activeLoops: [], loopsStoppedNotice: false, pendingCommand: null,
      goalRun: null,
    } as Parameters<typeof useAppStore.setState>[0])
  })
  afterEach(() => vi.useRealTimers())

  async function leaveTo(next: string): Promise<void> {
    useAppStore.setState({ currentRunId: `run-${next}-prev` } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().selectConversation(next)
  }

  it('A가 bgRuns cap(8) 초과로 evict된 뒤 디스크 경로로 복귀해도 autonomyActive/stale 판정이 이어진다', async () => {
    const t0 = Date.now()
    useAppStore.setState({
      conversationId: 'A', currentRunId: 'run-a', autonomyActive: true,
      goalRun: { detail: null, turns: 1, startedAt: t0 }, lastActivityAt: t0, bannerStale: false,
    } as Parameters<typeof useAppStore.setState>[0])

    await leaveTo('conv-0')
    for (let i = 0; i < 7; i++) {
      await leaveTo(`conv-${i + 1}`)
    }
    expect(__backgroundRunOf('A') !== undefined).toBe(true)
    await leaveTo('conv-8')
    expect(__backgroundRunOf('A') !== undefined).toBe(false)

    vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS + 1000)

    await useAppStore.getState().selectConversation('A')
    const after = useAppStore.getState()
    expect(after.conversationId).toBe('A')
    expect(after.autonomyActive).toBe(true)
    expect(after.bannerStale).toBe(true)
  })
})

// M11 G6 — 패널 시험 panelSession.run-core-alignment(M10 Backlog 3로 지움)에서 옮겼다. 단일 bgRuns에 남은 규칙이다.
describe('E17 — 보관 상한을 넘겨도 실행 중인 run은 버리지 않는다', () => {
  async function seedBackground(runningIdx: number[]): Promise<typeof useAppStore> {
    const { __seedBackgroundRunsForTests } = await import('@renderer/03_Agent/state/backgroundRuns')
    const bgRuns: Parameters<typeof __seedBackgroundRunsForTests>[0] = {}
    for (let i = 0; i < 8; i++) {
      bgRuns[`c${i}`] = {
        ...makeInitialState(),
        currentRunId: `r${i}`,
        isRunning: runningIdx.includes(i),
        runGeneration: null,
        workspaceRoot: null,
        attachedImages: [],
        restoredSession: false,
        replMode: false,
        pickerMode: 'auto',
        selectedModel: 'default',
      }
    }
    __resetBackgroundRunsForTests()
    __seedBackgroundRunsForTests(bgRuns)
    useAppStore.setState({
      conversationId: 'leaving',
      currentRunId: 'r-leave',
      isRunning: true,
    } as unknown as Parameters<typeof useAppStore.setState>[0])
    return useAppStore
  }

  it('단일 bgRuns: 상한(8)을 넘길 때 실행 중인 가장 오래된 대화는 남고, 그다음 끝난 대화가 빠진다', async () => {
    const store = await seedBackground([0])
    store.getState().newConversation()
    const { __backgroundRunIdsForTests } = await import('@renderer/03_Agent/state/backgroundRuns')
    const keys = __backgroundRunIdsForTests()
    expect(keys).toContain('c0')
    expect(keys).not.toContain('c1')
    expect(keys).toContain('leaving')
    expect(keys).toHaveLength(8)
  })

  it('실행 중인 것이 없으면 전처럼 가장 오래된 것부터 버린다', async () => {
    const store = await seedBackground([])
    store.getState().newConversation()
    const { __backgroundRunIdsForTests } = await import('@renderer/03_Agent/state/backgroundRuns')
    const keys = __backgroundRunIdsForTests()
    expect(keys).not.toContain('c0')
    expect(keys).toContain('c1')
    expect(keys).toHaveLength(8)
  })
})
