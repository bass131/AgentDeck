// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import type { ThreadItem } from '@renderer/05_Conversation/state/threadTypes'
import type { PanelSessionState } from '@renderer/03_Agent/state/panelSession'

let capturedEventCallback: ((payload: unknown) => void) | null = null
const mockUnsub = vi.fn()

const mockApi = {
  agentRun: vi.fn().mockResolvedValue({ runId: 'run-panel-1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockImplementation((cb: (payload: unknown) => void) => {
    capturedEventCallback = cb
    return mockUnsub
  }),
}

Object.defineProperty(window, 'api', {
  value: mockApi,
  writable: true,
  configurable: true,
})

beforeEach(async () => {
  // 패널 매니저는 모듈 수준 상태·구독을 갖는다 — 매번 비워야 새 구독이 capturedEventCallback을 다시 잡는다
  const { __resetPanelSessionManagerForTests } = await import('@renderer/03_Agent/state/panelSession')
  __resetPanelSessionManagerForTests()
  vi.clearAllMocks()
  capturedEventCallback = null
  mockApi.agentRun.mockResolvedValue({ runId: 'run-panel-1' })
  mockApi.onAgentEvent.mockImplementation((cb: (payload: unknown) => void) => {
    capturedEventCallback = cb
    return mockUnsub
  })
})

afterEach(() => {
  cleanup()
})

function emitEvent(runId: string, event: Record<string, unknown>) {
  if (capturedEventCallback) {
    capturedEventCallback({ runId, event })
  }
}

function lastAssistantText(state: PanelSessionState): string {
  const msgs = state.thread
    .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> =>
      item.kind === 'msg' && item.role === 'assistant'
    )
  return msgs[msgs.length - 1]?.text ?? ''
}

function userMsgs(state: PanelSessionState) {
  return state.thread.filter(
    (item): item is Extract<ThreadItem, { kind: 'msg' }> =>
      item.kind === 'msg' && item.role === 'user'
  )
}

describe('usePanelSlot — (a) send() → agentRun + currentRunId 설정', () => {
  it('send(text) → window.api.agentRun 호출', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-ps', 0))

    await act(async () => {
      await result.current.send('안녕하세요')
    })

    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)
  })

  it('send(text) → agentRun 첫 인자에 messages 배열 포함', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-ps', 0))

    await act(async () => {
      await result.current.send('테스트 메시지')
    })

    const callArg = mockApi.agentRun.mock.calls[0][0]
    expect(Array.isArray(callArg.messages)).toBe(true)
    expect(callArg.messages[callArg.messages.length - 1].role).toBe('user')
    expect(callArg.messages[callArg.messages.length - 1].content).toBe('테스트 메시지')
  })

  it('send(text) 후 currentRunId가 agentRun 반환 runId로 설정됨', async () => {
    mockApi.agentRun.mockResolvedValue({ runId: 'r-abc' })
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-ps', 0))

    await act(async () => {
      await result.current.send('hello')
    })

    expect(result.current.state.currentRunId).toBe('r-abc')
  })

  it('send(text) → thread에 user 메시지 추가', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-ps', 0))

    await act(async () => {
      await result.current.send('사용자 입력')
    })

    const uMsgs = userMsgs(result.current.state)
    expect(uMsgs.some((m) => m.text === '사용자 입력')).toBe(true)
  })

  it('send(text, opts) → workspaceRoot가 agentRun 인자에 포함됨', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-ps', 0))

    await act(async () => {
      await result.current.send('msg', { workspaceRoot: '/my/workspace' })
    })

    const callArg = mockApi.agentRun.mock.calls[0][0]
    expect(callArg.workspaceRoot).toBe('/my/workspace')
  })

  it('send(text, opts) → picker model/effort/mode가 agentRun 인자에 포함됨', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-ps', 0))

    await act(async () => {
      await result.current.send('msg', { picker: { model: 'sonnet', effort: 'high', mode: 'auto' } })
    })

    const callArg = mockApi.agentRun.mock.calls[0][0]
    expect(callArg.model).toBe('sonnet')
    expect(callArg.effort).toBe('high')
    expect(callArg.mode).toBe('auto')
  })
})

