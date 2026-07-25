// @vitest-environment jsdom
/**
 * bl1-p03-goal-banner-stale-watchdog.test.ts — goal 배너 stale-watchdog (BL1 Phase 03,
 * LR4-DONE:76 잔여 4번 봉합).
 *
 * 배경(01.Phases/16_BL1-backlog-closeout/03-goal-banner-stale-watchdog.md): `autonomy_status`
 * ended 신호가 유실되고 error/abort도 오지 않는 경계에서 goal 배너가 영원히 "진행 중"으로
 * 고착된다. 설계 고정 — main heartbeat 신설 아님, renderer 수신측 stale-watchdog(계약 불변).
 *
 * ── 활동 신호 정의(§staleWatchdog.ts 참조) ─────────────────────────────────────────
 * autonomy_status의 active만 기준 삼으면(claudeAgentRun.ts:918 — 유예 중 continuation
 * 흡수 시에만 방출) 정상 장기 턴을 오판한다 — reducer.ts applyAgentEvent 스위치가 처리하는
 * AgentEvent 전체(19종)를 활동으로 집계하고, 그 최신 수신 시각(nowMs)으로 stale 판정.
 *
 * ── 구성 ─────────────────────────────────────────────────────────────────────────
 * A. staleWatchdog.ts 순수 헬퍼(isStaleNow/remainingStaleMs/isActivityEvent) + createStaleTimer
 *    (fake timer — setTimeout 재설정 방식, setInterval 미사용 증거).
 * B. reducer.ts applyAgentEvent nowMs 활동 스탬프(lastActivityAt/bannerStale/staleDismissed).
 * C. lib/loopStatus.ts resolveLoopStatus — goal-stale 변형 우선순위 + 수동해제(staleDismissed).
 * D. LoopStatusBanner — goal-stale UI(신호없음 표시 + 수동 해제 버튼).
 * E. appStore(단일챗) 라이브 배선 — fake timer로 자동 stale 전환 + 재무장 + 수동해제 + abort 회귀.
 * F. 대화 전환 연속성(bgRuns 복귀 + BG_RUNS_CAP(8) 초과 축출-후-복귀).
 * G. 패널 캐시 축출(PANEL_MANAGER_CAP=32) 후 연속성.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { renderHook, act } from '@testing-library/react'
import {
  GOAL_BANNER_STALE_THRESHOLD_MS,
  isStaleNow,
  remainingStaleMs,
  isActivityEvent,
  createStaleTimer,
} from '../../../02.Source/renderer/src/store/staleWatchdog'
import {
  applyAgentEvent,
  applyBeginCommand,
  makeInitialState,
} from '../../../02.Source/renderer/src/store/reducer'
import type { AppState } from '../../../02.Source/renderer/src/store/reducer'
import { resolveLoopStatus } from '../../../02.Source/renderer/src/lib/loopStatus'
import { LoopStatusBanner } from '../../../02.Source/renderer/src/components/07_notice/LoopStatusBanner'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

afterEach(() => cleanup())

function payload(event: AgentEvent, runId = 'run-p03'): AgentEventPayload {
  return { runId, event }
}

function autonomyActiveEvt(): AgentEvent {
  return { type: 'autonomy_status', status: 'active' }
}

// ══════════════════════════════════════════════════════════════════════════════
// A — staleWatchdog.ts 순수 헬퍼 + 타이머
// ══════════════════════════════════════════════════════════════════════════════

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
    timer.arm(1000) // 새 활동 신호 — 재설정
    vi.advanceTimersByTime(700)
    expect(onStale).not.toHaveBeenCalled() // 누적 1400ms 지났지만 재설정 이후 700ms만 경과
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
    expect(vi.getTimerCount()).toBe(0) // setInterval이었다면 계속 남아있어야 함
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// B — reducer.ts applyAgentEvent nowMs 활동 스탬프
// ══════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// C — lib/loopStatus.ts resolveLoopStatus goal-stale 변형
// ══════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// D — LoopStatusBanner goal-stale UI
// ══════════════════════════════════════════════════════════════════════════════

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
    const running: import('../../../02.Source/renderer/src/lib/loopStatus').LoopStatus =
      { kind: 'goal', turns: 3, detail: '문서 정리' }
    const { container, rerender } = render(<LoopStatusBanner status={running} />)
    expect(container.querySelector('.loop-goal')).not.toBeNull()
    expect(container.querySelector('.loop-spinner')).not.toBeNull()

    rerender(<LoopStatusBanner status={{ kind: 'goal-stale', turns: 3, detail: '문서 정리' }} />)
    expect(container.querySelector('.loop-goal-stale')).not.toBeNull()
    expect(container.querySelector('.loop-spinner')).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// E~G — store 레벨 라이브 배선 (appStore 단일챗 + panelSession 멀티패널)
// ══════════════════════════════════════════════════════════════════════════════

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
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  agentInterrupt: vi.fn().mockResolvedValue({ accepted: false }),
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
  value: { api: mockApi },
  writable: true,
  configurable: true,
})

// appStore/panelSession은 정적 import(모듈 로드 시 window.api 미사용) — 액션 호출 시점에만 참조.
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import {
  usePanelSlot,
  __resetPanelSessionManagerForTests,
  __getPanelManagerSizesForTests,
} from '../../../02.Source/renderer/src/store/panelSession'

describe('appStore(단일챗) — foreground stale-watchdog 라이브 배선 (fake timer)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    capturedHandler = null
    useAppStore.setState({
      conversationId: null,
      currentRunId: null,
      runGeneration: null,
      isRunning: false,
      thread: [],
      bgRuns: {},
      autonomyActive: false,
      lastActivityAt: null,
      bannerStale: false,
      staleDismissed: false,
      loopsStoppedNotice: false,
      pendingCommand: null,
      activeLoops: [],
      // goal 표시 수명 일원화(BL1 후속): refreshStaleWatchdog의 실제 게이트 —
      // autonomyActive가 아니라 goalRun 존재 여부(아래 각 it가 필요 시 세팅).
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

    vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS - 1000) // 임계 임박
    expect(capturedHandler).toBeTruthy()
    capturedHandler!({ runId: 'run-live', event: { type: 'text', delta: '진행 중' } }) // 새 활동 신호

    vi.advanceTimersByTime(1000) // 원래 타이머라면 이미 발화했을 시점
    expect(useAppStore.getState().bannerStale).toBe(false) // 재무장 덕에 아직 stale 아님

    vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS - 1000)
    expect(useAppStore.getState().bannerStale).toBe(true) // 재무장된 임계가 지나면 결국 stale

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

// ══════════════════════════════════════════════════════════════════════════════
// F — 대화 전환 연속성 (bgRuns 복귀 + BG_RUNS_CAP(8) 초과 축출-후-복귀)
// ══════════════════════════════════════════════════════════════════════════════

describe('대화 전환 연속성 — bgRuns 복귀 (BG_RUNS_CAP 이내)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    capturedHandler = null
    useAppStore.setState({
      conversationId: null, currentRunId: null, bgRuns: {}, autonomyActive: false,
      lastActivityAt: null, bannerStale: false, staleDismissed: false,
      activeLoops: [], loopsStoppedNotice: false, pendingCommand: null,
      // goal 표시 수명 일원화(BL1 후속): 각 it가 필요 시 goalRun을 명시 세팅.
      goalRun: null,
    } as Parameters<typeof useAppStore.setState>[0])
  })
  afterEach(() => vi.useRealTimers())

  it('A(goal 진행, 아직 신선) → B로 전환 → 임계 초과만큼 대기 → A로 복귀 시 즉시 stale로 표시된다(타이머가 리셋되지 않는다)', async () => {
    const t0 = Date.now()
    useAppStore.setState({
      conversationId: 'A', currentRunId: 'run-a', autonomyActive: true,
      // goal 표시 수명 일원화(BL1 후속): 대화-스코프 스냅샷/복귀의 실제 게이트 — goalRun.
      goalRun: { detail: null, turns: 1, startedAt: t0 }, lastActivityAt: t0, bannerStale: false,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().selectConversation('B') // A는 백그라운드로
    expect('A' in useAppStore.getState().bgRuns).toBe(true)

    vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS + 1000) // 백그라운드 체류 중 임계 초과

    await useAppStore.getState().selectConversation('A') // 복귀
    const after = useAppStore.getState()
    expect(after.conversationId).toBe('A')
    expect(after.autonomyActive).toBe(true) // 강제 해제 아님(엔진 실상태 불변)
    expect(after.bannerStale).toBe(true) // 경과 시간 그대로 반영 — 리셋되지 않음
  })

  it('A(goal 진행, 아직 신선) → B로 전환 → 임계 미달 대기 → A로 복귀 시 아직 stale 아님 + 남은시간만큼 지나면 라이브로 stale 전환된다', async () => {
    const t0 = Date.now()
    useAppStore.setState({
      conversationId: 'A', currentRunId: 'run-a', autonomyActive: true,
      // goal 표시 수명 일원화(BL1 후속): 대화-스코프 스냅샷/복귀의 실제 게이트 — goalRun.
      goalRun: { detail: null, turns: 1, startedAt: t0 }, lastActivityAt: t0, bannerStale: false,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().selectConversation('B')
    vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS - 60_000) // 1분 남기고

    await useAppStore.getState().selectConversation('A')
    expect(useAppStore.getState().bannerStale).toBe(false) // 아직 임계 전

    vi.advanceTimersByTime(60_000) // 남은 1분 경과 — 재무장된 타이머가 살아있어야 발화
    expect(useAppStore.getState().bannerStale).toBe(true)
  })
})

describe('대화 전환 연속성 — BG_RUNS_CAP(8) 초과 축출 후 복귀(레지스트리 폴백)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    capturedHandler = null
    useAppStore.setState({
      conversationId: null, currentRunId: null, bgRuns: {}, autonomyActive: false,
      lastActivityAt: null, bannerStale: false, staleDismissed: false,
      activeLoops: [], loopsStoppedNotice: false, pendingCommand: null,
      // goal 표시 수명 일원화(BL1 후속): 각 it가 필요 시 goalRun을 명시 세팅.
      goalRun: null,
    } as Parameters<typeof useAppStore.setState>[0])
  })
  afterEach(() => vi.useRealTimers())

  // bf3-p07-banner-continuity-bgruns.test.ts와 동형: 각 홉을 "실행 중"으로 시뮬레이션해야
  // selectConversation의 P3b 스냅샷 조건(currentRunId!==null)이 매 홉마다 성립한다 —
  // 안 하면 3단계 디스크 로드 경로가 currentRunId를 null로 리셋해버려 다음 홉부터
  // 스냅샷 자체가 발생하지 않는다(bgRuns가 A 1개에서 멈춤 — cap 초과가 재현 안 됨).
  async function leaveTo(next: string): Promise<void> {
    useAppStore.setState({ currentRunId: `run-${next}-prev` } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().selectConversation(next)
  }

  it('A가 bgRuns cap(8) 초과로 evict된 뒤 디스크 경로로 복귀해도 autonomyActive/stale 판정이 이어진다', async () => {
    const t0 = Date.now()
    useAppStore.setState({
      conversationId: 'A', currentRunId: 'run-a', autonomyActive: true,
      // goal 표시 수명 일원화(BL1 후속): 대화-스코프 스냅샷/복귀의 실제 게이트 — goalRun.
      goalRun: { detail: null, turns: 1, startedAt: t0 }, lastActivityAt: t0, bannerStale: false,
    } as Parameters<typeof useAppStore.setState>[0])

    await leaveTo('conv-0')
    for (let i = 0; i < 7; i++) {
      await leaveTo(`conv-${i + 1}`)
    }
    expect('A' in useAppStore.getState().bgRuns).toBe(true) // 아직 축출 전
    await leaveTo('conv-8') // 9번째 삽입 — A 축출
    expect('A' in useAppStore.getState().bgRuns).toBe(false) // 축출 확정

    vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS + 1000) // 축출된 채로 임계 초과

    await useAppStore.getState().selectConversation('A') // 디스크 로드 경로(레지스트리 폴백)
    const after = useAppStore.getState()
    expect(after.conversationId).toBe('A')
    expect(after.autonomyActive).toBe(true) // 레지스트리가 autonomyActive를 보존
    expect(after.bannerStale).toBe(true) // 경과 시간 기준 stale 즉시 반영
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G — 패널 캐시 축출(PANEL_MANAGER_CAP=32) 후 연속성
// ══════════════════════════════════════════════════════════════════════════════

describe('패널 캐시 축출(PANEL_MANAGER_CAP=32) 후 stale 판정 연속성', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    runIdCounter = 0
    capturedHandler = null
    __resetPanelSessionManagerForTests()
  })
  afterEach(() => {
    vi.useRealTimers()
    __resetPanelSessionManagerForTests()
  })

  it('goal 진행 중(신선) 패널이 idle+unmount 상태로 CAP 초과 축출된 뒤, 임계 초과 시간이 지나 재마운트하면 즉시 stale로 표시된다', async () => {
    const OWNER = 'sess-p03-owner'
    const owner = renderHook(() => usePanelSlot(OWNER, 0))
    await act(async () => {
      // goal 표시 수명 일원화(BL1 후속): '/' 접두 슬래시 커맨드여야 begin-command가
      // 발화해 goalRun이 생성된다(신규 stale-watchdog 게이트) — 접두 없는 평문은
      // 일반 user 메시지로 처리돼 goalRun을 만들지 않는다.
      await owner.result.current.send('/goal 시작해줘')
    })
    const runId = owner.result.current.state.currentRunId as string
    expect(capturedHandler).toBeTruthy()
    act(() => {
      capturedHandler!({ runId, event: { type: 'autonomy_status', status: 'active' } })
    })
    act(() => {
      capturedHandler!({ runId, event: { type: 'done' } }) // 턴 경계(idle 전이) — autonomyActive 불변
    })
    expect(owner.result.current.state.autonomyActive).toBe(true)
    expect(owner.result.current.state.isRunning).toBe(false)
    act(() => {
      owner.unmount()
    })

    // 32개 필러 슬롯 마운트+언마운트 — CAP(32) 초과로 owner(최초 삽입·idle·리스너 없음) 축출.
    for (let s = 0; s < 32; s++) {
      const filler = renderHook(() => usePanelSlot(`sess-p03-filler-${s}`, 0))
      act(() => { filler.unmount() })
    }
    expect(__getPanelManagerSizesForTests().states).toBeLessThanOrEqual(32)

    // 축출된 채로 임계 초과 시간 경과.
    vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS + 1000)

    const returned = renderHook(() => usePanelSlot(OWNER, 0))
    expect(returned.result.current.state.autonomyActive).toBe(true) // 연속성 — 게이트 유지
    expect(returned.result.current.state.bannerStale).toBe(true) // 경과 시간 기준 즉시 stale

    act(() => { returned.unmount() })
  })

  it('goal 진행 중(신선) 패널이 CAP 초과 축출된 뒤, 임계 미달 시간만 지나 재마운트하면 아직 stale 아니고 남은 시간만큼 지나면 라이브로 stale 전환된다', async () => {
    const OWNER = 'sess-p03-owner2'
    const owner = renderHook(() => usePanelSlot(OWNER, 0))
    await act(async () => {
      // goal 표시 수명 일원화(BL1 후속): '/' 접두 슬래시 커맨드여야 begin-command가
      // 발화해 goalRun이 생성된다(신규 stale-watchdog 게이트) — 접두 없는 평문은
      // 일반 user 메시지로 처리돼 goalRun을 만들지 않는다.
      await owner.result.current.send('/goal 시작해줘')
    })
    const runId = owner.result.current.state.currentRunId as string
    act(() => {
      capturedHandler!({ runId, event: { type: 'autonomy_status', status: 'active' } })
    })
    act(() => {
      capturedHandler!({ runId, event: { type: 'done' } })
    })
    act(() => { owner.unmount() })

    for (let s = 0; s < 32; s++) {
      const filler = renderHook(() => usePanelSlot(`sess-p03-filler2-${s}`, 0))
      act(() => { filler.unmount() })
    }
    expect(__getPanelManagerSizesForTests().states).toBeLessThanOrEqual(32)

    vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS - 60_000) // 1분 남기고 축출 상태 유지

    const returned = renderHook(() => usePanelSlot(OWNER, 0))
    expect(returned.result.current.state.bannerStale).toBe(false) // 아직 임계 전

    act(() => {
      vi.advanceTimersByTime(60_000) // 남은 1분 — 재마운트 후 재무장된 타이머가 발화해야 함
    })
    expect(returned.result.current.state.bannerStale).toBe(true)

    act(() => { returned.unmount() })
  })

  it('여러 패널은 각자 독립된 watchdog을 가진다 — 한 패널의 stale이 다른 패널을 오염시키지 않는다', async () => {
    const p0 = renderHook(() => usePanelSlot('sess-p03-multi', 0))
    const p1 = renderHook(() => usePanelSlot('sess-p03-multi', 1))

    await act(async () => { await p0.result.current.send('/goal A') })
    await act(async () => { await p1.result.current.send('/goal B') })
    const runId0 = p0.result.current.state.currentRunId as string
    const runId1 = p1.result.current.state.currentRunId as string

    act(() => { capturedHandler!({ runId: runId0, event: { type: 'autonomy_status', status: 'active' } }) })
    // p1은 나중에 활동 신호를 받는다(더 신선함).
    act(() => { vi.advanceTimersByTime(60_000) })
    act(() => { capturedHandler!({ runId: runId1, event: { type: 'autonomy_status', status: 'active' } }) })

    act(() => { vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS - 60_000 + 1000) }) // p0만 임계 초과, p1은 아직
    expect(p0.result.current.state.bannerStale).toBe(true)
    expect(p1.result.current.state.bannerStale).toBe(false)

    act(() => { p0.unmount() })
    act(() => { p1.unmount() })
  })

  it('수동 해제(dismissGoalStale) — 패널별로 독립 동작하며 autonomyActive는 그대로 유지된다', async () => {
    const owner = renderHook(() => usePanelSlot('sess-p03-dismiss', 0))
    await act(async () => { await owner.result.current.send('/goal 시작') })
    const runId = owner.result.current.state.currentRunId as string
    act(() => { capturedHandler!({ runId, event: { type: 'autonomy_status', status: 'active' } }) })
    act(() => { vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS + 1000) })
    expect(owner.result.current.state.bannerStale).toBe(true)

    act(() => { owner.result.current.dismissGoalStale() })
    expect(owner.result.current.state.staleDismissed).toBe(true)
    expect(owner.result.current.state.autonomyActive).toBe(true) // 강제 해제 아님

    act(() => { owner.unmount() })
  })
})
