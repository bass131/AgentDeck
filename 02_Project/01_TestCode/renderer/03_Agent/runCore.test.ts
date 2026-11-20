// 작업 ID: g9a · 옛 이름 g9a-run-core.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeInitialState } from '@renderer/05_Conversation/state/reducer'
import { createRunCore, createStaleWatchdogs, enginePromptFor, isRunningRetained, pickEvictions } from '@renderer/03_Agent/state/runCore'
import { closeDeadRunState, runReducer } from '@renderer/03_Agent/state/runReducer'
import type { RunCoreState } from '@renderer/03_Agent/state/runReducer'
import type { RunCorePorts } from '@renderer/03_Agent/state/runCore'
import type { AgentEventPayload } from '@shared/ipcContract'
import type { ThreadItem } from '@renderer/05_Conversation/state/threadTypes'
import { GOAL_BANNER_STALE_THRESHOLD_MS } from '@renderer/03_Agent/state/staleWatchdog'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

// M05 G9a — 공용 실행 코어의 구조 단위 테스트. 코어의 동작 규칙(E 항목)도 여기서 본다.

function base(over: Partial<RunCoreState> = {}): RunCoreState {
  return { ...makeInitialState(), replMode: false, queue: [], ...over }
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
      value: { api: adaptFlatApi({ agentRun }) },
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
      value: { api: adaptFlatApi({ agentRun: vi.fn(() => new Promise(() => {})) }) },
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
      value: { api: adaptFlatApi({ agentRun }) },
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

// M11 G2 — M07 Backlog 16. agent.run 응답 전에 온 이벤트를 붙들었다가 실행 id가 정해지면 그 id의 것만 적용한다.
describe('createRunCore.send — 응답 전에 도착한 실행 이벤트 (M07-16)', () => {
  function rig(agentRun: () => Promise<{ runId: string }>) {
    Object.defineProperty(globalThis, 'window', {
      value: { api: adaptFlatApi({ agentRun }) },
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
    return { core, read: () => state }
  }

  it('응답 전에 온 error·done을 실행 id가 정해진 뒤 적용해 실행 중 표시를 끝낸다', async () => {
    let resolveRun!: (v: { runId: string }) => void
    const { core, read } = rig(() => new Promise((r) => { resolveRun = r }))
    const sending = core.send({ text: '안녕' })
    expect(read().isRunning).toBe(true)
    expect(core.handleEvent({ runId: 'r-early', event: { type: 'error', message: 'SDK 로드 실패' } })).toBe(false)
    expect(core.handleEvent({ runId: 'r-other', event: { type: 'error', message: '남의 실행' } })).toBe(false)
    core.handleEvent({ runId: 'r-early', event: { type: 'done' } })
    resolveRun({ runId: 'r-early' })
    await sending
    expect(read().currentRunId).toBe('r-early')
    expect(read().isRunning).toBe(false)
    expect(read().errorMessage).toBe('SDK 로드 실패')
  })

  it('요청이 실패하면 붙든 이벤트를 버린다', async () => {
    let rejectRun!: (e: Error) => void
    const { core, read } = rig(() => new Promise((_, rej) => { rejectRun = rej }))
    const sending = core.send({ text: '안녕' })
    core.handleEvent({ runId: 'r-x', event: { type: 'text', delta: '유령' } })
    rejectRun(new Error('거절'))
    await sending
    expect(read().errorMessage).toBe('거절')
    expect(JSON.stringify(read().thread)).not.toContain('유령')
  })

  it('응답 뒤에는 붙들지 않는다 — 다른 실행의 이벤트는 그대로 버린다', async () => {
    const { core, read } = rig(async () => ({ runId: 'r1' }))
    await core.send({ text: '안녕' })
    expect(core.handleEvent({ runId: 'r-late', event: { type: 'error', message: 'x' } })).toBe(false)
    expect(read().errorMessage).toBeUndefined()
  })

  it('요청 단계 오류 문장에서 Electron 접두를 떼어 낸다', async () => {
    const { core, read } = rig(async () => {
      throw new Error("Error invoking remote method 'agent.run': Error: 컨트롤 설정이 바뀌어 실행을 열지 않았습니다")
    })
    await core.send({ text: '안녕' })
    expect(read().errorMessage).toBe('컨트롤 설정이 바뀌어 실행을 열지 않았습니다')
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

// M11 G6 — 패널 어댑터를 거쳐 코어를 보던 시험(panelSession.run-core-alignment·backlog46-dispose, M10 Backlog 3로 지움)을 코어에서 직접 본다.
describe('createRunCore — 전송·중단·질문 규칙(E1·E2·E3·E8·E11·E13, Backlog 46)', () => {
  type Api = Record<string, ReturnType<typeof vi.fn>>
  function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
    let resolve!: (v: T) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
  }
  function rig(over: Partial<RunCorePorts<RunCoreState>> = {}) {
    const api: Api = {
      agentRun: vi.fn(async () => ({ runId: 'run-1' })),
      agentAbort: vi.fn(async () => ({ ok: true })),
      agentInterrupt: vi.fn(async () => ({ ok: true })),
      questionRespond: vi.fn(async () => undefined),
    }
    Object.defineProperty(globalThis, 'window', { value: { api: adaptFlatApi(api) }, writable: true, configurable: true })
    const box = { state: base() }
    const core = createRunCore<RunCoreState>({
      readState: () => box.state,
      dispatch: (a) => { box.state = runReducer(box.state, a) },
      refreshStale: () => {},
      resolveRunTarget: () => ({}),
      onPermissionMode: () => {},
      ...over,
    })
    const emit = (event: AgentEventPayload['event'], runId = 'run-1'): boolean => core.handleEvent({ runId, event } as AgentEventPayload)
    const msgs = () => box.state.thread.filter((t): t is Extract<ThreadItem, { kind: 'msg' }> => t.kind === 'msg')
    return { api, box, core, emit, msgs }
  }

  it('E1: 실행 중이면 두 번째 send는 메시지도 agentRun도 만들지 않는다', async () => {
    const { api, box, core, msgs } = rig()
    await core.send({ text: '첫 요청' })
    expect(box.state.isRunning).toBe(true)
    await core.send({ text: '실행 중 두 번째' })
    expect(api.agentRun).toHaveBeenCalledTimes(1)
    expect(msgs().map((m) => m.text)).toEqual(['첫 요청'])
  })

  it('E3: agentRun 실패로 남은 errorMessage가 다음 전송 시작과 함께 사라진다', async () => {
    const { api, box, core } = rig()
    api.agentRun.mockImplementationOnce(async () => { throw new Error('연결 실패') })
    await core.send({ text: '실패할 요청' })
    expect(box.state.errorMessage).toBe('연결 실패')
    const gate = deferred<{ runId: string }>()
    api.agentRun.mockImplementationOnce(() => gate.promise)
    const pending = core.send({ text: '다시 요청' })
    expect(box.state.errorMessage).toBeUndefined()
    gate.resolve({ runId: 'run-e3' })
    await pending
  })

  it('E2: 대기 창의 중단은 IPC를 보내지 않고, agentRun이 실패하면 이전 세대로 돌아간다', async () => {
    const { api, box, core, emit } = rig()
    await core.send({ text: '첫 run' })
    emit({ type: 'done' })
    const first = box.state.runGeneration
    expect(typeof first).toBe('string')
    const gate = deferred<{ runId: string }>()
    api.agentRun.mockImplementationOnce(() => gate.promise)
    const pending = core.send({ text: '두 번째 run' })
    expect(box.state.runGeneration).not.toBe(first)
    await core.abort()
    expect(api.agentAbort).not.toHaveBeenCalled()
    expect(box.state.isRunning).toBe(true)
    gate.reject(new Error('agentRun 거절'))
    await pending
    expect(box.state.runGeneration).toBe(first)
    expect(box.state.errorMessage).toBe('agentRun 거절')
  })

  it('E2·E8: 수립된 run의 중단은 agentAbort를 보내고 세대를 지우며, 열린 응답에 「중단됨」을 단다', async () => {
    const { api, box, core, emit, msgs } = rig()
    await core.send({ text: '질문' })
    emit({ type: 'text', delta: '답하는 중', messageId: 'a-1' })
    expect(box.state.openMsgId).toBe('a-1')
    await core.abort()
    expect(api.agentAbort).toHaveBeenCalledWith({ runId: 'run-1' })
    expect(box.state.runGeneration).toBeNull()
    expect(box.state.isRunning).toBe(false)
    expect(msgs().find((m) => m.role === 'assistant')?.interrupted).toBe(true)
  })

  it('E8: 열린 메시지가 없으면(대기 중) 사용자 메시지는 건드리지 않는다', async () => {
    const { core, msgs } = rig()
    await core.send({ text: '질문' })
    await core.abort()
    expect(msgs().every((m) => m.interrupted === undefined)).toBe(true)
  })

  it('E11: interrupt가 ok:true면 run은 계속되고 열린 메시지에 「중단됨」만 단다', async () => {
    const { api, box, core, emit, msgs } = rig()
    await core.send({ text: '질문' })
    emit({ type: 'text', delta: '답', messageId: 'a-1' })
    await core.interrupt()
    expect(api.agentInterrupt).toHaveBeenCalledWith({ runId: 'run-1' })
    expect(box.state.isRunning).toBe(true)
    expect(msgs().find((m) => m.role === 'assistant')?.interrupted).toBe(true)
  })

  it('E11: interrupt가 ok:false면 죽은 run으로 보고 실행 표시·세대를 정리한다', async () => {
    const { api, box, core } = rig()
    await core.send({ text: '질문' })
    api.agentInterrupt.mockResolvedValueOnce({ ok: false })
    await core.interrupt()
    expect(box.state.isRunning).toBe(false)
    expect(box.state.currentRunId).toBeNull()
    expect(box.state.runGeneration).toBeNull()
  })

  it('E11: agentRun 대기 창이나 run이 없을 때는 interrupt IPC를 보내지 않는다', async () => {
    const idle = rig()
    await idle.core.interrupt()
    expect(idle.api.agentInterrupt).not.toHaveBeenCalled()
    const { api, core, emit } = rig()
    await core.send({ text: '첫 run' })
    emit({ type: 'done' })
    const gate = deferred<{ runId: string }>()
    api.agentRun.mockImplementationOnce(() => gate.promise)
    const pending = core.send({ text: '두 번째' })
    await core.interrupt()
    expect(api.agentInterrupt).not.toHaveBeenCalled()
    gate.resolve({ runId: 'run-2' })
    await pending
  })

  it('E13: question_request가 오면 pendingQuestion이 서고, 답과 취소(null)가 questionRespond로 간다', async () => {
    const question = { question: '어느 쪽으로 할까요?', options: [{ label: 'A' }, { label: 'B' }] }
    const { api, box, core, emit } = rig()
    await core.respondQuestion([['A']])
    expect(api.questionRespond).not.toHaveBeenCalled()
    await core.send({ text: '질문해 줘' })
    emit({ type: 'question_request', requestId: 'q-1', questions: [question] })
    expect(box.state.pendingQuestion).toMatchObject({ runId: 'run-1', requestId: 'q-1' })
    await core.respondQuestion([['A']])
    expect(api.questionRespond).toHaveBeenCalledWith({ runId: 'run-1', requestId: 'q-1', answers: [['A']] })
    expect(box.state.pendingQuestion).toBeNull()
    emit({ type: 'question_request', requestId: 'q-2', questions: [question] })
    await core.respondQuestion(null)
    expect(api.questionRespond).toHaveBeenLastCalledWith({ runId: 'run-1', requestId: 'q-2', answers: null })
  })

  it('Backlog 46: 전송 중 life가 바뀌면 SET_RUN_ID·onRunStarted 없이 도착한 run을 agentAbort로 끊는다', async () => {
    let life = 0
    const actions: string[] = []
    const onRunStarted = vi.fn()
    const gate = deferred<{ runId: string }>()
    const { api, box, core } = rig({
      dispatch: (a) => { actions.push(a.type); box.state = runReducer(box.state, a) },
      onRunStarted,
      life: () => life,
    })
    api.agentRun.mockReturnValueOnce(gate.promise)
    const sending = core.send({ text: 'x' })
    life += 1
    gate.resolve({ runId: 'r-core' })
    await sending
    expect(actions).toEqual(['ADD_USER_MESSAGE'])
    expect(onRunStarted).not.toHaveBeenCalled()
    expect(api.agentAbort).toHaveBeenCalledWith({ runId: 'r-core' })
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

  it('isRunningRetained(E17)는 실행 중인 항목만 보호한다', () => {
    const entries: [string, { isRunning: boolean }][] = [['a', { isRunning: true }], ['b', { isRunning: false }]]
    expect(pickEvictions(entries, 2, 1, isRunningRetained)).toEqual(['b'])
    expect(pickEvictions([['a', { isRunning: true }]], 2, 1, isRunningRetained)).toEqual([])
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
