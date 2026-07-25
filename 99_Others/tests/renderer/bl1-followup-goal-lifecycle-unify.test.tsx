// @vitest-environment jsdom
/**
 * bl1-followup-goal-lifecycle-unify.test.tsx — goal 표시 수명 일원화 (BL1 후속,
 * 2026-07-13 영호 육안 발견 — P03 커밋 d8e29c7 직후).
 *
 * 배경: goal 배너 가시성(LR4 P05)이 `autonomy_status active` 신호(claudeAgentRun.ts
 * `_runPersistentPump`의 유예-흡수 경로에서만 방출)에 결속돼 있었다. 이 신호는
 * `_runPump`(단발/비-REPL 세션)에는 아예 존재하지 않는다 — F-B 중간 done 보류가 여러
 * turn의 result를 하나로 뭉개 autonomy_status를 발화할 지점 자체가 없다. 그 결과 비-REPL
 * 대화의 `/goal`은 카드 턴수는 정상 증가하는데 배너/gloss가 전혀 뜨지 않는 사례가
 * 실측됐다(2026-07-13 10:18 goal, 5턴까지 진행됐지만 미표시).
 *
 * 설계 고정(영호 확정 2026-07-13):
 *   - 점등 = 커맨드 입력 시점(낙관적, begin-command).
 *   - 소등 = 백엔드 종료 신호(autonomy_status ended / error / abort)에서만.
 *   - 턴 경계(handleDone)에는 절대 소멸·리셋 안 됨 — AppState.goalRun이 그 지속 컨텍스트.
 *   - autonomyActive는 가시성 게이트에서 빠지지만 필드·이벤트 처리 자체는 보존(다른
 *     소비처: stopAction.ts는 pendingCommand를 직접 쓰므로 무관 — grep 확인 완료).
 *
 * 소비처 3곳(단일 상태 goalRun 공유): ① resolveLoopStatus 가시성 ② 배너 내용(turns/detail)
 * ③ gloss(Conversation.tsx 전용, hasActiveLoops).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  applyAgentEvent,
  applyBeginCommand,
  makeInitialState,
} from '../../../02.Source/renderer/src/store/reducer'
import type { AppState } from '../../../02.Source/renderer/src/store/reducer'
import { handleError, handleAutonomyStatus, handleDone } from '../../../02.Source/renderer/src/store/reducer/lifecycle'
import { resolveLoopStatus } from '../../../02.Source/renderer/src/lib/loopStatus'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

function payload(event: AgentEvent, runId = 'run-followup'): AgentEventPayload {
  return { runId, event }
}

function textEvt(delta: string, messageId?: string): AgentEvent {
  return { type: 'text', delta, ...(messageId ? { messageId } : {}) }
}

// ══════════════════════════════════════════════════════════════════════════════
// A — AppState.goalRun 시드 + begin-command 점등
// ══════════════════════════════════════════════════════════════════════════════

describe('AppState.goalRun — 초기값 + begin-command 점등', () => {
  it('makeInitialState → goalRun: null', () => {
    expect(makeInitialState().goalRun).toBeNull()
  })

  it("begin-command(name='goal', detail 포함) → goalRun 즉시 생성(turns:0, detail 반영)", () => {
    const s = applyBeginCommand(makeInitialState(), {
      type: 'begin-command', name: 'goal', cardId: 'c1', time: '오후 1:00', detail: '문서 정리',
    })
    expect(s.goalRun).toEqual({ detail: '문서 정리', turns: 0, startedAt: 0 })
  })

  it('begin-command(detail 미전달, 맨몸 /goal) → detail null', () => {
    const s = applyBeginCommand(makeInitialState(), {
      type: 'begin-command', name: 'goal', cardId: 'c1', time: '오후 1:00',
    })
    expect(s.goalRun).toEqual({ detail: null, turns: 0, startedAt: 0 })
  })

  it('nowMs 전달 시 startedAt에 반영', () => {
    const s = applyBeginCommand(makeInitialState(), {
      type: 'begin-command', name: 'goal', cardId: 'c1', time: '오후 1:00', nowMs: 555,
    })
    expect(s.goalRun?.startedAt).toBe(555)
  })

  it("begin-command(name='compact', goal 아님) → goalRun 불변(null)", () => {
    const s = applyBeginCommand(makeInitialState(), {
      type: 'begin-command', name: 'compact', cardId: 'c1', time: '오후 1:00',
    })
    expect(s.goalRun).toBeNull()
  })

  it('이미 goalRun이 있는 상태에서 compact begin-command → goalRun 그대로(다른 커맨드가 훼손 X)', () => {
    const withGoal = applyBeginCommand(makeInitialState(), {
      type: 'begin-command', name: 'goal', cardId: 'c1', time: '오후 1:00', detail: '목표A',
    })
    const s = applyBeginCommand(withGoal, {
      type: 'begin-command', name: 'compact', cardId: 'c2', time: '오후 1:01',
    })
    expect(s.goalRun).toEqual({ detail: '목표A', turns: 0, startedAt: 0 })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// B — 턴 경계(handleDone) 생존 + turns 증가(핵심 회귀: 배너 내용 퇴화 봉합)
// ══════════════════════════════════════════════════════════════════════════════

describe('goalRun — handleDone 턴 경계 생존 (배너 내용 퇴화 봉합)', () => {
  it('handleText가 새 assistant msg 경계마다 goalRun.turns를 증가시킨다', () => {
    const begun = applyBeginCommand(makeInitialState(), {
      type: 'begin-command', name: 'goal', cardId: 'c1', time: '오후 1:00', detail: '목표A',
    })
    const s1 = applyAgentEvent(begun, payload(textEvt('첫 턴', 'm1')))
    expect(s1.goalRun?.turns).toBe(1)
    const s2 = applyAgentEvent(s1, payload(textEvt('둘째 턴', 'm2')))
    expect(s2.goalRun?.turns).toBe(2)
  })

  it('handleDone은 pendingCommand를 지워도 goalRun은 절대 건드리지 않는다(생존)', () => {
    const begun = applyBeginCommand(makeInitialState(), {
      type: 'begin-command', name: 'goal', cardId: 'c1', time: '오후 1:00', detail: '목표A',
    })
    const afterText = applyAgentEvent(begun, payload(textEvt('턴1', 'm1')))
    const afterDone = handleDone(afterText, { type: 'done' })
    expect(afterDone.pendingCommand).toBeNull() // 기존 거동 불변
    expect(afterDone.goalRun).toEqual({ detail: '목표A', turns: 1, startedAt: 0 }) // 신규: 생존
  })

  it("지속-펌프 스타일 반복(done→text→done…)에도 goalRun.turns가 계속 누적된다(pendingCommand는 매턴 null)", () => {
    let s: AppState = applyBeginCommand(makeInitialState(), {
      type: 'begin-command', name: 'goal', cardId: 'c1', time: '오후 1:00', detail: '목표B',
    })
    for (let i = 1; i <= 5; i++) {
      s = applyAgentEvent(s, payload(textEvt(`턴${i}`, `m${i}`)))
      s = handleDone(s, { type: 'done' })
      expect(s.pendingCommand).toBeNull() // 매 턴 경계마다 지워짐(기존 거동)
      expect(s.goalRun?.turns).toBe(i) // 그러나 goalRun은 끊김 없이 누적
      expect(s.goalRun?.detail).toBe('목표B') // detail도 유지
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// C — 종료 신호 3종: error / autonomy_status ended / abort(터미널 리셋)만 소멸
// ══════════════════════════════════════════════════════════════════════════════

describe('goalRun — 종료 신호에서만 소멸', () => {
  it('handleError → goalRun 소멸(error는 종료 신호)', () => {
    const begun = applyBeginCommand(makeInitialState(), {
      type: 'begin-command', name: 'goal', cardId: 'c1', time: '오후 1:00', detail: '목표A',
    })
    const s = handleError(begun, { type: 'error', message: '실패' })
    expect(s.goalRun).toBeNull()
  })

  it('begin 직후(턴 0) 즉시 error → goalRun 확실히 정리(即死 경계 케이스)', () => {
    const begun = applyBeginCommand(makeInitialState(), {
      type: 'begin-command', name: 'goal', cardId: 'c1', time: '오후 1:00', detail: '즉사',
    })
    expect(begun.goalRun).not.toBeNull()
    const s = handleError(begun, { type: 'error', message: 'boom' })
    expect(s.goalRun).toBeNull()
    expect(s.pendingCommand).toBeNull()
    expect(s.isRunning).toBe(false)
  })

  it("autonomy_status status:'ended' → goalRun 소멸", () => {
    const begun = applyBeginCommand(makeInitialState(), {
      type: 'begin-command', name: 'goal', cardId: 'c1', time: '오후 1:00', detail: '목표A',
    })
    const s = handleAutonomyStatus(begun, { type: 'autonomy_status', status: 'ended', reason: 'grace-expired' })
    expect(s.goalRun).toBeNull()
  })

  it("autonomy_status status:'active' → goalRun 불변(생존 확인 신호일 뿐, 소멸 트리거 아님)", () => {
    const begun = applyBeginCommand(makeInitialState(), {
      type: 'begin-command', name: 'goal', cardId: 'c1', time: '오후 1:00', detail: '목표A',
    })
    const s = handleAutonomyStatus(begun, { type: 'autonomy_status', status: 'active' })
    expect(s.goalRun).toEqual({ detail: '목표A', turns: 0, startedAt: 0 })
    expect(s.autonomyActive).toBe(true) // 필드·이벤트 처리 자체는 보존
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// D — resolveLoopStatus 신규 계약: goalRun 단일 소스(가시성+내용), autonomyActive 미참조
// ══════════════════════════════════════════════════════════════════════════════

describe('resolveLoopStatus — goalRun 단일 소스 신규 계약', () => {
  it('goalRun null → none(autonomyActive 인자 자체가 사라짐 — 시그니처 변경)', () => {
    expect(resolveLoopStatus([]).kind).toBe('none')
    expect(resolveLoopStatus([], null).kind).toBe('none')
  })

  it('goalRun 존재만으로 즉시 goal(핵심 회귀 — autonomy_status 없이도 표시)', () => {
    const st = resolveLoopStatus([], { turns: 3, detail: '문서 정리' })
    expect(st.kind).toBe('goal')
    if (st.kind === 'goal') {
      expect(st.turns).toBe(3)
      expect(st.detail).toBe('문서 정리')
    }
  })

  it('단일 표시 불변식: sdk 크론이 goal보다 우선', () => {
    const st = resolveLoopStatus(
      [{ id: 'cc1', summary: '매분 점검', interval: 'Every minute' }],
      { turns: 1, detail: null },
    )
    expect(st.kind).toBe('sdk')
  })

  it('goalRun 있어도 stoppedNotice보다 우선(goal이 살아있으면 정지확인은 뒤로)', () => {
    expect(resolveLoopStatus([], { turns: 1, detail: null }, true).kind).toBe('goal')
  })

  it('goalRun null + stoppedNotice=true → stopped', () => {
    expect(resolveLoopStatus([], null, true).kind).toBe('stopped')
  })

  it('bannerStale=true → goal-stale(4번째 인자로 자리 이동, autonomyActive 자리를 대체)', () => {
    const st = resolveLoopStatus([], { turns: 2, detail: '리팩토링' }, false, true)
    expect(st.kind).toBe('goal-stale')
  })

  it('staleDismissed=true → 표시 숨김(none), goalRun 자체는 여전히 살아있음(호출측 책임)', () => {
    const st = resolveLoopStatus([], { turns: 2, detail: null }, false, true, true)
    expect(st.kind).toBe('none')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// E — 핵심 회귀 재현: autonomy_status active가 단 한 번도 오지 않아도 배너가 뜬다
//     (비-REPL/단발 펌프 진단 — main 미수정, renderer 게이트 전환으로 봉합)
// ══════════════════════════════════════════════════════════════════════════════

describe('회귀 — autonomy_status 신호 없는 goal(단발 펌프 시뮬레이션)도 표시된다', () => {
  it('begin → text×5(각 done 경계 포함, autonomy_status 전무) → 매 시점 goalRun 기반 배너가 goal로 표시', () => {
    let s: AppState = applyBeginCommand(makeInitialState(), {
      type: 'begin-command', name: 'goal', cardId: 'c1', time: '오후 1:00', detail: '10:18 goal',
    })
    // 점등 = 커맨드 입력 시점 — autonomy_status 없이도 즉시 goal.
    expect(resolveLoopStatus(s.activeLoops, s.goalRun).kind).toBe('goal')
    expect(s.autonomyActive).toBe(false) // 백엔드 신호 전무(진단된 버그 조건) — 게이트 무관해짐

    for (let i = 1; i <= 5; i++) {
      s = applyAgentEvent(s, payload(textEvt(`턴${i}`, `m${i}`)))
      s = handleDone(s, { type: 'done' }) // origin:'cron' 다턴 경계 시뮬레이션(autonomy_status 없음)
      const status = resolveLoopStatus(s.activeLoops, s.goalRun)
      expect(status.kind).toBe('goal')
      if (status.kind === 'goal') {
        expect(status.turns).toBe(i) // 내용 퇴화 없음
        expect(status.detail).toBe('10:18 goal')
      }
      expect(s.autonomyActive).toBe(false) // 끝까지 한 번도 안 켜짐 — 그래도 배너는 정상
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// F — 단일챗 store 라이브 배선: 터미널 리셋(abort/dead-run) + stale-watchdog 게이트 전환
// ══════════════════════════════════════════════════════════════════════════════

let runIdCounter = 0
// reviewer 🔴 봉합(경로2 bgHit write-through 회귀, 섹션 H 전용): 백그라운드 대화의
// 자율 턴 이벤트를 수동 주입하려면 구독 콜백을 붙잡아야 한다.
let capturedHandler: ((payload: AgentEventPayload) => void) | null = null

const mockApi = {
  // id 지정 시 최소 유효 레코드 반환(섹션 H: bgRuns 축출 후 selectConversation(id) 복귀가
  // 디스크 로드 경로를 실제로 타야 한다 — 빈 배열이면 조기 return으로 no-op).
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
  workspaceOpen: async () => ({ rootPath: null, tree: null }),
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

import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import {
  usePanelSlot,
  __resetPanelSessionManagerForTests,
  panelReducerFn,
} from '../../../02.Source/renderer/src/store/panelSession'
import { GOAL_BANNER_STALE_THRESHOLD_MS } from '../../../02.Source/renderer/src/store/staleWatchdog'

describe('appStore — goalRun 터미널 리셋 (abort / dead-run)', () => {
  beforeEach(() => {
    useAppStore.setState({
      conversationId: null, currentRunId: null, runGeneration: null, isRunning: false,
      thread: [], bgRuns: {}, pendingCommand: null, activeLoops: [], loopsStoppedNotice: false,
      autonomyActive: false, lastActivityAt: null, bannerStale: false, staleDismissed: false,
      goalRun: null,
    } as Parameters<typeof useAppStore.setState>[0])
  })

  it('abortRun: goalRun 진행 중 abort → goalRun null로 정리', async () => {
    useAppStore.setState({
      currentRunId: 'run-abort-goal', runGeneration: null, isRunning: true,
      goalRun: { detail: '목표', turns: 2, startedAt: 1 },
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().abortRun()

    const s = useAppStore.getState()
    expect(s.currentRunId).toBeNull()
    expect(s.goalRun).toBeNull()
  })

  it('dead-run interrupt(accepted:false, closeDeadRunState) → goalRun null로 정리', async () => {
    useAppStore.setState({
      currentRunId: 'run-dead-goal', runGeneration: null, isRunning: true, conversationId: null,
      goalRun: { detail: '목표', turns: 1, startedAt: 1 },
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().interruptRun()

    const s = useAppStore.getState()
    expect(s.currentRunId).toBeNull()
    expect(s.goalRun).toBeNull()
  })
})

describe('appStore — stale-watchdog 게이트가 goalRun 존재로 전환(autonomyActive 무관)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAppStore.setState({
      conversationId: null, currentRunId: null, runGeneration: null, isRunning: false,
      thread: [], bgRuns: {}, autonomyActive: false, lastActivityAt: null, bannerStale: false,
      staleDismissed: false, loopsStoppedNotice: false, pendingCommand: null, activeLoops: [],
      goalRun: null,
    } as Parameters<typeof useAppStore.setState>[0])
  })
  afterEach(() => vi.useRealTimers())

  it('autonomyActive=false여도 goalRun이 있으면 refreshStaleWatchdog가 타이머를 무장하고 임계 경과 시 bannerStale=true', () => {
    const t0 = Date.now()
    useAppStore.setState({
      autonomyActive: false, // 진단된 버그 조건 — 이 신호가 끝까지 안 옴
      goalRun: { detail: '목표', turns: 1, startedAt: t0 },
      lastActivityAt: t0,
      bannerStale: false,
    } as Parameters<typeof useAppStore.setState>[0])
    useAppStore.getState().refreshStaleWatchdog()
    expect(useAppStore.getState().bannerStale).toBe(false)
    vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS)
    expect(useAppStore.getState().bannerStale).toBe(true)
  })

  it('goalRun=null이면 autonomyActive=true여도(방어적 케이스) 타이머 미가동', () => {
    useAppStore.setState({
      autonomyActive: true, goalRun: null, lastActivityAt: Date.now(), bannerStale: false,
    } as Parameters<typeof useAppStore.setState>[0])
    useAppStore.getState().refreshStaleWatchdog()
    vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS + 1000)
    expect(useAppStore.getState().bannerStale).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// H — 백그라운드 write-through(경로2 bgHit, runtime.ts subscribeAgentEvents) goalRun
//     스레딩 회귀 (reviewer 🔴 봉합, coordinator 지시)
//
// 결함: 경로2(백그라운드 in-flight 대화 run 이벤트, bgHit)의
// syncConversationLoopDisplayAndRouting 스냅샷이 goalRun을 누락했다(형제 3곳 —
// sessions.ts 두 leave-스냅샷 + panelSession.ts write-through — 는 전부 포함).
// loopDisplayRegistry.sync는 전체 replace라 미전달 시 null로 덮어쓰고, 진단된 시나리오
// (autonomy_status 안 오는 단발 펌프 — pendingCommand는 done이 null화, autonomyActive는
// 끝까지 false)에서는 트리오 나머지 필드도 전부 falsy라 isEmptyLoopDisplaySnapshot이
// true가 돼 레지스트리 엔트리 자체가 삭제된다 — bgRuns cap 축출 후 복귀 시 종료 신호
// 없이 배너가 소실된다.
//
// 기존 bl1-p03 축출 테스트(대화 전환 연속성 — BG_RUNS_CAP(8))는 백그라운드 상태의 A에게
// 이벤트를 보내지 않아 경로2(bgHit) 자체를 타지 않는다 — 이 테스트가 그 갭을 메운다.
// ══════════════════════════════════════════════════════════════════════════════

describe('appStore — 경로2(bgHit) write-through goalRun 스레딩 회귀 (reviewer 🔴 봉합)', () => {
  beforeEach(() => {
    runIdCounter = 0
    capturedHandler = null
    useAppStore.setState({
      conversationId: null, currentRunId: null, bgRuns: {}, goalRun: null,
      autonomyActive: false, lastActivityAt: null, bannerStale: false, staleDismissed: false,
      activeLoops: [], loopsStoppedNotice: false, pendingCommand: null,
    } as Parameters<typeof useAppStore.setState>[0])
  })

  it('배경 대화 A의 자율 턴 이벤트가 경로2 write-through를 거쳐도 goalRun이 레지스트리에 보존되고, bgRuns cap 축출 후 복귀 시 배너가 살아있다', async () => {
    // 1. A에서 /goal 시작(foreground) — begin-command가 goalRun을 즉시 생성.
    useAppStore.setState({ conversationId: 'A' } as Parameters<typeof useAppStore.setState>[0])
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    await useAppStore.getState().sendMessage('/goal 계속 진행해줘')
    const runA = useAppStore.getState().currentRunId as string
    expect(useAppStore.getState().goalRun).not.toBeNull()

    // 2. B로 전환 → A는 백그라운드(leave-스냅샷은 정상적으로 goalRun을 포함해 등록한다 —
    //    이 시점까지는 결함 없음, sessions.ts는 이미 goalRun을 스레딩함).
    await useAppStore.getState().selectConversation('B')
    expect('A' in useAppStore.getState().bgRuns).toBe(true)

    // 3. A의 자율 턴 이벤트가 경로2(bgHit)로 도착 — text(턴 진행) 후 done(턴 경계,
    //    autonomy_status 없음 — 진단된 단발 펌프 시나리오 재현). done이 pendingCommand를
    //    null화해도 goalRun은 reducer 계약상 생존해야 하고, 그 값이 이 write-through에도
    //    실려야 레지스트리가 정확하다 — 이번 결함의 핵심 검증 지점(runtime.ts:625).
    expect(capturedHandler).toBeTruthy()
    capturedHandler!({ runId: runA, event: { type: 'text', delta: '다음 턴', messageId: 'm2' } })
    capturedHandler!({ runId: runA, event: { type: 'done' } })
    expect(useAppStore.getState().bgRuns['A']?.goalRun).not.toBeNull() // bgRuns 자체는 항상 정확(버그 지점 아님)

    // 4. bgRuns cap(8) 초과 축출 — A를 몰아낸다(bf3-p07/bl1-p03과 동형 패턴).
    async function leaveTo(next: string): Promise<void> {
      useAppStore.setState({ currentRunId: `run-${next}-prev` } as Parameters<typeof useAppStore.setState>[0])
      await useAppStore.getState().selectConversation(next)
    }
    await leaveTo('conv-0')
    for (let i = 0; i < 8; i++) {
      await leaveTo(`conv-${i + 1}`)
    }
    expect('A' in useAppStore.getState().bgRuns).toBe(false) // 축출 확정

    // 5. A 복귀 — bgRuns에 없으므로 디스크 로드 경로(레지스트리 폴백)를 탄다.
    //    수정 전: 경로2 write-through가 goalRun을 누락해 레지스트리 엔트리가 비어
    //    자기 가지치기(delete)됐으므로 savedLoopDisplay가 undefined → goalRun=null(RED).
    //    수정 후: goalRun이 레지스트리에 보존돼 여기서 그대로 복원된다(GREEN).
    await useAppStore.getState().selectConversation('A')
    const after = useAppStore.getState()
    expect(after.conversationId).toBe('A')
    expect(after.goalRun).not.toBeNull()
    expect(after.goalRun?.detail).toBe('계속 진행해줘')

    unsubscribe()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// G — panel 정합: CLEAR_LOOPS가 goalRun을 정리하고, done(APPLY_EVENT)은 건드리지 않는다
// ══════════════════════════════════════════════════════════════════════════════

describe('panelReducer — CLEAR_LOOPS/APPLY_EVENT 정합(단일챗과 동형)', () => {
  it("CLEAR_LOOPS → goalRun null(abort와 동형 터미널 리셋)", () => {
    const base = { ...makeInitialState(), currentRunId: 'p-run', isRunning: true, replMode: true,
      goalRun: { detail: '목표', turns: 3, startedAt: 1 } }
    const next = panelReducerFn(
      base as Parameters<typeof panelReducerFn>[0],
      { type: 'CLEAR_LOOPS' } as Parameters<typeof panelReducerFn>[1]
    )
    expect(next.goalRun).toBeNull()
  })

  it("APPLY_EVENT(done)은 goalRun을 건드리지 않는다(턴 경계 생존, 패널도 공유 reducer 경유)", () => {
    const base = { ...makeInitialState(), currentRunId: 'p-run', isRunning: true, replMode: true,
      goalRun: { detail: '목표', turns: 1, startedAt: 1 } }
    const next = panelReducerFn(
      base as Parameters<typeof panelReducerFn>[0],
      { type: 'APPLY_EVENT', payload: payload({ type: 'done' }, 'p-run') } as Parameters<typeof panelReducerFn>[1]
    )
    expect(next.goalRun).toEqual({ detail: '목표', turns: 1, startedAt: 1 })
  })
})

describe('usePanelSlot — goal begin 시 goalRun이 autonomy_status 없이 즉시 켜진다(패널 라이브 배선)', () => {
  beforeEach(() => {
    runIdCounter = 0
    __resetPanelSessionManagerForTests()
  })
  afterEach(() => {
    __resetPanelSessionManagerForTests()
  })

  it('goal 커맨드 send 직후(autonomy_status 미도착) → session.state.goalRun 즉시 생성', async () => {
    const owner = renderHook(() => usePanelSlot('sess-followup-owner', 0))
    await act(async () => {
      await owner.result.current.send('/goal 문서 정리해줘')
    })
    expect(owner.result.current.state.goalRun).toEqual(
      expect.objectContaining({ detail: '문서 정리해줘', turns: 0 })
    )
    expect(owner.result.current.state.autonomyActive).toBe(false) // 신호 미도착 — 무관해짐
    act(() => { owner.unmount() })
  })
})
