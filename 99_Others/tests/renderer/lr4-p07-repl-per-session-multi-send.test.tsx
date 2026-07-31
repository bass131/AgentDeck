// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import {
  usePanelSession,
  __resetPanelSessionManagerForTests,
  type PanelSessionHookResult,
} from '../../../02_Source/renderer/src/store/panelSession'

type HookWithReplMode = PanelSessionHookResult & { setReplMode: (on: boolean) => void }

let capturedAgentRun: { [k: string]: unknown } | null = null

const mockApi = {
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  agentRun: vi.fn(async (req: { [k: string]: unknown }) => {
    capturedAgentRun = req
    return { runId: (req.sessionKey as string) ?? 'run-1' }
  }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  permissionRespond: vi.fn().mockResolvedValue(undefined),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  capturedAgentRun = null
  mockApi.onAgentEvent.mockReturnValue(() => {})
  mockApi.agentRun.mockImplementation(async (req: { [k: string]: unknown }) => {
    capturedAgentRun = req
    return { runId: (req.sessionKey as string) ?? 'run-1' }
  })
  __resetPanelSessionManagerForTests()
})

afterEach(() => {
  cleanup()
})

describe('LR4 P07 시나리오 3(멀티): 패널 replMode로 send held-open 게이트', () => {
  it('setReplMode(true) 후 send → agentRun에 persistent:true + sessionKey 포함', async () => {
    const { result } = renderHook(() => usePanelSession())

    act(() => {
      const hook = result.current as HookWithReplMode
      hook.setReplMode(true)
    })
    await act(async () => {
      await result.current.send('안녕')
    })

    expect(capturedAgentRun).not.toBeNull()
    const cap = capturedAgentRun as { [k: string]: unknown }
    expect(cap.persistent).toBe(true)
    expect(typeof cap.sessionKey).toBe('string')
    expect((cap.sessionKey as string).length).toBeGreaterThan(0)
  })

  it('setReplMode(false) 후 send → agentRun에 persistent/sessionKey 미포함 (단발)', async () => {
    const { result } = renderHook(() => usePanelSession())

    act(() => {
      const hook = result.current as HookWithReplMode
      hook.setReplMode(false)
    })
    await act(async () => {
      await result.current.send('안녕')
    })

    expect(capturedAgentRun).not.toBeNull()
    const cap = capturedAgentRun as { [k: string]: unknown }
    expect(cap.persistent).toBeFalsy()
    expect(cap.sessionKey).toBeUndefined()
  })
})
