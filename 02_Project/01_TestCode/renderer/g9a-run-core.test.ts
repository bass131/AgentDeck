import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeInitialState } from '@renderer/05_Conversation/state/reducer'
import { createRunCore, createStaleWatchdogs, enginePromptFor, pickEvictions } from '@renderer/03_Agent/state/runCore'
import { closeDeadRunState, runReducer } from '@renderer/03_Agent/state/runReducer'
import type { RunCoreState } from '@renderer/03_Agent/state/runReducer'
import { GOAL_BANNER_STALE_THRESHOLD_MS } from '@renderer/03_Agent/state/staleWatchdog'

// M05 G9a — 단일·멀티 공용 실행 코어의 구조 단위 테스트. 동작 정렬(E 항목)은 g9a-run-core-alignment가 고정한다.

function base(over: Partial<RunCoreState> = {}): RunCoreState {
  return { ...makeInitialState(), replMode: false, ...over }
}

describe('runReducer — 공용 실행 reducer', () => {
  it('SET_RUN_ID는 runId를 넣고 루프 정지 안내를 끈다', () => {
    const next = runReducer(base({ loopsStoppedNotice: true }), { type: 'SET_RUN_ID', runId: 'r1' })
    expect(next.currentRunId).toBe('r1')
    expect(next.loopsStoppedNotice).toBe(false)
  })

  it('ADD_USER_MESSAGE는 액션이 준 id·시각으로 사용자 메시지를 붙이고 실행 중으로 바꾼다', () => {
    const next = runReducer(base(), { type: 'ADD_USER_MESSAGE', id: 'msg-x', content: '안녕', time: '오전 9:00' })
    expect(next.isRunning).toBe(true)
    expect(next.thread).toEqual([{ kind: 'msg', id: 'msg-x', role: 'user', text: '안녕', time: '오전 9:00' }])
  })

  it('어댑터 고유 필드는 실행 액션을 거쳐도 보존된다', () => {
    const s = { ...base(), enginePickerMode: 'plan' as string | null }
    const next = runReducer(s, { type: 'ADD_USER_MESSAGE', id: 'm1', content: 'x' })
    expect(next.enginePickerMode).toBe('plan')
  })

  it('RUN_FAILED는 세대가 실려 오면 같은 세대일 때만 이전 세대로 되돌린다', () => {
    const failed = runReducer(base({ runGeneration: 'g2' }), {
      type: 'RUN_FAILED', message: 'boom', runGeneration: 'g2', restoreGeneration: 'g1',
    })
    expect(failed.errorMessage).toBe('boom')
    expect(failed.runGeneration).toBe('g1')
    const newer = runReducer(base({ runGeneration: 'g3' }), {
      type: 'RUN_FAILED', message: 'boom', runGeneration: 'g2', restoreGeneration: 'g1',
    })
    expect(newer.runGeneration).toBe('g3')
  })

  it('CLEAR_LOOPS(중단)는 열린 응답 메시지에 interrupted를 단다(E8)', () => {
    const s = base({
      currentRunId: 'r1',
      isRunning: true,
      openMsgId: 'a1',
      thread: [{ kind: 'msg', id: 'a1', role: 'assistant', text: '답하는 중' }],
    })
    const next = runReducer(s, { type: 'CLEAR_LOOPS' })
    expect(next.thread[0]).toMatchObject({ id: 'a1', interrupted: true })
    expect(next.openMsgId).toBeNull()
  })

  it('CLEAR_LOOPS는 열린 메시지가 없으면 thread 항목을 바꾸지 않는다(E8)', () => {
    const thread: RunCoreState['thread'] = [{ kind: 'msg', id: 'u1', role: 'user', text: 'q' }]
    const next = runReducer(base({ currentRunId: 'r1', isRunning: true, thread }), { type: 'CLEAR_LOOPS' })
    expect(next.thread).toEqual(thread)
  })

  it('CLEAR_LOOPS(중단)는 실행 세대를 지운다(E2)', () => {
    const next = runReducer(base({ currentRunId: 'r1', isRunning: true, runGeneration: 'g1' }), { type: 'CLEAR_LOOPS' })
    expect(next.runGeneration).toBeNull()
    expect(next.currentRunId).toBeNull()
  })

  it('MARK_INTERRUPTED는 열린 메시지가 없으면 같은 상태 객체를 돌려준다', () => {
    const s = base()
    expect(runReducer(s, { type: 'MARK_INTERRUPTED' })).toBe(s)
  })

  it('ADD_USER_MESSAGE는 세대를 달고 지난 오류를 지운다(E2·E3)', () => {
    const next = runReducer(base({ errorMessage: '지난 오류' }), {
      type: 'ADD_USER_MESSAGE', id: 'm1', content: 'x', runGeneration: 'g9', clearError: true,
    })
    expect(next.runGeneration).toBe('g9')
    expect(next.errorMessage).toBeUndefined()
  })

  it('closeDeadRunState는 실행 표시를 끄고 세대를 지운다', () => {
    const closed = closeDeadRunState(base({ currentRunId: 'r1', isRunning: true, runGeneration: 'g1' }))
    expect(closed.currentRunId).toBeNull()
    expect(closed.isRunning).toBe(false)
    expect(closed.runGeneration).toBeNull()
  })
})

