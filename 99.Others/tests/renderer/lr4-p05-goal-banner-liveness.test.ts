/**
 * lr4-p05-goal-banner-liveness.test.ts — goal 배너 백엔드 생존신호 결속 (LR4 Phase 05,
 * 원 계약) + BL1 후속(2026-07-13, goal 표시 수명 일원화) 부분 대체 기록.
 *
 * ── 원 배경(LR4 P05) ─────────────────────────────────────────────────────────────
 * goal 배너의 두 결함(조기발동·미해제, 증상 A3)을 봉합했다 — 가시성을 낙관 플래그
 * (`pendingCommand?.name === 'goal'`)에서 백엔드 실상태 신호 `autonomy_status`
 * (agent-events.ts)로 환원한 `autonomyActive` 필드에 결속했다.
 *
 * ── BL1 후속 슈퍼시전(영호 확정 2026-07-13) ──────────────────────────────────────
 * `autonomy_status active`는 claudeAgentRun.ts `_runPersistentPump`의 유예-흡수 경로
 * (idle-close grace 중 continuation 도착)에서만 방출되고, 단발(비-REPL) 세션의
 * `_runPump`에는 그 방출 지점 자체가 없다 — `/goal`이 실제로 진행 중인데도 이 신호가
 * 한 번도 오지 않아 배너가 전혀 뜨지 않는 사례가 실측됐다(2026-07-13 10:18 goal).
 * 가시성 게이트를 autonomyActive에서 지속 goal 컨텍스트(AppState.goalRun — begin-command
 * 시점 낙관적 생성, 종료 신호에서만 소멸)로 교체했다 — 이 파일 아래 S1(조기발동 억제)
 * 시나리오는 **의도적으로 역전**됐다(이제 낙관적 즉시 발동이 설계 목표). 새 계약의
 * 전체 커버리지는 `bl1-followup-goal-lifecycle-unify.test.tsx`(신규)에 있다.
 *
 * 이 파일은 **autonomyActive 필드·이벤트 처리 자체가 여전히 보존**됨을 검증하는 부분만
 * 남긴다(BL1 후속 지시: "autonomyActive는 가시성 게이트에서 제외하되 상태·이벤트 처리
 * 자체는 보존") — resolveLoopStatus 가시성 결속 테스트(구 S1/S2 goal-kind 어서션)는
 * 제거했다(계약 자체가 사라짐, 대체 없음 — 새 계약은 goalRun 단독 결정).
 *
 * 신뢰경계/결정론: 순수 리듀서 + window.api 모킹(fs/네트워크/타이머 0).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  applyAgentEvent,
  applyBeginCommand,
  makeInitialState,
} from '../../../02.Source/renderer/src/store/reducer'
import type { AppState } from '../../../02.Source/renderer/src/store/reducer'
import { panelApply, panelReducerFn } from '../../../02.Source/renderer/src/store/panelSession'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

// ── window.api 최소 스텁 (appStore 로딩 + abort/interrupt IPC 호출용) ──────────────
const mockApi = {
  conversationLoad: async () => ({ conversations: [] }),
  conversationSave: async () => ({ id: 'cv-1' }),
  agentRun: async () => ({ runId: 'r1' }),
  agentAbort: async (_req: { runId: string }) => ({ accepted: true }),
  agentInterrupt: async (_req: { runId: string }) => ({ accepted: false }),
  onAgentEvent: () => () => {},
  listFiles: async () => ({ files: [] }),
  pathForFile: () => '',
  saveImageData: async () => ({ path: '' }),
  workspaceOpen: async () => ({ rootPath: null, tree: null }),
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

// appStore는 정적 import(모듈 로드 시 window.api 미사용) — 액션 호출 시점에만 window.api 참조.
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'

// ── 헬퍼 ────────────────────────────────────────────────────────────────────────

const RUN = 'run-lr4-p05'

function payload(event: AgentEvent, runId = RUN): AgentEventPayload {
  return { runId, event }
}

/** autonomy_status active 이벤트(자율 연속 턴 확인). */
function autonomyActiveEvt(): AgentEvent {
  return { type: 'autonomy_status', status: 'active' }
}

