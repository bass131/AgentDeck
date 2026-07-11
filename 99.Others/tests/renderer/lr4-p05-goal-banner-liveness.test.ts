/**
 * lr4-p05-goal-banner-liveness.test.ts — goal 배너 백엔드 생존신호 결속 (LR4 Phase 05, RED)
 *
 * 배경(01.Phases/13_LR4-session-stability/05-goal-banner-liveness.md):
 * goal 배너의 두 결함(조기발동·미해제, 증상 A3)을 봉합한다. 지금까지 배너 가시성은
 * 요청 시점의 "낙관적 플래그"(`pendingCommand?.name === 'goal'`)에만 걸려 있었다 —
 *   ① 조기발동: /goal 입력 즉시 pendingCommand가 세워져 실제 자율반복이 확인되기 전에도
 *      배너가 켜졌다.
 *   ② 미해제: 자율반복이 조용히 사멸(idle-close/상한)해도 pendingCommand가 남아 배너가
 *      계속 떠 있었다. 특히 각 자율 턴은 done을 방출하고 handleDone이 pendingCommand를
 *      null로 지우므로, pendingCommand는 자율 턴 *사이*에 사라졌다 켜졌다를 반복한다 —
 *      가시성을 이 낙관 플래그에 걸면 배너가 깜빡이거나 어긋난다.
 *
 * 해법(P03 신호 소비 — ADR-024 표시-only): 백엔드 지속 펌프가 방출하는 실상태 신호
 * `autonomy_status`(agent-events.ts L608-617)에 배너 가시성을 결속한다.
 *   - status:'active'  → 자율(cron-origin) 연속 턴 확인(유예 중 continuation 흡수)
 *   - status:'ended'   → 자율반복 실제 종료(reason: grace-expired | cap-reached)
 * renderer는 이 신호를 새 AppState 필드 `autonomyActive`(휘발 boolean)로 환원하고,
 * resolveLoopStatus는 goal 변형 가시성을 pendingCommand가 아니라 autonomyActive에 건다.
 * pendingCommand는 turns/detail "enrichment"(3단 위계의 턴수·작업 주제) 소스로만 남는다.
 *
 * ── 이 스위트는 P05 계약을 인코딩하는 실패(RED) 테스트다 ─────────────────────────────
 * 현재(미구현) 코드에 대해 실패한다:
 *   - AppState.autonomyActive 필드·handleAutonomyStatus 핸들러 미존재(reducer default no-op).
 *   - resolveLoopStatus의 goal 게이트가 아직 pendingCommand.name==='goal'(낙관 플래그).
 *   - 터미널 정리(abort/dead-run/panel CLEAR_LOOPS)가 autonomyActive를 리셋하지 않음.
 * renderer Worker가 아래 계약을 구현하면 통과(GREEN)해야 한다. 앱 소스는 이 Phase에서
 * 건드리지 않는다(테스트만) — 구현은 renderer 담당.
 *
 * ── 소비 측 정확 계약(renderer Worker 인계) ─────────────────────────────────────────
 *   (필드)   reducer/types.ts AppState.autonomyActive: boolean  // 기본 false, 휘발
 *   (핸들러) reducer/lifecycle.ts handleAutonomyStatus(state, event):
 *              status==='active' → { ...state, autonomyActive: true }
 *              status==='ended'  → { ...state, autonomyActive: false }
 *            reducer.ts switch: case 'autonomy_status' → handleAutonomyStatus (현 default 대체)
 *   (게이트) lib/loopStatus.ts resolveLoopStatus(activeLoops, pendingCommand?, stoppedNotice?, autonomyActive?):
 *              우선순위 sdk > (autonomyActive)goal > stopped > none
 *              autonomyActive===true → { kind:'goal',
 *                                        turns: pendingCommand?.name==='goal' ? (pendingCommand.turns ?? 0) : 0,
 *                                        detail: pendingCommand?.name==='goal' ? (pendingCommand.detail ?? null) : null }
 *   (초기값) reducer.ts makeInitialState → autonomyActive: false
 *   (터미널) slices/runtime.ts closeDeadRunState·abortRun 터미널 블록 / panelSession.ts
 *            CLEAR_LOOPS → autonomyActive: false. handleDone은 autonomyActive 불변(REPL 턴
 *            경계 — 자율 지속). handleError는 리셋(dead → 배너 off).
 *
 * 신뢰경계/결정론: 순수 리듀서·순수 게이트 함수 + window.api 모킹(fs/네트워크/타이머 0).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  applyAgentEvent,
  applyBeginCommand,
  makeInitialState,
} from '../../../02.Source/renderer/src/store/reducer'
import type { AppState } from '../../../02.Source/renderer/src/store/reducer'
import {
  resolveLoopStatus,
  type GoalPendingLike,
} from '../../../02.Source/renderer/src/lib/loopStatus'
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

/** begin-command로 goal pendingCommand를 세운 상태(낙관 플래그). */
function withGoalPending(state: AppState, detail: string | null = '세션 안정화'): AppState {
  return applyBeginCommand(state, {
    type: 'begin-command',
    name: 'goal',
    cardId: 'cmd-p05',
    time: '오후 1:00',
    ...(detail !== null ? { detail } : {}),
  })
}

