// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentEventPayload } from '@shared/ipcContract'
import { sessionRegistry } from '@renderer/03_Agent/state/sessionRegistry'
import { convKey, panelKey } from '@renderer/03_Agent/state/sessionKeys'

// G9c — 세션 레지스트리 한 벌: 키별 상태 Map, runId 라우팅, 루프 표시, stale 타이머, 이벤트 구독.

const entry = (isRunning: boolean, currentRunId: string | null = null) => ({ isRunning, currentRunId })

function installApi(): { onAgentEvent: ReturnType<typeof vi.fn>; unsub: ReturnType<typeof vi.fn>; emit: (p: AgentEventPayload) => void } {
  const unsub = vi.fn()
  let handler: ((p: AgentEventPayload) => void) | null = null
  const onAgentEvent = vi.fn((cb: (p: AgentEventPayload) => void) => { handler = cb; return unsub })
  Object.defineProperty(window, 'api', { value: { onAgentEvent }, writable: true, configurable: true })
  return { onAgentEvent, unsub, emit: (p) => handler?.(p) }
}

beforeEach(() => {
  sessionRegistry.__resetKindForTests('conv')
  sessionRegistry.__resetKindForTests('panel')
})

describe('G9c 레지스트리 — 키별 상태 Map', () => {
  it('종류별 항목을 삽입 순서대로 돌려주고 다른 종류는 섞지 않는다', () => {
    sessionRegistry.set(panelKey('s', 1), entry(false))
    sessionRegistry.set(convKey('b'), entry(false))
    sessionRegistry.set(convKey('a'), entry(true))
    sessionRegistry.set(panelKey('s', 0), entry(false))
    expect(sessionRegistry.entries('conv').map(([k]) => k)).toEqual([convKey('b'), convKey('a')])
    expect(sessionRegistry.entries('panel').map(([k]) => k)).toEqual([panelKey('s', 1), panelKey('s', 0)])
    expect(sessionRegistry.size('conv')).toBe(2)
  })

  it('forget은 상태·라우팅을 지우고 그 키의 생애를 올린다(Backlog 46의 폐기 판정)', () => {
    const k = panelKey('s', 0)
    sessionRegistry.set(k, entry(true, 'r1'))
    sessionRegistry.route('r1', k)
    const before = sessionRegistry.life(k)
    sessionRegistry.forget(k)
    expect(sessionRegistry.has(k)).toBe(false)
    expect(sessionRegistry.lookup('r1')).toBeUndefined()
    expect(sessionRegistry.life(k)).toBe(before + 1)
  })

  it('실행 중 키 집합은 바뀔 때만 새 값이 되고 구독자에게 알린다', () => {
    const listener = vi.fn()
    const off = sessionRegistry.subscribe(listener)
    const k = convKey('a')
    sessionRegistry.set(k, entry(false))
    expect(listener).not.toHaveBeenCalled()
    const snap0 = sessionRegistry.runningKeys()
    sessionRegistry.set(k, entry(true))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(sessionRegistry.runningKeys()).not.toBe(snap0)
    expect(sessionRegistry.runningKeys().has(k)).toBe(true)
    const snap1 = sessionRegistry.runningKeys()
    sessionRegistry.set(k, entry(true, 'r'))
    expect(sessionRegistry.runningKeys()).toBe(snap1)
    sessionRegistry.delete(k)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(sessionRegistry.isRunning(k)).toBe(false)
    off()
  })
})

