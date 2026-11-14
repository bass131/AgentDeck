// @vitest-environment jsdom
// M05 G9b — 대기열(C1·C2·E9)을 공용 실행 상태로 옮긴다. 단일 store와 패널 상태가 같은 reducer로
// 넣고 빼며, 중단(CLEAR_LOOPS)은 두 쪽 모두에서 대기열을 비운다(E9, 단일 규칙).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import type { AgentEventPayload } from '@shared/ipcContract'
import type { QueuedMessage } from '@renderer/00_App/state/types'

type Listener = (payload: AgentEventPayload) => void
const listeners: Listener[] = []

const mockApi = {
  onAgentEvent: vi.fn((cb: Listener) => {
    listeners.push(cb)
    return () => {
      const i = listeners.indexOf(cb)
      if (i >= 0) listeners.splice(i, 1)
    }
  }),
  agentRun: vi.fn(async () => ({ runId: 'run-q' })),
  agentAbort: vi.fn(async () => ({ accepted: true })),
  agentInterrupt: vi.fn(async () => ({ accepted: true })),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

const item = (id: string, text = id) => ({ id, text, images: [] })

beforeEach(async () => {
  vi.clearAllMocks()
  listeners.length = 0
  const { __resetPanelSessionManagerForTests } = await import('@renderer/03_Agent/state/panelSession')
  __resetPanelSessionManagerForTests()
})

afterEach(() => cleanup())

describe('runReducer — 대기열 액션', () => {
  it('ENQUEUE는 뒤에 붙이고, DEQUEUE는 앞에서 하나 빼고, REMOVE_QUEUED는 id로 지운다', async () => {
    const { runReducer } = await import('@renderer/03_Agent/state/runReducer')
    const { makePanelInitialState } = await import('@renderer/03_Agent/state/panelSession')
    let s = makePanelInitialState()
    expect(s.queue).toEqual([])
    // 복원 스냅숏으로 만든 패널 상태도 빈 대기열로 시작한다.
    expect(makePanelInitialState({ messages: [{ id: 'm', role: 'user', text: 'x' }], seq: 1 }).queue).toEqual([])
    s = runReducer(s, { type: 'ENQUEUE', item: item('a') })
    s = runReducer(s, { type: 'ENQUEUE', item: item('b') })
    s = runReducer(s, { type: 'ENQUEUE', item: item('c') })
    expect(s.queue.map((q) => q.id)).toEqual(['a', 'b', 'c'])
    s = runReducer(s, { type: 'DEQUEUE' })
    expect(s.queue.map((q) => q.id)).toEqual(['b', 'c'])
    s = runReducer(s, { type: 'REMOVE_QUEUED', id: 'c' })
    expect(s.queue.map((q) => q.id)).toEqual(['b'])
  })

  it('E9: CLEAR_LOOPS(중단)는 대기열을 비운다', async () => {
    const { runReducer } = await import('@renderer/03_Agent/state/runReducer')
    const { makePanelInitialState } = await import('@renderer/03_Agent/state/panelSession')
    const s = runReducer(
      runReducer(makePanelInitialState(), { type: 'ENQUEUE', item: item('a') }),
      { type: 'CLEAR_LOOPS' },
    )
    expect(s.queue).toEqual([])
  })
})

describe('단일 store — 같은 reducer', () => {
  it('enqueueMessage·dequeueMessage·removeQueued가 store 대기열을 다룬다', async () => {
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ queue: [] })
    const st = useAppStore.getState()
    st.enqueueMessage(item('a'))
    st.enqueueMessage(item('b'))
    expect(useAppStore.getState().dequeueMessage()?.id).toBe('a')
    useAppStore.getState().removeQueued('b')
    expect(useAppStore.getState().queue).toEqual([])
  })

  it('빈 대기열에서 dequeueMessage는 undefined이고 상태를 바꾸지 않는다', async () => {
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ queue: [] })
    const before = useAppStore.getState().queue
    expect(useAppStore.getState().dequeueMessage()).toBeUndefined()
    expect(useAppStore.getState().queue).toBe(before)
  })

  it('단일 어댑터(runtime.ts)에 CLEAR_LOOPS 대기열 특례가 남지 않는다', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../00_Source/renderer/src/03_Agent/state/runtime.ts'),
      'utf-8',
    )
    expect(src).not.toMatch(/CLEAR_LOOPS'\s*\?\s*\{\s*\.\.\.next,\s*queue/)
  })

  it('E9: 단일 중단은 대기열을 비운다(runtime 특례 없이 reducer가 처리)', async () => {
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ queue: [item('a')], currentRunId: 'run-s', isRunning: true, runGeneration: null })
    await act(async () => {
      await useAppStore.getState().abortRun()
    })
    expect(useAppStore.getState().queue).toEqual([])
  })
})

