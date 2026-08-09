import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { AgentEvent } from '../../../02_Project/00_Source/shared/agentEvents'
import {
  IdleCloseGovernor,
  IDLE_CLOSE_GRACE_MS,
} from '../../../02_Project/00_Source/main/01_agents/idleCloseGovernor'

interface Harness {
  gov: IdleCloseGovernor
  emitted: AgentEvent[]
  commits: number
  setRunActive: (v: boolean) => void
  setExternalGates: (v: boolean) => void
}

function makeHarness(): Harness {
  const emitted: AgentEvent[] = []
  const state = { runActive: true, gates: true, commits: 0 }
  const gov = new IdleCloseGovernor({
    emit: (e) => emitted.push(e),
    isRunActive: () => state.runActive,
    externalGatesOpen: () => state.gates,
    onGraceCommit: () => {
      state.commits++
    },
  })
  return {
    gov,
    emitted,
    get commits() {
      return state.commits
    },
    setRunActive: (v) => {
      state.runActive = v
    },
    setExternalGates: (v) => {
      state.gates = v
    },
  } as Harness
}

const endedEvents = (evs: AgentEvent[]): AgentEvent[] =>
  evs.filter((e) => e.type === 'autonomy_status' && e.status === 'ended')
const activeEvents = (evs: AgentEvent[]): AgentEvent[] =>
  evs.filter((e) => e.type === 'autonomy_status' && e.status === 'active')

describe('IdleCloseGovernor — 축1(session_state) 안전 교집합 게이트', () => {
  let h: Harness
  beforeEach(() => {
    h = makeHarness()
  })

  it('신호 미수신 세션은 게이트가 항상 열려 있다(fallback — 기존 거동 무변경)', () => {
    expect(h.gov.sessionStateGateOpen()).toBe(true)
  })

  it("신호 수신 세션은 최신값이 'idle'일 때만 열린다", () => {
    h.gov.observeSessionState('idle')
    expect(h.gov.sessionStateGateOpen()).toBe(true)
    h.gov.observeSessionState('running')
    expect(h.gov.sessionStateGateOpen()).toBe(false)
    h.gov.observeSessionState('requires_action')
    expect(h.gov.sessionStateGateOpen()).toBe(false)
  })

  it('latest-wins — 늦게 도착한 관측이 앞선 관측을 supersede한다', () => {
    h.gov.observeSessionState('running')
    h.gov.observeSessionState('idle')
    expect(h.gov.sessionStateGateOpen()).toBe(true)
    h.gov.observeSessionState('running')
    expect(h.gov.sessionStateGateOpen()).toBe(false)
  })
})