describe('createRunCore.send — 실행 대상이 동기로 정해지면 agentRun을 같은 tick에 부른다', () => {
  it('pending 창 판정(LR4-P01)이 기대하는 동기 호출을 지킨다', () => {
    const agentRun = vi.fn(() => new Promise<{ runId: string }>(() => {}))
    Object.defineProperty(globalThis, 'window', {
      value: { api: { agentRun } },
      writable: true,
      configurable: true,
    })
    let state = base()
    const core = createRunCore<RunCoreState>({
      readState: () => state,
      dispatch: (a) => { state = runReducer(state, a) },
      refreshStale: () => {},
      resolveRunTarget: () => ({ workspaceRoot: '/w' }),
      onPermissionMode: () => {},
    })
    void core.send({ text: '안녕' })
    expect(agentRun).toHaveBeenCalledTimes(1)
    expect(state.isRunning).toBe(true)
  })

  it('E7: 코어가 메시지·명령 카드 id를 앱 공용 생성기에서 직접 발급한다(어댑터 포트 없음)', () => {
    Object.defineProperty(globalThis, 'window', {
      value: { api: { agentRun: vi.fn(() => new Promise(() => {})) } },
      writable: true,
      configurable: true,
    })
    let state = base()
    const core = createRunCore<RunCoreState>({
      readState: () => state,
      dispatch: (a) => { state = runReducer(state, a) },
      refreshStale: () => {},
      resolveRunTarget: () => ({}),
      onPermissionMode: () => {},
    })
    void core.send({ text: '안녕' })
    state = { ...state, isRunning: false }
    void core.send({ text: '/goal 목표' })
    expect(state.thread[0].id).toMatch(/^msg-\d+$/)
    expect(state.thread[1].id).toMatch(/^cmd-msg-\d+$/)
  })

  it('실행 대상이 Promise면 기다린 뒤 그 값으로 agentRun을 부른다(단일의 REPL 선저장 경로)', async () => {
    const agentRun = vi.fn(async () => ({ runId: 'r9' }))
    Object.defineProperty(globalThis, 'window', {
      value: { api: { agentRun } },
      writable: true,
      configurable: true,
    })
    let state = base()
    const core = createRunCore<RunCoreState>({
      readState: () => state,
      dispatch: (a) => { state = runReducer(state, a) },
      refreshStale: () => {},
      resolveRunTarget: () => Promise.resolve({ persistent: true, sessionKey: 'k1' }),
      onPermissionMode: () => {},
    })
    const p = core.send({ text: '안녕' })
    expect(agentRun).not.toHaveBeenCalled()
    await p
    expect(agentRun).toHaveBeenCalledWith(expect.objectContaining({ persistent: true, sessionKey: 'k1' }))
    expect(state.currentRunId).toBe('r9')
  })
})

