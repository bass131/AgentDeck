/**
 * lr1-phase03-session-save.test.ts — LR1 Phase 03 갈래 A: session 이벤트 즉시 저장 TDD (RED)
 *
 * 계약(01.Phases/LR1-loop-resume/03-resume-robustness.md 갈래 A):
 *   subscribeAgentEvents가 session 이벤트를 받으면 *즉시* saveConversation()을 호출해
 *   sessionId를 디스크에 영속한다. 현재 구현(runtime.ts:176-222)은 done 이벤트에서만
 *   saveConversation()을 호출 — 턴이 done 전에 중단(interrupt/앱 종료)되면 그 턴에서
 *   받은 sessionId가 디스크에 남지 않고 유실된다(다음 재시작 시 resume 실패).
 *
 * session 이벤트 shape(shared/agent-events.ts AgentEventSession, lifecycle.ts handleSession 확인):
 *   { type: 'session', sessionId: string } — handleSession은 state.sessionId = event.sessionId로 반영.
 *
 * 검증 범위:
 *   - session 이벤트 수신 시 conversationSave IPC가 호출된다(현재는 미호출 → RED).
 *   - 저장된 conversation.sessionId가 session 이벤트의 sessionId와 일치한다.
 *
 * 아키텍처 준수:
 *   - window.api mock → store 액션 → 상태 갱신 (단방향)
 *   - 신뢰경계: window.api.conversationSave(화이트리스트)만 호출 관찰 — fs/Node 0.
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

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
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')

    // saveConversation의 threadMsgs.length===0 가드 통과용 — user 메시지를 thread에 심는다.
    useAppStore.setState({
      thread: [{ kind: 'msg', id: 'm-1', role: 'user', text: '테스트 메시지' }],
      messages: [{ id: 'm-1', role: 'user', content: '테스트 메시지' }],
      isRunning: true,
      // P3a: subscription 가드는 payload.runId === currentRunId일 때만 사이드이펙트 발생.
      // 실사용에선 sendMessage가 agentRun resolve 직후 currentRunId를 세팅 — 여기선 그 상태를 모사.
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

    // session 이벤트 전송 — done 이벤트는 아직 오지 않음(턴 진행 중 상황 모사).
    const sessionPayload: AgentEventPayload = {
      runId: 'r1',
      event: { type: 'session', sessionId: 'sess-abc' },
    }
    capturedCallback!(sessionPayload)

    // 비동기 side-effect(void saveConversation()) 완료 대기
    await new Promise((resolve) => setTimeout(resolve, 50))

    // RED: 현재 구현은 done 이벤트에서만 저장하므로 여기서 호출되지 않는다.
    expect(mockConversationSave).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('session 이벤트로 저장된 conversation.sessionId가 이벤트의 sessionId와 일치한다', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')

    useAppStore.setState({
      thread: [{ kind: 'msg', id: 'm-1', role: 'user', text: '테스트 메시지' }],
      messages: [{ id: 'm-1', role: 'user', content: '테스트 메시지' }],
      isRunning: true,
      // P3a: 활성 run과 이벤트 runId를 일치시켜야 가드를 통과한다(현실 셋업).
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
