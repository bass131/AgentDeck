// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { usePanelSession } from '../../../02_Project/00_Source/renderer/src/store/panelSession'
import { useMultiPersist } from '../../../02_Project/00_Source/renderer/src/hooks/useMultiPersist'
import type { AgentEventPayload, PersistedMultiState } from '../../../02_Project/00_Source/shared/ipcContract'
import { makeMultiCmdMocks } from './helpers/multiCmdMock'

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
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

function useHarness(activeMultiSessionId: string) {
  const s0 = usePanelSession()
  const s1 = usePanelSession()
  const s2 = usePanelSession()
  const s3 = usePanelSession()
  const s4 = usePanelSession()
  const s5 = usePanelSession()
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
})
