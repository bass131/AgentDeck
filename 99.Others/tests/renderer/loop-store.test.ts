/**
 * loop-store.test.ts — appStore 앱 레벨 /loop 상태·액션 단위 (3단계).
 *
 * activeLoop + startLoop/tickLoop/stopLoop/dismissLoop + abort/clear 연동.
 * 정지 3경로(사용자/abort/가드)를 stopLoop 단일 액션으로 수렴(🔴#3).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore, selectActiveLoop } from '../../../02.Source/renderer/src/store/appStore'

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
  useAppStore.setState({ activeLoop: null, queue: [], currentRunId: null } as Parameters<typeof useAppStore.setState>[0])
}

describe('store loop — startLoop', () => {
  beforeEach(() => reset())

  it('activeLoop running + tickCount 0 + prompt/interval/picker 캡처', () => {
    const picker = { model: 'opus', effort: 'high', mode: 'auto' }
    useAppStore.getState().startLoop({ prompt: 'do X', intervalMs: 30_000, picker })
    const loop = useAppStore.getState().activeLoop
    expect(loop).toBeTruthy()
    expect(loop?.status).toBe('running')
    expect(loop?.prompt).toBe('do X')
    expect(loop?.intervalMs).toBe(30_000)
    expect(loop?.tickCount).toBe(0)
    expect(loop?.picker).toEqual(picker)
    expect(typeof loop?.startedAt).toBe('number')
    expect(loop?.startedAt).toBeGreaterThan(0)
  })

  it('picker 없이도 시작 가능 (self-pace)', () => {
    useAppStore.getState().startLoop({ prompt: 'keep going', intervalMs: 5_000 })
    expect(useAppStore.getState().activeLoop?.picker).toBeUndefined()
  })

  it('재시작 시 이전 루프 교체 + tickCount 리셋', () => {
    useAppStore.getState().startLoop({ prompt: 'A', intervalMs: 5_000 })
    useAppStore.getState().tickLoop()
    useAppStore.getState().startLoop({ prompt: 'B', intervalMs: 1_000 })
    const loop = useAppStore.getState().activeLoop
    expect(loop?.prompt).toBe('B')
    expect(loop?.tickCount).toBe(0)
  })
})

describe('store loop — tickLoop', () => {
  beforeEach(() => reset())

  it('tickCount 증가', () => {
    useAppStore.getState().startLoop({ prompt: 'X', intervalMs: 5_000 })
    useAppStore.getState().tickLoop()
    expect(useAppStore.getState().activeLoop?.tickCount).toBe(1)
    useAppStore.getState().tickLoop()
    expect(useAppStore.getState().activeLoop?.tickCount).toBe(2)
  })

  it('activeLoop 없으면 no-op (크래시 없음)', () => {
    useAppStore.getState().tickLoop()
    expect(useAppStore.getState().activeLoop).toBeNull()
  })
})

describe('store loop — stopLoop (정지 3경로 수렴)', () => {
  beforeEach(() => reset())

  it("'user' → activeLoop null (인디케이터 제거)", () => {
    useAppStore.getState().startLoop({ prompt: 'X', intervalMs: 5_000 })
    useAppStore.getState().stopLoop('user')
    expect(useAppStore.getState().activeLoop).toBeNull()
  })

  it("'abort' → activeLoop null", () => {
    useAppStore.getState().startLoop({ prompt: 'X', intervalMs: 5_000 })
    useAppStore.getState().stopLoop('abort')
    expect(useAppStore.getState().activeLoop).toBeNull()
  })

  it("'max-ticks' → status stopped + stopReason 유지 (상한 알림)", () => {
    useAppStore.getState().startLoop({ prompt: 'X', intervalMs: 5_000 })
    useAppStore.getState().stopLoop('max-ticks')
    const loop = useAppStore.getState().activeLoop
    expect(loop?.status).toBe('stopped')
    expect(loop?.stopReason).toBe('max-ticks')
  })

  it("'max-duration' → status stopped + stopReason 유지", () => {
    useAppStore.getState().startLoop({ prompt: 'X', intervalMs: 5_000 })
    useAppStore.getState().stopLoop('max-duration')
    const loop = useAppStore.getState().activeLoop
    expect(loop?.status).toBe('stopped')
    expect(loop?.stopReason).toBe('max-duration')
  })

  it('activeLoop 없으면 no-op', () => {
    useAppStore.getState().stopLoop('user')
    expect(useAppStore.getState().activeLoop).toBeNull()
  })
})

describe('store loop — dismissLoop', () => {
  beforeEach(() => reset())

  it('정지된(stopped) 인디케이터 닫기 → null', () => {
    useAppStore.getState().startLoop({ prompt: 'X', intervalMs: 5_000 })
    useAppStore.getState().stopLoop('max-ticks')
    expect(useAppStore.getState().activeLoop?.status).toBe('stopped')
    useAppStore.getState().dismissLoop()
    expect(useAppStore.getState().activeLoop).toBeNull()
  })
})

describe('store loop — abort/clear 연동 (🔴#3 잔류 방지)', () => {
  beforeEach(() => reset())

  it('abortRun → activeLoop도 해제 (타이머 부활 차단)', async () => {
    useAppStore.getState().startLoop({ prompt: 'X', intervalMs: 5_000 })
    useAppStore.setState({ currentRunId: 'r1' } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().abortRun()
    expect(useAppStore.getState().activeLoop).toBeNull()
  })

  it('clearConversation → activeLoop 리셋', () => {
    useAppStore.getState().startLoop({ prompt: 'X', intervalMs: 5_000 })
    useAppStore.getState().clearConversation()
    expect(useAppStore.getState().activeLoop).toBeNull()
  })

  // LR2-03 라이브 실측: main abort는 done 마킹 후 이벤트를 끊어(agent-runs.ts:193)
  // 백엔드 abortCleanup의 loops:[] 정리 이벤트가 renderer에 영원히 안 닿는다 →
  // SDK 크론 배너 잔존. main 상태는 실제로 정리되므로(cronTracker.clear) 표시를
  // renderer-local로 동기화한다. (main 이벤트 드롭 수리는 🔴 위험구역 — 아침 큐)
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

describe('store loop — selectActiveLoop 셀렉터', () => {
  beforeEach(() => reset())

  it('activeLoop 반환', () => {
    expect(selectActiveLoop(useAppStore.getState())).toBeNull()
    useAppStore.getState().startLoop({ prompt: 'X', intervalMs: 5_000 })
    expect(selectActiveLoop(useAppStore.getState())?.prompt).toBe('X')
  })
})

describe('panel loop — CLEAR_LOOPS (LR2-03, abort 시 SDK 크론 표시 정리)', () => {
  it('CLEAR_LOOPS → activeLoops [] (단일채팅 abortRun과 동형)', async () => {
    const { panelReducerFn } = await import('../../../02.Source/renderer/src/store/panelSession')
    const { makeInitialState } = await import('../../../02.Source/renderer/src/store/reducer')
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
})
