// 작업 ID: lr1 · 옛 이름 lr1-resume-bug.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { usePanelSlot, __resetPanelSessionManagerForTests } from '@renderer/03_Agent/state/panelSession'
import { useMultiPersist } from '@renderer/06_Sessions/hooks/useMultiPersist'
import type { AgentEventPayload, PersistedMultiState } from '../../../../02_Project/00_Source/shared/ipcContract'
import { makeMultiCmdMocks } from '../00_Helpers/multiCmdMock'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

let _disk: PersistedMultiState | null = null

const mockMultiSessionLoad = vi.fn(async () => ({ state: _disk }))
const { multiCmdUpsert: mockMultiCmdUpsert } = makeMultiCmdMocks(
  () => _disk,
  (s) => { _disk = s }
)

let capturedHandlers: Array<(payload: AgentEventPayload) => void> = []
const mockOnAgentEvent = vi.fn((cb: (payload: AgentEventPayload) => void) => {
  capturedHandlers.push(cb)
  return () => {}
})

let runIdSeq = 0
const mockAgentRun = vi.fn(async (_req: { resumeSessionId?: string }) => ({ runId: `run-${runIdSeq++}` }))
const mockAgentAbort = vi.fn(async () => ({ accepted: true }))

const mockApi = {
  onAgentEvent: mockOnAgentEvent,
  agentRun: mockAgentRun,
  agentAbort: mockAgentAbort,
  multiCmdUpsert: mockMultiCmdUpsert,
  multiSessionLoad: mockMultiSessionLoad,
}
Object.defineProperty(window, 'api', { value: adaptFlatApi(mockApi), writable: true, configurable: true })

function useHarness(activeMultiSessionId: string) {
  const s0 = usePanelSlot(activeMultiSessionId, 0)
  const s1 = usePanelSlot(activeMultiSessionId, 1)
  const s2 = usePanelSlot(activeMultiSessionId, 2)
  const s3 = usePanelSlot(activeMultiSessionId, 3)
  const s4 = usePanelSlot(activeMultiSessionId, 4)
  const s5 = usePanelSlot(activeMultiSessionId, 5)
  const sessions = [s0, s1, s2, s3, s4, s5]
  useMultiPersist(sessions, activeMultiSessionId)
  return { sessions }
}

async function waitForRestore(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
}

beforeEach(() => {
  _disk = null
  runIdSeq = 0
  capturedHandlers = []
  vi.clearAllMocks()
  __resetPanelSessionManagerForTests()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('멀티패널 resume 체인 — 정상성 (회귀 방어)', () => {
  it('디바운스 완료 후 저장 → 재마운트(재시작 시뮬) 복원 → 다음 send가 resumeSessionId로 주입', async () => {
    const ACTIVE_ID = 'sess-lr1-green'
    const SESSION_ID = 'sess-runtime-green-002'

    _disk = { version: 2, activeSessionId: ACTIVE_ID, sessions: [{ id: ACTIVE_ID, title: '', count: 6, panels: [] }] }

    const first = renderHook(() => useHarness(ACTIVE_ID))
    await waitForRestore()

    await act(async () => {
      await first.result.current.sessions[0].send('hello')
    })
    const runId = first.result.current.sessions[0].state.currentRunId as string

    act(() => {
      capturedHandlers[0]({ runId, event: { type: 'session', sessionId: SESSION_ID } })
    })
    expect(first.result.current.sessions[0].state.sessionId).toBe(SESSION_ID)

    await act(async () => {
      await new Promise((r) => setTimeout(r, 700))
    })

    expect(mockMultiCmdUpsert).toHaveBeenCalled()
    const savedSession = _disk?.sessions.find((s) => s.id === ACTIVE_ID)
    expect(savedSession?.panels[0]?.snapshot?.sessionId).toBe(SESSION_ID)

    first.unmount()
    cleanup()
    capturedHandlers = []
    // 재시작 흉내 — 패널 매니저 상태는 모듈 수준이라 언마운트로 사라지지 않는다. 프로세스 재시작처럼 비운다
    __resetPanelSessionManagerForTests()

    const second = renderHook(() => useHarness(ACTIVE_ID))
    await waitForRestore()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(second.result.current.sessions[0].state.sessionId).toBe(SESSION_ID)

    mockAgentRun.mockClear()
    await act(async () => {
      await second.result.current.sessions[0].send('안녕, 계속할게')
    })
    expect(mockAgentRun).toHaveBeenCalledTimes(1)
    const sentReq = mockAgentRun.mock.calls[0][0]
    expect(sentReq.resumeSessionId).toBe(SESSION_ID)

    second.unmount()
  })

  // M06 G4: 복원된 패널이 마지막으로 잰 컨텍스트 창을 다음 실행 요청에 싣는다.
  it('복원된 lastContextWindow가 다음 send의 contextWindow로 주입', async () => {
    const ACTIVE_ID = 'sess-g4-cw'
    _disk = {
      version: 2,
      activeSessionId: ACTIVE_ID,
      sessions: [{
        id: ACTIVE_ID,
        title: '',
        count: 6,
        panels: [{
          title: '',
          picker: { model: 'claude-haiku-4-5', effort: 'high', mode: 'normal' },
          // 복원은 메시지가 있는 스냅샷만 한다(useMultiPersist)
          snapshot: {
            messages: [{ id: 'm1', role: 'user', text: '앞선 질문' }, { id: 'm2', role: 'assistant', text: '앞선 답' }],
            seq: 2,
            sessionId: 'sess-g4-prev',
            lastContextWindow: 200_000,
          },
        }],
      }],
    }

    const view = renderHook(() => useHarness(ACTIVE_ID))
    await waitForRestore()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(view.result.current.sessions[0].state.sessionId).toBe('sess-g4-prev')
    expect(view.result.current.sessions[0].state.lastContextWindow).toBe(200_000)

    await act(async () => {
      await view.result.current.sessions[0].send('이어서')
    })
    expect(mockAgentRun).toHaveBeenCalledTimes(1)
    const sentReq = mockAgentRun.mock.calls[0][0] as { contextWindow?: number; resumeSessionId?: string }
    expect(sentReq.contextWindow).toBe(200_000)
    expect(sentReq.resumeSessionId).toBe('sess-g4-prev')

    view.unmount()
  })
})
