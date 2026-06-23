// @vitest-environment jsdom
/**
 * panel-session.test.tsx — usePanelSession 훅 통합 테스트 (TDD-first, jsdom).
 *
 * 검증 범위:
 *   (a) send() → window.api.agentRun 호출 + currentRunId 설정
 *   (b) 자기 runId 이벤트 → state 반영 (streamingText 누적)
 *   (c) 타 runId 이벤트 → state 미반영 (타 패널 무시)
 *   (d) abort() → window.api.agentAbort(runId) 호출
 *   (e) unmount 시 onAgentEvent 구독 해제
 *   (f) 전역 appStore와 독립 (panelSession은 appStore를 건드리지 않음)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'

// ── window.api mock ───────────────────────────────────────────────────────────

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

beforeEach(() => {
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

// ── emit 헬퍼 ─────────────────────────────────────────────────────────────────

function emitEvent(runId: string, event: Record<string, unknown>) {
  if (capturedEventCallback) {
    capturedEventCallback({ runId, event })
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('usePanelSession — (a) send() → agentRun + currentRunId 설정', () => {
  it('send(text) → window.api.agentRun 호출', async () => {
    const { usePanelSession } = await import('../../src/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.send('안녕하세요')
    })

    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)
  })

  it('send(text) → agentRun 첫 인자에 messages 배열 포함', async () => {
    const { usePanelSession } = await import('../../src/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

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
    const { usePanelSession } = await import('../../src/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.send('hello')
    })

    expect(result.current.state.currentRunId).toBe('r-abc')
  })

  it('send(text) → messages에 user 메시지 추가', async () => {
    const { usePanelSession } = await import('../../src/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.send('사용자 입력')
    })

    expect(result.current.state.messages.some((m) => m.role === 'user' && m.content === '사용자 입력')).toBe(true)
  })

  it('send(text, opts) → workspaceRoot가 agentRun 인자에 포함됨', async () => {
    const { usePanelSession } = await import('../../src/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.send('msg', { workspaceRoot: '/my/workspace' })
    })

    const callArg = mockApi.agentRun.mock.calls[0][0]
    expect(callArg.workspaceRoot).toBe('/my/workspace')
  })

  it('send(text, opts) → picker model/effort/mode가 agentRun 인자에 포함됨', async () => {
    const { usePanelSession } = await import('../../src/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.send('msg', { picker: { model: 'sonnet', effort: 'high', mode: 'auto' } })
    })

    const callArg = mockApi.agentRun.mock.calls[0][0]
    expect(callArg.model).toBe('sonnet')
    expect(callArg.effort).toBe('high')
    expect(callArg.mode).toBe('auto')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('usePanelSession — (b) 자기 runId 이벤트 → state 반영', () => {
  it('자기 runId text 이벤트 → streamingText 누적', async () => {
    mockApi.agentRun.mockResolvedValue({ runId: 'my-run' })
    const { usePanelSession } = await import('../../src/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.send('start')
    })

    act(() => {
      emitEvent('my-run', { type: 'text', delta: 'hello' })
    })

    expect(result.current.state.streamingText).toBe('hello')
  })

  it('자기 runId text 이벤트 2회 → streamingText 연속 누적', async () => {
    mockApi.agentRun.mockResolvedValue({ runId: 'my-run-2' })
    const { usePanelSession } = await import('../../src/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.send('start')
    })

    act(() => {
      emitEvent('my-run-2', { type: 'text', delta: 'foo' })
    })
    act(() => {
      emitEvent('my-run-2', { type: 'text', delta: 'bar' })
    })

    expect(result.current.state.streamingText).toBe('foobar')
  })

  it('done 이벤트 → messages에 assistant 확정 + streamingText 리셋', async () => {
    mockApi.agentRun.mockResolvedValue({ runId: 'done-run' })
    const { usePanelSession } = await import('../../src/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.send('start')
    })

    act(() => {
      emitEvent('done-run', { type: 'text', delta: 'reply text' })
    })

    act(() => {
      emitEvent('done-run', { type: 'done' })
    })

    expect(result.current.state.streamingText).toBe('')
    expect(result.current.state.messages.some((m) => m.role === 'assistant' && m.content === 'reply text')).toBe(true)
    expect(result.current.state.isRunning).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('usePanelSession — (c) 타 runId 이벤트 → state 미반영 (타 패널 무시)', () => {
  it('타 runId text 이벤트 → streamingText 미변경', async () => {
    mockApi.agentRun.mockResolvedValue({ runId: 'panel-A' })
    const { usePanelSession } = await import('../../src/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.send('start')
    })

    act(() => {
      emitEvent('panel-B', { type: 'text', delta: 'should be ignored' })
    })

    expect(result.current.state.streamingText).toBe('')
  })

  it('타 runId done 이벤트 → messages 미추가', async () => {
    mockApi.agentRun.mockResolvedValue({ runId: 'panel-X' })
    const { usePanelSession } = await import('../../src/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.send('start')
    })

    // 자기 run text 이벤트
    act(() => {
      emitEvent('panel-X', { type: 'text', delta: 'my text' })
    })

    // 타 run done 이벤트: messages 확정하면 안 됨
    act(() => {
      emitEvent('other-run', { type: 'done' })
    })

    // streamingText 아직 남아 있어야 함
    expect(result.current.state.streamingText).toBe('my text')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('usePanelSession — (d) abort() → agentAbort(runId) 호출', () => {
  it('abort() → window.api.agentAbort({runId}) 호출', async () => {
    mockApi.agentRun.mockResolvedValue({ runId: 'abort-run' })
    const { usePanelSession } = await import('../../src/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.send('start')
    })

    await act(async () => {
      await result.current.abort()
    })

    expect(mockApi.agentAbort).toHaveBeenCalledWith({ runId: 'abort-run' })
  })

  it('abort() — currentRunId null 상태에서 호출해도 에러 없음 (no-op)', async () => {
    const { usePanelSession } = await import('../../src/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    // currentRunId = null (미실행 상태)
    await act(async () => {
      await result.current.abort()
    })

    expect(mockApi.agentAbort).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('usePanelSession — (e) unmount 시 구독 해제', () => {
  it('mount 시 onAgentEvent 구독 등록, unmount 시 반환된 unsubscribe 호출', async () => {
    const { usePanelSession } = await import('../../src/renderer/src/store/panelSession')
    const { unmount } = renderHook(() => usePanelSession())

    expect(mockApi.onAgentEvent).toHaveBeenCalledTimes(1)

    unmount()

    expect(mockUnsub).toHaveBeenCalledTimes(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('usePanelSession — (f) 전역 appStore와 독립', () => {
  it('send/이벤트 수신이 appStore를 import하지 않아도 동작 (의존성 격리)', async () => {
    // usePanelSession은 appStore를 직접 참조하지 않는다.
    // 이 테스트는 훅이 자체 로컬 상태를 갖는지 확인한다.
    mockApi.agentRun.mockResolvedValue({ runId: 'iso-run' })
    const { usePanelSession } = await import('../../src/renderer/src/store/panelSession')

    const { result: r1 } = renderHook(() => usePanelSession())
    const { result: r2 } = renderHook(() => usePanelSession())

    // 두 훅 인스턴스는 독립적인 state를 가진다
    await act(async () => {
      await r1.current.send('panel-1 message')
    })

    // r2는 r1의 메시지를 받지 않음 (독립 상태)
    expect(r2.current.state.messages.filter((m) => m.role === 'user')).toHaveLength(0)
  })
})
