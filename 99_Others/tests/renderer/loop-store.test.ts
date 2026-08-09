import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../../../02_Source/renderer/src/store/appStore'

const mockApi = {
  conversationLoad: async () => ({ conversations: [] }),
  conversationSave: async () => ({ id: 'cv-1' }),
  agentRun: async () => ({ runId: 'r1' }),
  agentAbort: async () => ({ accepted: true }),
  agentInterrupt: async () => ({ accepted: true }),
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

function reset() {
  useAppStore.setState({ queue: [], currentRunId: null } as Parameters<typeof useAppStore.setState>[0])
}

describe('store loop — abort/interrupt 연동 (SDK 크론 표시 activeLoops 정리, LR2-03 봉합 잔존)', () => {
  beforeEach(() => reset())

  it('abortRun → activeLoops(SDK 크론 표시)도 해제 (세션 종료 = 크론 사멸 동기화)', async () => {
    useAppStore.setState({
      currentRunId: 'r1',
      activeLoops: [{ id: 'cc1', summary: '매분 점검', interval: 'Every minute' }],
    } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().abortRun()
    expect(useAppStore.getState().activeLoops).toEqual([])
  })

  it('interruptRun(턴 정지, 세션 유지)은 activeLoops 유지 — 크론 살아있음', async () => {
    useAppStore.setState({
      currentRunId: 'r1',
      activeLoops: [{ id: 'cc1', summary: '매분 점검', interval: 'Every minute' }],
    } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().interruptRun()
    expect(useAppStore.getState().activeLoops.length).toBe(1)
  })
})

describe('store loop — loopsStoppedNotice (정지 신뢰 피드백)', () => {
  beforeEach(() => reset())

  it('abortRun(활성 루프 있음) → loopsStoppedNotice true (확인 배너 점화)', async () => {
    useAppStore.setState({
      currentRunId: 'r1',
      loopsStoppedNotice: false,
      activeLoops: [{ id: 'cc1', summary: '매분 점검', interval: 'Every minute' }],
    } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().abortRun()
    expect(useAppStore.getState().loopsStoppedNotice).toBe(true)
  })

  it('abortRun(활성 루프 없음 — 일반 중단) → notice 안 켬(루프 없던 중단에 오표시 금지)', async () => {
    useAppStore.setState({
      currentRunId: 'r1',
      loopsStoppedNotice: false,
      activeLoops: [],
    } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().abortRun()
    expect(useAppStore.getState().loopsStoppedNotice).toBe(false)
  })

  it('dismissLoopsStopped → false (✕ 닫기)', () => {
    useAppStore.setState({ loopsStoppedNotice: true } as Parameters<typeof useAppStore.setState>[0])
    useAppStore.getState().dismissLoopsStopped()
    expect(useAppStore.getState().loopsStoppedNotice).toBe(false)
  })

  it('loops 이벤트(비어있지 않음) → notice 자동 해제 (새 루프 시작이 확인 배너를 대체)', async () => {
    const { applyAgentEvent } = await import('../../../02_Source/renderer/src/store/reducer')
    const { makeInitialState } = await import('../../../02_Source/renderer/src/store/reducer')
    const base = { ...makeInitialState(), loopsStoppedNotice: true }
    const next = applyAgentEvent(
      base,
      { runId: 'r1', event: { type: 'loops', loops: [{ id: 'cc2', summary: 's', interval: 'Every minute' }] } },
      '오후 1:00'
    )
    expect(next.loopsStoppedNotice).toBe(false)
  })
})

describe('panel loop — CLEAR_LOOPS (LR2-03, abort 시 SDK 크론 표시 정리)', () => {
  it('CLEAR_LOOPS → activeLoops [] (단일채팅 abortRun과 동형)', async () => {
    const { panelReducerFn } = await import('../../../02_Source/renderer/src/store/panelSession')
    const { makeInitialState } = await import('../../../02_Source/renderer/src/store/reducer')
    const base = {
      ...makeInitialState(),
      currentRunId: 'p1',
      activeLoops: [{ id: 'cc1', summary: '매분 점검', interval: 'Every minute' }],
    }
    const next = panelReducerFn(
      base as Parameters<typeof panelReducerFn>[0],
      { type: 'CLEAR_LOOPS' } as Parameters<typeof panelReducerFn>[1]
    )
    expect(next.activeLoops).toEqual([])
  })

  it('CLEAR_LOOPS(활성 루프 있음) → loopsStoppedNotice true', async () => {
    const { panelReducerFn } = await import('../../../02_Source/renderer/src/store/panelSession')
    const { makeInitialState } = await import('../../../02_Source/renderer/src/store/reducer')
    const base = {
      ...makeInitialState(),
      activeLoops: [{ id: 'cc1', summary: '매분 점검', interval: 'Every minute' }],
    }
    const next = panelReducerFn(
      base as Parameters<typeof panelReducerFn>[0],
      { type: 'CLEAR_LOOPS' } as Parameters<typeof panelReducerFn>[1]
    )
    expect(next.loopsStoppedNotice).toBe(true)
  })

  it('CLEAR_LOOPS(활성 루프 없음) → notice 안 켬', async () => {
    const { panelReducerFn } = await import('../../../02_Source/renderer/src/store/panelSession')
    const { makeInitialState } = await import('../../../02_Source/renderer/src/store/reducer')
    const next = panelReducerFn(
      makeInitialState() as Parameters<typeof panelReducerFn>[0],
      { type: 'CLEAR_LOOPS' } as Parameters<typeof panelReducerFn>[1]
    )
    expect(next.loopsStoppedNotice).toBe(false)
  })

  it('SET_RUN_ID(새 전송) → notice 해제', async () => {
    const { panelReducerFn } = await import('../../../02_Source/renderer/src/store/panelSession')
    const { makeInitialState } = await import('../../../02_Source/renderer/src/store/reducer')
    const base = { ...makeInitialState(), loopsStoppedNotice: true }
    const next = panelReducerFn(
      base as Parameters<typeof panelReducerFn>[0],
      { type: 'SET_RUN_ID', runId: 'p2' } as Parameters<typeof panelReducerFn>[1]
    )
    expect(next.loopsStoppedNotice).toBe(false)
  })

  it('DISMISS_LOOPS_STOPPED → notice 해제(✕ 닫기)', async () => {
    const { panelReducerFn } = await import('../../../02_Source/renderer/src/store/panelSession')
    const { makeInitialState } = await import('../../../02_Source/renderer/src/store/reducer')
    const base = { ...makeInitialState(), loopsStoppedNotice: true }
    const next = panelReducerFn(
      base as Parameters<typeof panelReducerFn>[0],
      { type: 'DISMISS_LOOPS_STOPPED' } as Parameters<typeof panelReducerFn>[1]
    )
    expect(next.loopsStoppedNotice).toBe(false)
  })
})