describe('createRunCore.handleEvent — permission_mode는 모드 포트로만 간다(E15)', () => {
  it('현재 run의 permission_mode는 dispatch 없이 onPermissionMode만 부른다', () => {
    const dispatched: string[] = []
    const modes: string[] = []
    const state = base({ currentRunId: 'r1' })
    const core = createRunCore<RunCoreState>({
      readState: () => state,
      dispatch: (a) => { dispatched.push(a.type) },
      refreshStale: () => {},
      resolveRunTarget: () => ({}),
      onPermissionMode: (m) => { modes.push(m) },
    })
    expect(core.handleEvent({ runId: 'r1', event: { type: 'permission_mode', mode: 'plan' } })).toBe(true)
    expect(core.handleEvent({ runId: 'r0', event: { type: 'permission_mode', mode: 'auto' } })).toBe(false)
    expect(modes).toEqual(['plan'])
    expect(dispatched).toEqual([])
  })
})

describe('enginePromptFor — 엔진 프롬프트 규칙 하나(E4)', () => {
  it('멘션·이미지가 없으면 원문이고, 있으면 노트를 붙이며, /로 시작하면 늘 원문이다', () => {
    expect(enginePromptFor('그냥 질문', [])).toBe('그냥 질문')
    expect(enginePromptFor('@a.ts 봐줘', [])).toContain('- a.ts')
    expect(enginePromptFor('그림 봐줘', ['/tmp/i.png'])).toContain('- /tmp/i.png')
    expect(enginePromptFor('/compact @a.ts', ['/tmp/i.png'])).toBe('/compact @a.ts')
  })
})

describe('pickEvictions — 보관 상한', () => {
  it('넘친 만큼 오래된 것부터 고르고 보호 대상은 건너뛴다', () => {
    const entries: [string, { running: boolean }][] = [
      ['a', { running: true }], ['b', { running: false }], ['c', { running: false }],
    ]
    expect(pickEvictions(entries, 3, 2, () => false)).toEqual(['a'])
    expect(pickEvictions(entries, 3, 2, (_k, v) => v.running)).toEqual(['b'])
    expect(pickEvictions(entries, 3, 3, () => false)).toEqual([])
  })

  it('Record(단일 bgRuns)와 Map(패널) 어느 쪽 순회든 삽입 순서를 따른다', () => {
    const rec: Record<string, number> = { x: 1, y: 2, z: 3 }
    expect(pickEvictions(Object.entries(rec), 3, 1, () => false)).toEqual(['x', 'y'])
    const map = new Map<string, number>([['p', 1], ['q', 2]])
    expect(pickEvictions(map, map.size, 1, () => false)).toEqual(['p'])
  })
})

describe('createStaleWatchdogs — stale 판정과 타이머 보관', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('goal 실행이 임계를 넘기면 키별로 stale을 표시한다', () => {
    const marked: string[] = []
    const w = createStaleWatchdogs({ markStale: (k) => marked.push(k) })
    const now = Date.now()
    const goalRun = { detail: null, turns: 0, startedAt: now }
    w.refresh('p1', base({ goalRun, lastActivityAt: now }))
    w.refresh('p2', base({ goalRun, lastActivityAt: now - GOAL_BANNER_STALE_THRESHOLD_MS }))
    expect(marked).toEqual(['p2'])
    vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS)
    expect(marked).toEqual(['p2', 'p1'])
  })

  it('dispose한 키는 타이머가 울리지 않는다', () => {
    const marked: string[] = []
    const w = createStaleWatchdogs({ markStale: (k) => marked.push(k) })
    const now = Date.now()
    w.refresh('p1', base({ goalRun: { detail: null, turns: 0, startedAt: now }, lastActivityAt: now }))
    w.dispose('p1')
    vi.advanceTimersByTime(GOAL_BANNER_STALE_THRESHOLD_MS * 2)
    expect(marked).toEqual([])
  })
})
