// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentEventPayload } from '../../../02_Source/shared/ipcContract'

describe('LR1 Phase03 갈래A — session 이벤트 즉시 저장', () => {
  const mockConversationSave = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockConversationSave.mockResolvedValue({ id: 'cv-1' })
    Object.defineProperty(globalThis, 'window', {
      value: {
        api: {
          workspaceTree: vi.fn().mockResolvedValue({ tree: null }),
          workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
          conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
          conversationSave: mockConversationSave,
          agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
          agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
          onAgentEvent: vi.fn().mockReturnValue(vi.fn()),
          listFiles: vi.fn().mockResolvedValue({ files: [] }),
        },
      },
      writable: true,
      configurable: true,
    })
  })

  it('session 이벤트 수신 즉시 conversationSave IPC가 호출된다 (done 대기 없이)', async () => {
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')

    useAppStore.setState({
      thread: [{ kind: 'msg', id: 'm-1', role: 'user', text: '테스트 메시지' }],
      messages: [{ id: 'm-1', role: 'user', content: '테스트 메시지' }],
      isRunning: true,
      currentRunId: 'r1',
    } as Parameters<typeof useAppStore.setState>[0])

    let capturedCallback: ((payload: AgentEventPayload) => void) | null = null
    ;(window.api as Record<string, unknown>).onAgentEvent = (
      cb: (payload: AgentEventPayload) => void
    ) => {
      capturedCallback = cb
      return () => {}
    }

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    const sessionPayload: AgentEventPayload = {
      runId: 'r1',
      event: { type: 'session', sessionId: 'sess-abc' },
    }
    capturedCallback!(sessionPayload)

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(mockConversationSave).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('session 이벤트로 저장된 conversation.sessionId가 이벤트의 sessionId와 일치한다', async () => {
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')

    useAppStore.setState({
      thread: [{ kind: 'msg', id: 'm-1', role: 'user', text: '테스트 메시지' }],
      messages: [{ id: 'm-1', role: 'user', content: '테스트 메시지' }],
      isRunning: true,
      currentRunId: 'r1',
    } as Parameters<typeof useAppStore.setState>[0])

    let capturedCallback: ((payload: AgentEventPayload) => void) | null = null
    ;(window.api as Record<string, unknown>).onAgentEvent = (
      cb: (payload: AgentEventPayload) => void
    ) => {
      capturedCallback = cb
      return () => {}
    }

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    capturedCallback!({
      runId: 'r1',
      event: { type: 'session', sessionId: 'sess-xyz' },
    })

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(mockConversationSave).toHaveBeenCalledTimes(1)
    const callArg = mockConversationSave.mock.calls[0][0] as { conversation: { sessionId?: string } }
    expect(callArg.conversation.sessionId).toBe('sess-xyz')
    unsubscribe()
  })
})