describe('useQueuedSend — 예약·드레인 공용 훅(C1)', () => {
  it('실행 중이면 예약하고, 실행이 끝나는 하강 에지에 맨 앞 하나를 보낸다', async () => {
    const { useQueuedSend } = await import('@renderer/05_Conversation/hooks/useQueuedSend')
    const queue: QueuedMessage[] = []
    const enqueue = vi.fn((q: QueuedMessage) => { queue.push(q) })
    const dequeue = vi.fn(() => queue.shift())
    const sendNow = vi.fn()
    const { result, rerender } = renderHook(
      ({ isRunning }: { isRunning: boolean }) =>
        useQueuedSend({ isRunning, queueLength: queue.length, enqueue, dequeue, sendNow }),
      { initialProps: { isRunning: true } },
    )
    act(() => result.current('다음 작업', []))
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(enqueue.mock.calls[0][0].text).toBe('다음 작업')
    expect(sendNow).not.toHaveBeenCalled()
    rerender({ isRunning: false })
    expect(dequeue).toHaveBeenCalledTimes(1)
    expect(sendNow).toHaveBeenCalledWith('다음 작업', [], undefined)
  })

  it('대기열이 비면 하강 에지에서 아무것도 보내지 않는다', async () => {
    const { useQueuedSend } = await import('@renderer/05_Conversation/hooks/useQueuedSend')
    const dequeue = vi.fn(() => undefined)
    const sendNow = vi.fn()
    const { rerender } = renderHook(
      ({ isRunning }: { isRunning: boolean }) =>
        useQueuedSend({ isRunning, queueLength: 0, enqueue: vi.fn(), dequeue, sendNow }),
      { initialProps: { isRunning: true } },
    )
    rerender({ isRunning: false })
    expect(dequeue).not.toHaveBeenCalled()
    expect(sendNow).not.toHaveBeenCalled()
  })

  it('실행 중이 아니면 바로 보낸다', async () => {
    const { useQueuedSend } = await import('@renderer/05_Conversation/hooks/useQueuedSend')
    const sendNow = vi.fn()
    const enqueue = vi.fn()
    const { result } = renderHook(() =>
      useQueuedSend({ isRunning: false, queueLength: 0, enqueue, dequeue: () => undefined, sendNow }),
    )
    act(() => result.current('지금', []))
    expect(sendNow).toHaveBeenCalledWith('지금', [], undefined)
    expect(enqueue).not.toHaveBeenCalled()
  })
})

describe('패널 — usePanelSlot이 대기열을 노출한다', () => {
  it('enqueue·dequeue·removeQueued가 패널 상태 대기열을 다룬다', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-q', 0))
    act(() => {
      result.current.enqueue(item('a'))
      result.current.enqueue(item('b'))
      result.current.enqueue(item('c'))
    })
    expect(result.current.state.queue.map((q) => q.id)).toEqual(['a', 'b', 'c'])
    let first: { id: string } | undefined
    act(() => {
      first = result.current.dequeue()
    })
    expect(first?.id).toBe('a')
    act(() => result.current.removeQueued('c'))
    expect(result.current.state.queue.map((q) => q.id)).toEqual(['b'])
  })

  it('패널마다 대기열이 따로다(슬롯 키 격리)', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const a = renderHook(() => usePanelSlot('sess-iso', 0))
    const b = renderHook(() => usePanelSlot('sess-iso', 1))
    act(() => a.result.current.enqueue(item('only-a')))
    expect(a.result.current.state.queue.length).toBe(1)
    expect(b.result.current.state.queue.length).toBe(0)
    let none: unknown = 'x'
    act(() => { none = b.result.current.dequeue() })
    expect(none).toBeUndefined()
  })

  it('E9: 패널 중단은 패널 대기열을 비운다', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-q9', 0))
    await act(async () => {
      await result.current.send('작업')
    })
    expect(result.current.state.isRunning).toBe(true)
    act(() => result.current.enqueue(item('next')))
    await act(async () => {
      await result.current.abort()
    })
    expect(result.current.state.queue).toEqual([])
    expect(mockApi.agentAbort).toHaveBeenCalledWith({ runId: 'run-q' })
  })
})