/** autonomy_status ended 이벤트(자율반복 종료 + 사유). */
function autonomyEndedEvt(reason: 'grace-expired' | 'cap-reached'): AgentEvent {
  return { type: 'autonomy_status', status: 'ended', reason }
}

/** begin-command로 goal pendingCommand/goalRun을 세운 상태(BL1 후속: 즉시 점등). */
function withGoalPending(state: AppState, detail: string | null = '세션 안정화'): AppState {
  return applyBeginCommand(state, {
    type: 'begin-command',
    name: 'goal',
    cardId: 'cmd-p05',
    time: '오후 1:00',
    ...(detail !== null ? { detail } : {}),
  })
}

/** autonomyActive 필드 안전 판독. */
function autonomyOf(state: unknown): boolean | undefined {
  return (state as { autonomyActive?: boolean }).autonomyActive
}

// ══════════════════════════════════════════════════════════════════════════════
// S2 — active 신호 수신 → autonomyActive 필드 갱신(가시성과 무관하게 필드 자체는 보존)
// ══════════════════════════════════════════════════════════════════════════════

describe('LR4-P05 S2 — autonomy_status active → autonomyActive 필드 갱신(필드·이벤트 처리 보존)', () => {
  it('applyAgentEvent(autonomy_status active) → state.autonomyActive === true', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(autonomyActiveEvt()))
    expect(autonomyOf(s1)).toBe(true)
  })

  it('active 신호는 goalRun에 영향을 주지 않는다(BL1 후속: 소멸 트리거 아님, reducer/lifecycle.ts 참조)', () => {
    const withGoal = withGoalPending(makeInitialState(), '리팩토링 마무리')
    const s = applyAgentEvent(withGoal, payload(autonomyActiveEvt()))
    expect(s.goalRun).toEqual({ detail: '리팩토링 마무리', turns: 0, startedAt: 0 })
    expect(autonomyOf(s)).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// S3/S4 — 종료 해제: active → ended → autonomyActive false(+ goalRun 소멸, BL1 후속)
// ══════════════════════════════════════════════════════════════════════════════

describe('LR4-P05 S3/S4 — 종료 해제 (active → ended)', () => {
  it('active → ended(grace-expired) → autonomyActive false + goalRun 소멸(BL1 후속: 종료 신호)', () => {
    const active = applyAgentEvent(withGoalPending(makeInitialState()), payload(autonomyActiveEvt()))
    expect(autonomyOf(active)).toBe(true) // 중간 상태: 켜짐
    const ended = applyAgentEvent(active, payload(autonomyEndedEvt('grace-expired')))
    expect(autonomyOf(ended)).toBe(false)
    expect(ended.goalRun).toBeNull()
  })

  it('active → ended(cap-reached) → autonomyActive false', () => {
    const active = applyAgentEvent(makeInitialState(), payload(autonomyActiveEvt()))
    const ended = applyAgentEvent(active, payload(autonomyEndedEvt('cap-reached')))
    expect(autonomyOf(ended)).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// S5 — 방어: active 없는 ended는 무시(부수효과 0)
// ══════════════════════════════════════════════════════════════════════════════

describe('LR4-P05 S5 — 방어: active 없는 ended 무시', () => {
  it('fresh state(autonomyActive false)에 ended(grace-expired) → false 유지 + 부수효과 0', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(autonomyEndedEvt('grace-expired')))
    expect(autonomyOf(s1)).toBe(false)
    // spurious 오염 0: 정지 확인 배너·thread·에러 어느 것도 건드리지 않는다.
    expect(s1.loopsStoppedNotice).toBe(false)
    expect(s1.thread).toEqual([])
    expect(s1.errorMessage).toBeUndefined()
    expect(s1.goalRun).toBeNull()
  })

  it('makeInitialState는 autonomyActive를 false로 시드한다(휘발 필드 기본값)', () => {
    expect(autonomyOf(makeInitialState())).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// S6 — panel 정합: 패널도 shared applyAgentEvent 경유 → autonomy_status 동일 처리
// ══════════════════════════════════════════════════════════════════════════════

describe('LR4-P05 S6 — panel 정합 (shared applyAgentEvent 재사용)', () => {
  it('panelApply(autonomy_status active) → 패널 state.autonomyActive === true', () => {
    // LR4 P07: PanelSessionState는 replMode(필수) 요구 — 기본 held-open true로 시드.
    const base = { ...makeInitialState(), currentRunId: RUN, replMode: true }
    const next = panelApply(base, payload(autonomyActiveEvt()))
    expect(autonomyOf(next)).toBe(true)
    // 패널 로컬 불변식 유지 — currentRunId 보존.
    expect(next.currentRunId).toBe(RUN)
  })

  it('panelApply(active → ended) → 패널 state.autonomyActive false로 해제', () => {
    // LR4 P07: PanelSessionState는 replMode(필수) 요구 — 기본 held-open true로 시드.
    const base = { ...makeInitialState(), currentRunId: RUN, replMode: true }
    const active = panelApply(base, payload(autonomyActiveEvt()))
    const ended = panelApply(active, payload(autonomyEndedEvt('grace-expired')))
    expect(autonomyOf(ended)).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// S7 — 터미널 리셋: autonomyActive true 상태에서 dead-run/abort 정리 → false
// ══════════════════════════════════════════════════════════════════════════════

describe('LR4-P05 S7 — 터미널 리셋 (abort / dead-run / panel CLEAR_LOOPS)', () => {
  beforeEach(() => {
    useAppStore.setState({
      queue: [],
      currentRunId: null,
      runGeneration: null,
      isRunning: false,
      thinkingText: null,
      pendingPermission: null,
      pendingQuestion: null,
      pendingCommand: null,
      activeLoops: [],
      loopsStoppedNotice: false,
      thread: [],
      conversationId: null,
      bgRuns: {},
      autonomyActive: false,
      goalRun: null,
    } as Parameters<typeof useAppStore.setState>[0])
  })

  it('(7a) abortRun: autonomyActive=true 진행 중 abort → autonomyActive false', async () => {
    useAppStore.setState({
      currentRunId: 'run-abort',
      runGeneration: null,
      isRunning: true,
      autonomyActive: true,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().abortRun()

    const s = useAppStore.getState()
    expect(s.isRunning).toBe(false) // 정리 경로 실행 확인
    expect(s.currentRunId).toBeNull()
    expect(autonomyOf(s)).toBe(false)
  })

  it('(7b) panel CLEAR_LOOPS: autonomyActive=true → autonomyActive false', () => {
    const base = {
      ...makeInitialState(),
      currentRunId: 'p-run',
      isRunning: true,
      autonomyActive: true,
    }
    const next = panelReducerFn(
      base as Parameters<typeof panelReducerFn>[0],
      { type: 'CLEAR_LOOPS' } as Parameters<typeof panelReducerFn>[1]
    )
    expect(next.isRunning).toBe(false)
    expect(next.currentRunId).toBeNull()
    expect(autonomyOf(next)).toBe(false)
  })

  it('(7c) dead-run interrupt(accepted:false, closeDeadRunState): autonomyActive=true → false', async () => {
    // conversationId=null → interruptRun의 단순 전경 정리 분기(closeDeadRunState) 경로.
    useAppStore.setState({
      currentRunId: 'run-dead',
      runGeneration: null,
      isRunning: true,
      conversationId: null,
      autonomyActive: true,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().interruptRun()

    const s = useAppStore.getState()
    expect(s.isRunning).toBe(false)
    expect(s.currentRunId).toBeNull()
    expect(autonomyOf(s)).toBe(false)
  })
})