describe('usePanelSlot — (b) 자기 runId 이벤트 → thread 반영', () => {
  it('자기 runId text 이벤트 → thread에 assistant msg 누적', async () => {
    mockApi.agentRun.mockResolvedValue({ runId: 'my-run' })
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-ps', 0))

    await act(async () => {
      await result.current.send('start')
    })

    act(() => {
      emitEvent('my-run', { type: 'text', delta: 'hello' })
    })

    expect(lastAssistantText(result.current.state)).toBe('hello')
  })

  it('자기 runId text 이벤트 2회 → thread assistant msg에 연속 누적', async () => {
    mockApi.agentRun.mockResolvedValue({ runId: 'my-run-2' })
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-ps', 0))

    await act(async () => {
      await result.current.send('start')
    })

    act(() => {
      emitEvent('my-run-2', { type: 'text', delta: 'foo' })
    })
    act(() => {
      emitEvent('my-run-2', { type: 'text', delta: 'bar' })
    })

    expect(lastAssistantText(result.current.state)).toBe('foobar')
  })

  it('done 이벤트 → thread의 assistant msg 보존 + isRunning false', async () => {
    mockApi.agentRun.mockResolvedValue({ runId: 'done-run' })
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-ps', 0))

    await act(async () => {
      await result.current.send('start')
    })

    act(() => {
      emitEvent('done-run', { type: 'text', delta: 'reply text' })
    })

    act(() => {
      emitEvent('done-run', { type: 'done' })
    })

    expect(lastAssistantText(result.current.state)).toBe('reply text')
    expect(result.current.state.isRunning).toBe(false)
    expect(result.current.state.openMsgId).toBeNull()
    expect(result.current.state.openGroupId).toBeNull()
  })
})

describe('usePanelSlot — (c) 타 runId 이벤트 → thread 미반영 (타 패널 무시)', () => {
  it('타 runId text 이벤트 → thread에 assistant msg 미추가', async () => {
    mockApi.agentRun.mockResolvedValue({ runId: 'panel-A' })
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-ps', 0))

    await act(async () => {
      await result.current.send('start')
    })

    act(() => {
      emitEvent('panel-B', { type: 'text', delta: 'should be ignored' })
    })

    expect(lastAssistantText(result.current.state)).toBe('')
  })

  it('타 runId done 이벤트 → 자기 패널 thread의 assistant msg 보존됨', async () => {
    mockApi.agentRun.mockResolvedValue({ runId: 'panel-X' })
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-ps', 0))

    await act(async () => {
      await result.current.send('start')
    })

    act(() => {
      emitEvent('panel-X', { type: 'text', delta: 'my text' })
    })

    act(() => {
      emitEvent('other-run', { type: 'done' })
    })

    expect(lastAssistantText(result.current.state)).toBe('my text')
  })
})

describe('usePanelSlot — (d) abort() → agentAbort(runId) 호출', () => {
  it('abort() → window.api.agentAbort({runId}) 호출', async () => {
    mockApi.agentRun.mockResolvedValue({ runId: 'abort-run' })
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-ps', 0))

    await act(async () => {
      await result.current.send('start')
    })

    await act(async () => {
      await result.current.abort()
    })

    expect(mockApi.agentAbort).toHaveBeenCalledWith({ runId: 'abort-run' })
  })

  it('abort() — currentRunId null 상태에서 호출해도 에러 없음 (no-op)', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-ps', 0))

    await act(async () => {
      await result.current.abort()
    })

    expect(mockApi.agentAbort).not.toHaveBeenCalled()
  })
})

describe('usePanelSlot — (f) 전역 appStore와 독립', () => {
  it('send/이벤트 수신이 appStore를 import하지 않아도 동작 (의존성 격리)', async () => {
    mockApi.agentRun.mockResolvedValue({ runId: 'iso-run' })
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')

    const { result: r1 } = renderHook(() => usePanelSlot('sess-ps', 0))
    const { result: r2 } = renderHook(() => usePanelSlot('sess-ps', 1))

    await act(async () => {
      await r1.current.send('panel-1 message')
    })

    expect(userMsgs(r2.current.state)).toHaveLength(0)
  })
})
