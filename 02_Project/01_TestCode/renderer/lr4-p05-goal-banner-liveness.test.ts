import { describe, it, expect, beforeEach } from 'vitest'
import {
  applyAgentEvent,
  applyBeginCommand,
  makeInitialState,
} from '../../../02_Project/00_Source/renderer/src/store/reducer'
import type { AppState } from '../../../02_Project/00_Source/renderer/src/store/reducer'
import { panelApply, panelReducerFn } from '../../../02_Project/00_Source/renderer/src/store/panelSession'
import type { AgentEvent } from '../../../02_Project/00_Source/shared/agentEvents'
import type { AgentEventPayload } from '../../../02_Project/00_Source/shared/ipcContract'

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

import { useAppStore } from '../../../02_Project/00_Source/renderer/src/store/appStore'

const RUN = 'run-lr4-p05'

function payload(event: AgentEvent, runId = RUN): AgentEventPayload {
  return { runId, event }
}

function autonomyActiveEvt(): AgentEvent {
  return { type: 'autonomy_status', status: 'active' }
}

function autonomyEndedEvt(reason: 'grace-expired' | 'cap-reached'): AgentEvent {
  return { type: 'autonomy_status', status: 'ended', reason }
}

function withGoalPending(state: AppState, detail: string | null = '세션 안정화'): AppState {
  return applyBeginCommand(state, {
    type: 'begin-command',
    name: 'goal',
    cardId: 'cmd-p05',
    time: '오후 1:00',
    ...(detail !== null ? { detail } : {}),
  })
}

function autonomyOf(state: unknown): boolean | undefined {
  return (state as { autonomyActive?: boolean }).autonomyActive
}

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

describe('LR4-P05 S3/S4 — 종료 해제 (active → ended)', () => {
  it('active → ended(grace-expired) → autonomyActive false + goalRun 소멸(BL1 후속: 종료 신호)', () => {
    const active = applyAgentEvent(withGoalPending(makeInitialState()), payload(autonomyActiveEvt()))
    expect(autonomyOf(active)).toBe(true)
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

describe('LR4-P05 S5 — 방어: active 없는 ended 무시', () => {
  it('fresh state(autonomyActive false)에 ended(grace-expired) → false 유지 + 부수효과 0', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(autonomyEndedEvt('grace-expired')))
    expect(autonomyOf(s1)).toBe(false)
    expect(s1.loopsStoppedNotice).toBe(false)
    expect(s1.thread).toEqual([])
    expect(s1.errorMessage).toBeUndefined()
    expect(s1.goalRun).toBeNull()
  })

  it('makeInitialState는 autonomyActive를 false로 시드한다(휘발 필드 기본값)', () => {
    expect(autonomyOf(makeInitialState())).toBe(false)
  })
})

describe('LR4-P05 S6 — panel 정합 (shared applyAgentEvent 재사용)', () => {
  it('panelApply(autonomy_status active) → 패널 state.autonomyActive === true', () => {
    const base = { ...makeInitialState(), currentRunId: RUN, replMode: true }
    const next = panelApply(base, payload(autonomyActiveEvt()))
    expect(autonomyOf(next)).toBe(true)
    expect(next.currentRunId).toBe(RUN)
  })

  it('panelApply(active → ended) → 패널 state.autonomyActive false로 해제', () => {
    const base = { ...makeInitialState(), currentRunId: RUN, replMode: true }
    const active = panelApply(base, payload(autonomyActiveEvt()))
    const ended = panelApply(active, payload(autonomyEndedEvt('grace-expired')))
    expect(autonomyOf(ended)).toBe(false)
  })
})

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
    expect(s.isRunning).toBe(false)
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