/**
 * autonomyActive 필드 안전 판독(현재 AppState에 미존재 → undefined, 구현 후 boolean).
 * RED 단계에서 `undefined === false/true` 비교로 자연 실패, 구현 후 정합.
 */
function autonomyOf(state: unknown): boolean | undefined {
  return (state as { autonomyActive?: boolean }).autonomyActive
}

// ══════════════════════════════════════════════════════════════════════════════
// S1 — 조기발동 억제: 낙관 플래그만으로는 배너가 켜지지 않는다
// ══════════════════════════════════════════════════════════════════════════════

describe('LR4-P05 S1 — 조기발동 억제 (autonomyActive 게이트)', () => {
  it('goal pendingCommand가 있어도 autonomyActive=false면 goal 아님(none) — 낙관 플래그만으론 미발동', () => {
    const goal: GoalPendingLike = { name: 'goal', turns: 0, detail: '세션 안정화' }
    // 4번째 인자 autonomyActive=false → 백엔드가 아직 자율반복을 확인하지 않음.
    const status = resolveLoopStatus([], goal, false, false)
    expect(status.kind).toBe('none')
  })

  it('begin-command 직후(pendingCommand goal 세팅) + autonomyActive=false → 여전히 none', () => {
    const s = withGoalPending(makeInitialState())
    expect(s.pendingCommand?.name).toBe('goal') // 낙관 플래그는 세워졌으나…
    const status = resolveLoopStatus([], s.pendingCommand, false, false)
    expect(status.kind).toBe('none') // …가시성은 autonomyActive에 결속 → 아직 off
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// S2 — active 결속: autonomy_status active → autonomyActive true → 배너 goal
// ══════════════════════════════════════════════════════════════════════════════

describe('LR4-P05 S2 — active 결속 (신호 → autonomyActive → 배너)', () => {
  it('applyAgentEvent(autonomy_status active) → state.autonomyActive === true', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(autonomyActiveEvt()))
    expect(autonomyOf(s1)).toBe(true)
  })

  it('active 이후 resolveLoopStatus(goal 컨텍스트, autonomyActive=true) → goal + turns/detail enrichment', () => {
    const withGoal = withGoalPending(makeInitialState(), '리팩토링 마무리')
    const s = applyAgentEvent(withGoal, payload(autonomyActiveEvt()))
    // 가시성 게이트는 state.autonomyActive, enrichment(turns/detail)는 pendingCommand.
    const status = resolveLoopStatus([], s.pendingCommand, false, autonomyOf(s))
    expect(status.kind).toBe('goal')
    if (status.kind === 'goal') {
      expect(status.turns).toBe(s.pendingCommand?.turns ?? 0) // begin-command 시드값 0
      expect(status.detail).toBe('리팩토링 마무리')
    }
  })

  it('강건성(핵심 근거): autonomyActive=true인데 pendingCommand가 null(자율 턴 사이 done→handleDone이 지움)이어도 goal 유지(turns 0/detail null)', () => {
    // handleDone이 pendingCommand를 null로 지워도 autonomyActive는 ended까지 살아있으므로
    // 배너가 꺼지지 않는다(pendingCommand에 걸었다면 여기서 꺼졌을 것 — 미해제/깜빡임 원인).
    const status = resolveLoopStatus([], null, false, true)
    expect(status.kind).toBe('goal')
    if (status.kind === 'goal') {
      expect(status.turns).toBe(0)
      expect(status.detail).toBeNull()
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// S3/S4 — 종료 해제 & 조용한 사멸: active → ended → autonomyActive false → 배너 off
// ══════════════════════════════════════════════════════════════════════════════

describe('LR4-P05 S3/S4 — 종료 해제 (active → ended, 미해제 봉합)', () => {
  it('active → ended(grace-expired) → autonomyActive false → 배너 off(none)', () => {
    const active = applyAgentEvent(withGoalPending(makeInitialState()), payload(autonomyActiveEvt()))
    expect(autonomyOf(active)).toBe(true) // 중간 상태: 켜짐
    const ended = applyAgentEvent(active, payload(autonomyEndedEvt('grace-expired')))
    expect(autonomyOf(ended)).toBe(false)
    // pendingCommand가 아직 남아 있어도(낙관 플래그) 배너는 꺼진다 — 미해제 봉합.
    const status = resolveLoopStatus([], ended.pendingCommand, false, autonomyOf(ended))
    expect(status.kind).toBe('none')
  })

  it('active → ended(cap-reached) → autonomyActive false → 배너 off(none)', () => {
    const active = applyAgentEvent(makeInitialState(), payload(autonomyActiveEvt()))
    const ended = applyAgentEvent(active, payload(autonomyEndedEvt('cap-reached')))
    expect(autonomyOf(ended)).toBe(false)
    expect(resolveLoopStatus([], null, false, autonomyOf(ended)).kind).toBe('none')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// S5 — 방어: active 없는 ended는 무시(부수효과 0)
// ══════════════════════════════════════════════════════════════════════════════

describe('LR4-P05 S5 — 방어: active 없는 ended 무시', () => {
  it('fresh state(autonomyActive false)에 ended(grace-expired) → false 유지 + 배너 none + 부수효과 0', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(autonomyEndedEvt('grace-expired')))
    expect(autonomyOf(s1)).toBe(false)
    // 배너 미발동
    expect(resolveLoopStatus([], null, s1.loopsStoppedNotice, autonomyOf(s1)).kind).toBe('none')
    // spurious 오염 0: 정지 확인 배너·thread·에러 어느 것도 건드리지 않는다.
    expect(s1.loopsStoppedNotice).toBe(false)
    expect(s1.thread).toEqual([])
    expect(s1.errorMessage).toBeUndefined()
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
    const base = { ...makeInitialState(), currentRunId: RUN }
    const next = panelApply(base, payload(autonomyActiveEvt()))
    expect(autonomyOf(next)).toBe(true)
    // 패널 로컬 불변식 유지 — currentRunId 보존.
    expect(next.currentRunId).toBe(RUN)
  })

  it('panelApply(active → ended) → 패널 state.autonomyActive false로 해제', () => {
    const base = { ...makeInitialState(), currentRunId: RUN }
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
      // 구현 후 필드가 생기면 여기서 초기화됨(RED 단계에선 무시).
      autonomyActive: false,
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
    expect(autonomyOf(s)).toBe(false) // ← RED: 현 abort 블록은 autonomyActive를 리셋하지 않음
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
    expect(autonomyOf(next)).toBe(false) // ← RED: CLEAR_LOOPS가 autonomyActive를 리셋하지 않음
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
    expect(autonomyOf(s)).toBe(false) // ← RED: closeDeadRunState가 autonomyActive를 리셋하지 않음
  })
})