describe('IdleCloseGovernor — 유예(grace) 타이머', () => {
  let h: Harness

  beforeEach(() => {
    vi.useFakeTimers()
    h = makeHarness()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('스케줄 직후에는 아무 일도 없다 — 만료돼야 커밋한다', () => {
    h.gov.scheduleGrace()
    expect(h.gov.isGracePending()).toBe(true)
    vi.advanceTimersByTime(IDLE_CLOSE_GRACE_MS - 1)
    expect(h.commits).toBe(0)
    expect(h.emitted).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(h.commits).toBe(1)
    expect(endedEvents(h.emitted)).toHaveLength(1)
    expect(h.emitted[0]).toEqual({
      type: 'autonomy_status',
      status: 'ended',
      reason: 'grace-expired',
    })
    expect(h.gov.isGracePending()).toBe(false)
  })

  it('이미 대기 중이면 재스케줄하지 않는다(멱등 — 이중 예약 방지)', () => {
    h.gov.scheduleGrace()
    vi.advanceTimersByTime(IDLE_CLOSE_GRACE_MS / 2)
    h.gov.scheduleGrace()
    vi.advanceTimersByTime(IDLE_CLOSE_GRACE_MS / 2)
    expect(h.commits).toBe(1)
    vi.advanceTimersByTime(IDLE_CLOSE_GRACE_MS)
    expect(h.commits).toBe(1)
  })

  it('만료 전 취소하면 커밋하지 않는다(타이머 누수 0)', () => {
    h.gov.scheduleGrace()
    h.gov.cancelGrace()
    expect(h.gov.isGracePending()).toBe(false)
    vi.advanceTimersByTime(IDLE_CLOSE_GRACE_MS * 2)
    expect(h.commits).toBe(0)
    expect(h.emitted).toHaveLength(0)
  })

  it('취소는 멱등이다(대기 중이 아니어도 안전)', () => {
    expect(() => {
      h.gov.cancelGrace()
      h.gov.cancelGrace()
    }).not.toThrow()
  })

  it('run이 이미 죽었으면(abort/close) 만료돼도 방출·커밋 0', () => {
    h.gov.scheduleGrace()
    h.setRunActive(false)
    vi.advanceTimersByTime(IDLE_CLOSE_GRACE_MS)
    expect(h.commits).toBe(0)
    expect(h.emitted).toHaveLength(0)
  })

  it('거버너 밖 축(미완료 토큰·입력 큐·루프 활동·bg 태스크)이 닫혀 있으면 커밋 안 함', () => {
    h.gov.scheduleGrace()
    h.setExternalGates(false)
    vi.advanceTimersByTime(IDLE_CLOSE_GRACE_MS)
    expect(h.commits).toBe(0)
    expect(h.emitted).toHaveLength(0)
    expect(h.gov.isGracePending()).toBe(false)
  })

  it("축1이 닫혀 있으면(최신 session_state가 'running') 만료 재확인에서 커밋 안 함", () => {
    h.gov.observeSessionState('idle')
    h.gov.scheduleGrace()
    h.gov.observeSessionState('running')
    vi.advanceTimersByTime(IDLE_CLOSE_GRACE_MS)
    expect(h.commits).toBe(0)
  })

  it('만료 후 다시 스케줄할 수 있다(창은 반복 가능)', () => {
    h.gov.scheduleGrace()
    vi.advanceTimersByTime(IDLE_CLOSE_GRACE_MS)
    h.gov.scheduleGrace()
    vi.advanceTimersByTime(IDLE_CLOSE_GRACE_MS)
    expect(h.commits).toBe(2)
    expect(endedEvents(h.emitted)).toHaveLength(2)
  })
})

describe('IdleCloseGovernor — 유예 창 안의 활동 흡수(absorbActivity)', () => {
  let h: Harness

  beforeEach(() => {
    vi.useFakeTimers()
    h = makeHarness()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('유예 대기 중 자율(cron) 활동 → 유예 취소 + active 1회 방출', () => {
    h.gov.scheduleGrace()
    h.gov.absorbActivity('cron')
    expect(h.gov.isGracePending()).toBe(false)
    expect(activeEvents(h.emitted)).toHaveLength(1)
    vi.advanceTimersByTime(IDLE_CLOSE_GRACE_MS)
    expect(h.commits).toBe(0)
  })

  it('새 유예 창이 열리면 dedup 플래그가 리셋된다 — 창당 정확히 1회', () => {
    h.gov.scheduleGrace()
    h.gov.absorbActivity('cron')
    h.gov.scheduleGrace()
    h.gov.absorbActivity('cron')
    expect(activeEvents(h.emitted)).toHaveLength(2)
  })

  it('사용자(user) 활동은 유예만 취소하고 active를 방출하지 않는다', () => {
    h.gov.scheduleGrace()
    h.gov.absorbActivity('user')
    expect(h.gov.isGracePending()).toBe(false)
    expect(activeEvents(h.emitted)).toHaveLength(0)
  })

  it('유예 대기 중이 아니면 완전한 no-op이다(방출 0)', () => {
    h.gov.absorbActivity('cron')
    expect(activeEvents(h.emitted)).toHaveLength(0)
    expect(h.gov.isGracePending()).toBe(false)
  })
})
