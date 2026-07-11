// @vitest-environment jsdom
/**
 * lr4-p07-repl-per-session-multi-send.test.tsx — LR4 P07 RED 테스트 (TDD 1단계, 멀티 send 게이트).
 *
 * 목표(시나리오 3, 멀티): 패널 send 경로가 *그 패널의* replMode로 held-open(persistent) 게이트를
 *   결정한다. 계약상 usePanelSession 훅 결과에 `setReplMode(on)`이 추가되고, send는
 *   state.replMode를 읽어 persistent/sessionKey를 주입한다. P02/P03 held-open 수명이 세션별
 *   replMode와 정합함을 이 게이트로 실증한다.
 *
 * 이 파일은 *실패하는 테스트만* 작성한다(구현 없음):
 *   - usePanelSession() 반환에 setReplMode가 없다 → 호출 시 TypeError(미존재 심볼) = RED.
 *   - (setReplMode를 추가해도) send가 state.replMode를 읽어 persistent를 주입하는 게이트가
 *     아직 없다 → agentRun 인자 단언이 behavioral RED로 실패한다.
 *
 * 결정론: window.api 전면 모킹(시간/랜덤/네트워크 의존 0). renderHook + act로 비동기 send 대기.
 * CRITICAL(신뢰경계): 앱 소스(02.Source/**) 미수정 — 테스트 전용. window.api 경유만.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import {
  usePanelSession,
  __resetPanelSessionManagerForTests,
  type PanelSessionHookResult,
} from '../../../02.Source/renderer/src/store/panelSession'

// 구현 후 usePanelSession 반환에 추가되는 setReplMode를 포함한 훅 타입(RED 캐스팅).
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

    // 패널 자신의 replMode를 ON으로 — 훅 결과의 setReplMode(계약 신규)로 세팅.
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
