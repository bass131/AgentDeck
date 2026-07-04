// @vitest-environment jsdom
/**
 * fb-run-failed-cleanup.test.tsx — reviewer 🟡 처방 봉합: agentRun IPC 전송 실패 시
 * isRunning 영구 고착 회귀 가드 (단일챗·패널 양쪽 동시).
 *
 * 결함(reviewer 실측): window.api.agentRun이 reject하면(IPC/백엔드 도달 전 실패)
 * SET_RUN_ID(단일챗은 그 상당 set({currentRunId: res.runId}))가 전혀 발화하지 않아
 * currentRunId=null로 고착된다. 이때:
 *   - sendMessage/ADD_USER_MESSAGE·ADD_COMMAND_CARD가 낙관적으로 세운 isRunning=true
 *     (64d7109 낙관 isRunning)를 되돌릴 이벤트가 결코 오지 않아 영구 true로 남는다
 *     (WorkingIndicator 무한 표시).
 *   - abortRun/CLEAR_LOOPS(5a55b86 handleDone 동형 정리)의 `if (!currentRunId) return`
 *     조기반환으로 정지 버튼도 no-op이 된다.
 *   - 실패가 사용자에게 전혀 보이지 않는 조용한 실패(silent failure)였다.
 *
 * 수정(파일:라인):
 *   - 02.Source/renderer/src/store/slices/runtime.ts sendMessage — window.api.agentRun
 *     호출을 try/catch로 감싸 실패 시 handleError(reducer/lifecycle.ts) 재사용.
 *   - 02.Source/renderer/src/store/panelSession.ts send()·performManagedSend() —
 *     동일하게 try/catch → RUN_FAILED 액션(panelReducer가 handleError 위임).
 * 가시화는 기존 conv-error(단일챗 Conversation.tsx)/ma-p-error(패널 PanelView.tsx)
 * 배너 문법을 그대로 재사용 — errorMessage 필드 세팅만으로 자동 렌더(새 시각 문법 0).
 *
 * 이 테스트는 수정 전에는 실패(red) — 수정 후 green.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { makeInitialState } from '../../../02.Source/renderer/src/store/reducer'

// ── window.api mock (agentRun을 플래그로 reject/resolve 전환) ──────────────────

let agentRunShouldFail = false

const mockApi = {
  conversationLoad: async () => ({ conversations: [] }),
  conversationSave: async () => ({ id: 'cv-1' }),
  listConversations: async () => ({ conversations: [] }),
  agentRun: vi.fn(async () => {
    if (agentRunShouldFail) throw new Error('IPC 채널 다운(테스트 시뮬레이션)')
    return { runId: 'r1' }
  }),
  agentAbort: vi.fn(async () => ({ accepted: true })),
  agentInterrupt: vi.fn(async () => ({ accepted: true })),
  onAgentEvent: vi.fn(() => () => {}),
  listFiles: async () => ({ files: [] }),
  pathForFile: () => '',
  saveImageData: async () => ({ path: '' }),
  workspaceOpen: async () => ({ rootPath: null, tree: null }),
  referenceList: async () => ({ references: [] }),
  referenceTree: async () => ({ tree: null }),
  referenceAdd: async () => ({ reference: null }),
  fsRead: async () => ({ kind: 'not-found' }),
  permissionRespond: vi.fn(async () => ({ ok: true })),
  questionRespond: vi.fn(async () => ({ ok: true })),
}

Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

// ══════════════════════════════════════════════════════════════════════════════
// 단일챗 — slices/runtime.ts sendMessage
// ══════════════════════════════════════════════════════════════════════════════

describe('단일챗 sendMessage — agentRun reject 시 isRunning 롤백 + 에러 가시화 (reviewer 🟡)', () => {
  beforeEach(async () => {
    agentRunShouldFail = false
    mockApi.agentRun.mockClear()
    mockApi.agentAbort.mockClear()
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      ...makeInitialState(),
      messages: [],
      conversationId: null,
      attachedImages: [],
      queue: [],
      currentRunId: null,
      isRunning: false,
    } as Parameters<typeof useAppStore.setState>[0])
  })

  it('agentRun reject → isRunning false 복귀 + currentRunId null + errorMessage 세팅(conv-error 배너 재사용)', async () => {
    agentRunShouldFail = true
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')

    // sendMessage 낙관 단계에서 isRunning=true가 되지만, agentRun reject 후 롤백돼야 한다.
    await useAppStore.getState().sendMessage('안녕')

    const s = useAppStore.getState()
    expect(s.isRunning).toBe(false)
    expect(s.currentRunId).toBeNull()
    // Conversation.tsx: {errorMessage && !isRunning && <div className="conv-error" role="alert">}
    expect(s.errorMessage).toBeTruthy()
  })

  it('reject로 고착되지 않으므로 abortRun 재호출도 조용히 no-op — 고착 재현 X(agentAbort IPC 미호출)', async () => {
    agentRunShouldFail = true
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')

    await useAppStore.getState().sendMessage('안녕')
    await useAppStore.getState().abortRun()

    expect(useAppStore.getState().isRunning).toBe(false)
    expect(mockApi.agentAbort).not.toHaveBeenCalled()
  })

  it('reject 후 정상 재전송 → isRunning true로 복귀(고착 없이 재시도 가능)', async () => {
    agentRunShouldFail = true
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    await useAppStore.getState().sendMessage('실패할 전송')
    expect(useAppStore.getState().isRunning).toBe(false)

    agentRunShouldFail = false
    await useAppStore.getState().sendMessage('재전송')
    expect(useAppStore.getState().currentRunId).toBe('r1')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 패널 — usePanelSession(컴포넌트 로컬)·usePanelSlot(매니저 승격, performManagedSend)
// ══════════════════════════════════════════════════════════════════════════════

describe('패널 usePanelSession/usePanelSlot — agentRun reject 시 isRunning 롤백 + 에러 가시화 (reviewer 🟡)', () => {
  beforeEach(async () => {
    agentRunShouldFail = false
    mockApi.agentRun.mockClear()
    mockApi.agentAbort.mockClear()
    const { __resetPanelSessionManagerForTests } = await import('../../../02.Source/renderer/src/store/panelSession')
    __resetPanelSessionManagerForTests()
  })

  afterEach(() => cleanup())

  it('usePanelSession().send() — agentRun reject → isRunning false + currentRunId null + errorMessage(ma-p-error 배너 재사용)', async () => {
    agentRunShouldFail = true
    const { usePanelSession } = await import('../../../02.Source/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.send('안녕')
    })

    expect(result.current.state.isRunning).toBe(false)
    expect(result.current.state.currentRunId).toBeNull()
    // PanelView.tsx: {errorMessage && !isRunning && <div className="ma-p-error" role="alert">}
    expect(result.current.state.errorMessage).toBeTruthy()
  })

  it('usePanelSession().send() reject 후 abort() 재호출도 no-op(agentAbort IPC 미호출) — 고착 재현 X', async () => {
    agentRunShouldFail = true
    const { usePanelSession } = await import('../../../02.Source/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.send('안녕')
    })
    await act(async () => {
      await result.current.abort()
    })

    expect(result.current.state.isRunning).toBe(false)
    expect(mockApi.agentAbort).not.toHaveBeenCalled()
  })

  it('usePanelSlot(매니저 승격 경로, performManagedSend) — agentRun reject → isRunning false + errorMessage', async () => {
    agentRunShouldFail = true
    const { usePanelSlot } = await import('../../../02.Source/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-run-failed', 0))

    await act(async () => {
      await result.current.send('안녕')
    })

    expect(result.current.state.isRunning).toBe(false)
    expect(result.current.state.currentRunId).toBeNull()
    expect(result.current.state.errorMessage).toBeTruthy()
  })
})
