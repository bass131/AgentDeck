// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { makeInitialState } from '../../../02_Project/00_Source/renderer/src/store/reducer'

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

describe('단일챗 sendMessage — agentRun reject 시 isRunning 롤백 + 에러 가시화 (reviewer 🟡)', () => {
  beforeEach(async () => {
    agentRunShouldFail = false
    mockApi.agentRun.mockClear()
    mockApi.agentAbort.mockClear()
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
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
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')

    await useAppStore.getState().sendMessage('안녕')

    const s = useAppStore.getState()
    expect(s.isRunning).toBe(false)
    expect(s.currentRunId).toBeNull()
    expect(s.errorMessage).toBeTruthy()
  })

  it('reject로 고착되지 않으므로 abortRun 재호출도 조용히 no-op — 고착 재현 X(agentAbort IPC 미호출)', async () => {
    agentRunShouldFail = true
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')

    await useAppStore.getState().sendMessage('안녕')
    await useAppStore.getState().abortRun()

    expect(useAppStore.getState().isRunning).toBe(false)
    expect(mockApi.agentAbort).not.toHaveBeenCalled()
  })

  it('reject 후 정상 재전송 → isRunning true로 복귀(고착 없이 재시도 가능)', async () => {
    agentRunShouldFail = true
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    await useAppStore.getState().sendMessage('실패할 전송')
    expect(useAppStore.getState().isRunning).toBe(false)

    agentRunShouldFail = false
    await useAppStore.getState().sendMessage('재전송')
    expect(useAppStore.getState().currentRunId).toBe('r1')
  })
})

describe('패널 usePanelSession/usePanelSlot — agentRun reject 시 isRunning 롤백 + 에러 가시화 (reviewer 🟡)', () => {
  beforeEach(async () => {
    agentRunShouldFail = false
    mockApi.agentRun.mockClear()
    mockApi.agentAbort.mockClear()
    const { __resetPanelSessionManagerForTests } = await import('../../../02_Project/00_Source/renderer/src/store/panelSession')
    __resetPanelSessionManagerForTests()
  })

  afterEach(() => cleanup())

  it('usePanelSession().send() — agentRun reject → isRunning false + currentRunId null + errorMessage(ma-p-error 배너 재사용)', async () => {
    agentRunShouldFail = true
    const { usePanelSession } = await import('../../../02_Project/00_Source/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.send('안녕')
    })

    expect(result.current.state.isRunning).toBe(false)
    expect(result.current.state.currentRunId).toBeNull()
    expect(result.current.state.errorMessage).toBeTruthy()
  })

  it('usePanelSession().send() reject 후 abort() 재호출도 no-op(agentAbort IPC 미호출) — 고착 재현 X', async () => {
    agentRunShouldFail = true
    const { usePanelSession } = await import('../../../02_Project/00_Source/renderer/src/store/panelSession')
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
    const { usePanelSlot } = await import('../../../02_Project/00_Source/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-run-failed', 0))

    await act(async () => {
      await result.current.send('안녕')
    })

    expect(result.current.state.isRunning).toBe(false)
    expect(result.current.state.currentRunId).toBeNull()
    expect(result.current.state.errorMessage).toBeTruthy()
  })
})