describe('G9c 레지스트리 — 루프 표시·stale 타이머 한 벌', () => {
  it('루프 표시는 키 하나의 레지스트리이고 종류별로 세고 비운다', () => {
    const snap = { activeLoops: [], loopsStoppedNotice: true }
    sessionRegistry.loopDisplay.sync(convKey('a'), snap)
    sessionRegistry.loopDisplay.sync(panelKey('s', 0), snap)
    expect(sessionRegistry.__loopDisplayCountForTests('conv')).toBe(1)
    expect(sessionRegistry.__loopDisplayCountForTests('panel')).toBe(1)
    sessionRegistry.__resetKindForTests('panel')
    expect(sessionRegistry.loopDisplay.read(convKey('a'))).toBeDefined()
    expect(sessionRegistry.loopDisplay.read(panelKey('s', 0))).toBeUndefined()
  })

  it('stale 만료는 키의 종류 정책으로 가고, 종류 리셋은 그 종류의 타이머만 끈다', () => {
    vi.useFakeTimers()
    try {
      const convStale = vi.fn()
      const panelStale = vi.fn()
      sessionRegistry.defineKind('conv', { markStale: convStale, handleEvent: () => {} })
      sessionRegistry.defineKind('panel', { markStale: panelStale, handleEvent: () => {} })
      const now = Date.now()
      const goal = { goalRun: { detail: null, turns: 1, startedAt: now }, lastActivityAt: now, bannerStale: false }
      sessionRegistry.refreshStale(convKey('a'), goal as never)
      sessionRegistry.refreshStale(panelKey('s', 0), goal as never)
      sessionRegistry.__resetKindForTests('panel')
      vi.advanceTimersByTime(5 * 60 * 1000 + 10)
      expect(convStale).toHaveBeenCalledWith(convKey('a'))
      expect(panelStale).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('G9c 레지스트리 — runId 라우팅 한 벌', () => {
  it('unrouteKey는 그 키로 가는 라우팅만 지우고 exceptRunId는 남긴다', () => {
    sessionRegistry.route('r1', convKey('a'))
    sessionRegistry.route('r2', convKey('a'))
    sessionRegistry.route('r3', panelKey('s', 0))
    sessionRegistry.unrouteKey(convKey('a'), 'r2')
    expect(sessionRegistry.lookup('r1')).toBeUndefined()
    expect(sessionRegistry.lookup('r2')).toBe(convKey('a'))
    expect(sessionRegistry.lookup('r3')).toBe(panelKey('s', 0))
    expect(sessionRegistry.__routeCountForTests('conv')).toBe(1)
    expect(sessionRegistry.__routeCountForTests('panel')).toBe(1)
  })
})

describe('G9c 레지스트리 — 패널 어댑터는 레지스트리의 얇은 보기다', () => {
  it('패널 상태·라우팅·루프 표시가 레지스트리에 산다', async () => {
    const api = installApi()
    const runApi = window.api as unknown as Record<string, unknown>
    runApi.agentRun = vi.fn().mockResolvedValue({ runId: 'run-p' })
    const { renderHook, act } = await import('@testing-library/react')
    const panel = await import('@renderer/03_Agent/state/panelSession')
    panel.__resetPanelSessionManagerForTests()
    const { result } = renderHook(() => panel.usePanelSlot('s', 0))
    await act(async () => { await result.current.send('hi') })
    const key = panelKey('s', 0)
    expect(sessionRegistry.get(key)?.currentRunId).toBe('run-p')
    expect(sessionRegistry.lookup('run-p')).toBe(key)
    expect(panel.__getPanelManagerSizesForTests().runIds).toBe(1)
    act(() => {
      api.emit({ runId: 'run-p', event: { type: 'loops', loops: [{ id: 'l', kind: 'loop', prompt: 'p', intervalSec: 60 }] } } as unknown as AgentEventPayload)
    })
    expect(sessionRegistry.loopDisplay.read(key)?.activeLoops).toHaveLength(1)
    panel.__resetPanelSessionManagerForTests()
    expect(sessionRegistry.has(key)).toBe(false)
    expect(sessionRegistry.__holdersForTests('panel')).toBe(0)
  })

  it('패널 몫이 이미 있어도 window.api가 바뀌면 새 api에 다시 붙는다(테스트 mock 교체 위험)', async () => {
    const a = installApi()
    const { renderHook } = await import('@testing-library/react')
    const panel = await import('@renderer/03_Agent/state/panelSession')
    panel.__resetPanelSessionManagerForTests()
    renderHook(() => panel.usePanelSlot('s', 0))
    expect(a.onAgentEvent).toHaveBeenCalledTimes(1)
    const b = installApi()
    renderHook(() => panel.usePanelSlot('s', 1))
    expect(b.onAgentEvent).toHaveBeenCalledTimes(1)
    expect(sessionRegistry.__holdersForTests('panel')).toBe(1)
    panel.__resetPanelSessionManagerForTests()
  })
})

describe('G9c 레지스트리 — 대화 어댑터(loopDisplay·runtime)도 같은 한 벌을 쓴다', () => {
  it('대화 라우팅과 루프 표시는 레지스트리 키 convKey(id)로 산다', async () => {
    const ld = await import('@renderer/03_Agent/state/loopDisplay')
    ld.__resetSessionLoopDisplayForTests()
    ld.registerConversationRun('r1', 'A')
    expect(sessionRegistry.lookup('r1')).toBe(convKey('A'))
    expect(ld.lookupConversationForRun('r1')).toBe('A')
    ld.sessionLoopDisplayRegistry.sync('A', { activeLoops: [], loopsStoppedNotice: true })
    expect(sessionRegistry.loopDisplay.read(convKey('A'))?.loopsStoppedNotice).toBe(true)
    expect(ld.__getSessionLoopDisplaySizeForTests()).toBe(1)
    expect(ld.__getSessionRunRoutingSizeForTests()).toBe(1)
  })

  it('대화 쪽 라우팅 해제는 패널 라우팅을 건드리지 않는다', async () => {
    const ld = await import('@renderer/03_Agent/state/loopDisplay')
    sessionRegistry.route('rp', panelKey('s', 0))
    ld.unregisterConversationRun('rp')
    expect(ld.lookupConversationForRun('rp')).toBeUndefined()
    expect(sessionRegistry.lookup('rp')).toBe(panelKey('s', 0))
    ld.__resetSessionLoopDisplayForTests()
    expect(sessionRegistry.lookup('rp')).toBe(panelKey('s', 0))
  })

  it('활성 대화 키의 실행 여부는 전경 저장 칸(store 평탄화 필드)에서 읽는다(안 A)', async () => {
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ conversationId: 'act', isRunning: true })
    expect(sessionRegistry.isRunning(convKey('act'))).toBe(true)
    expect(sessionRegistry.isRunning(convKey('other'))).toBe(false)
    useAppStore.setState({ conversationId: null, isRunning: false })
    expect(sessionRegistry.isRunning(convKey('act'))).toBe(false)
  })

  it('전경 대화의 stale 타이머는 레지스트리의 대화 정책으로 만료되어 store 배너를 stale로 만든다', async () => {
    vi.useFakeTimers()
    try {
      const { useAppStore } = await import('@renderer/00_App/appStore')
      const now = Date.now()
      useAppStore.setState({
        conversationId: 'g', goalRun: { detail: null, turns: 1, startedAt: now }, lastActivityAt: now, bannerStale: false,
      })
      useAppStore.getState().refreshStaleWatchdog()
      vi.advanceTimersByTime(5 * 60 * 1000 + 10)
      expect(useAppStore.getState().bannerStale).toBe(true)
      useAppStore.setState({ conversationId: null, goalRun: null, lastActivityAt: null, bannerStale: false })
      useAppStore.getState().refreshStaleWatchdog()
    } finally {
      vi.useRealTimers()
    }
  })

  it('배경 대화(옛 bgRuns)는 레지스트리의 convKey(id) 항목이고 store에는 bgRuns 필드가 없다', async () => {
    installApi()
    const runApi = window.api as unknown as Record<string, unknown>
    runApi.conversationLoad = vi.fn().mockResolvedValue({ conversations: [] })
    const { useAppStore } = await import('@renderer/00_App/appStore')
    const bg = await import('@renderer/03_Agent/state/backgroundRuns')
    bg.__resetBackgroundRunsForTests()
    useAppStore.setState({ conversationId: 'left', currentRunId: 'r-left', isRunning: true })
    await useAppStore.getState().selectConversation('next')
    expect(sessionRegistry.get(convKey('left'))?.currentRunId).toBe('r-left')
    expect(bg.__backgroundRunIdsForTests()).toEqual(['left'])
    expect('bgRuns' in useAppStore.getState()).toBe(false)
    useAppStore.setState({ conversationId: null, currentRunId: null, isRunning: false })
    bg.__resetBackgroundRunsForTests()
  })

  it('subscribeAgentEvents는 대화 몫을 잡고, 놓으면 그 몫만 놓는다', async () => {
    const api = installApi()
    const { useAppStore } = await import('@renderer/00_App/appStore')
    const release = useAppStore.getState().subscribeAgentEvents()
    expect(sessionRegistry.__holdersForTests('conv')).toBe(1)
    expect(api.onAgentEvent).toHaveBeenCalledTimes(1)
    release()
    expect(sessionRegistry.__holdersForTests('conv')).toBe(0)
    expect(api.unsub).toHaveBeenCalledTimes(1)
  })
})

describe('G9c 레지스트리 — 이벤트 구독 한 벌', () => {
  it('종류마다 몫을 세고 실제 구독은 하나다. 마지막 몫이 놓일 때만 해제한다', () => {
    const api = installApi()
    const relPanel = sessionRegistry.acquireEvents('panel', { rebind: false })
    const relPanel2 = sessionRegistry.acquireEvents('panel', { rebind: false })
    expect(api.onAgentEvent).toHaveBeenCalledTimes(1)
    relPanel()
    relPanel()
    expect(api.unsub).not.toHaveBeenCalled()
    relPanel2()
    expect(api.unsub).toHaveBeenCalledTimes(1)
  })

  it('rebind 몫은 지금의 window.api로 다시 붙고, 함수가 바뀌면 rebind 없이도 다시 붙는다', () => {
    const a = installApi()
    const r1 = sessionRegistry.acquireEvents('panel', { rebind: false })
    const r2 = sessionRegistry.acquireEvents('conv', { rebind: true })
    expect(a.onAgentEvent).toHaveBeenCalledTimes(2)
    expect(a.unsub).toHaveBeenCalledTimes(1)
    const b = installApi()
    const r3 = sessionRegistry.acquireEvents('panel', { rebind: false })
    expect(b.onAgentEvent).toHaveBeenCalledTimes(1)
    r1(); r2(); r3()
    expect(b.unsub).toHaveBeenCalledTimes(1)
  })

  it('몫을 가진 종류의 정책만 이벤트를 받는다(종류별 독립 구독이던 옛 동작)', () => {
    const api = installApi()
    const conv = vi.fn()
    const panel = vi.fn()
    sessionRegistry.defineKind('conv', { markStale: () => {}, handleEvent: conv })
    sessionRegistry.defineKind('panel', { markStale: () => {}, handleEvent: panel })
    const rel = sessionRegistry.acquireEvents('panel', { rebind: false })
    const payload = { runId: 'x', event: { type: 'done' } } as unknown as AgentEventPayload
    api.emit(payload)
    expect(panel).toHaveBeenCalledWith(payload)
    expect(conv).not.toHaveBeenCalled()
    rel()
  })
})
