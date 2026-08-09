// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import {
  usePanelSlot,
  __resetPanelSessionManagerForTests,
  __getPanelManagerSizesForTests,
  disposePanelManagerSession,
  makePanelSlotKey,
} from '../../../02_Project/00_Source/renderer/src/store/panelSession'
import type { AgentEventPayload } from '../../../02_Project/00_Source/shared/ipcContract'
import { installWindowApi } from './helpers/windowApiMock'

let runIdCounter = 0
let capturedHandler: ((payload: AgentEventPayload) => void) | null = null

const { api: mockApi } = installWindowApi({
  agentRun: vi.fn().mockImplementation(() => {
    const runId = `run-${runIdCounter}`
    runIdCounter++
    return Promise.resolve({ runId })
  }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockImplementation((cb: (payload: AgentEventPayload) => void) => {
    capturedHandler = cb
    return () => {
      capturedHandler = null
    }
  }),
})

beforeEach(() => {
  vi.clearAllMocks()
  runIdCounter = 0
  capturedHandler = null
  __resetPanelSessionManagerForTests()
  mockApi.agentRun.mockImplementation(() => {
    const runId = `run-${runIdCounter}`
    runIdCounter++
    return Promise.resolve({ runId })
  })
  mockApi.onAgentEvent.mockImplementation((cb: (payload: AgentEventPayload) => void) => {
    capturedHandler = cb
    return () => {
      capturedHandler = null
    }
  })
})

afterEach(() => {
  cleanup()
  __resetPanelSessionManagerForTests()
})

const LOOP = [{ id: 'cc1', summary: '매분 상태 점검', interval: 'Every minute' }]

describe('BF3 Phase 07 경계 ⓑ — panelManagerStates CAP(32) 축출 후 재마운트 시 activeLoops 소실 봉합', () => {
  it('activeLoops 보유(그러나 idle+unmount) 슬롯이 CAP 초과로 축출된 뒤 재마운트해도 activeLoops가 보존된다', async () => {
    const OWNER_SID = 'sess-loop-owner'

    const owner = renderHook(() => usePanelSlot(OWNER_SID, 0))
    await act(async () => {
      await owner.result.current.send('시작해줘')
    })
    expect(capturedHandler).toBeTruthy()
    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'loops', loops: LOOP } })
    })
    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'done' } })
    })
    expect(owner.result.current.state.activeLoops).toEqual(LOOP)
    expect(owner.result.current.state.isRunning).toBe(false)
    act(() => {
      owner.unmount()
    })

    for (let s = 0; s < 32; s++) {
      const filler = renderHook(() => usePanelSlot(`sess-filler-${s}`, 0))
      act(() => {
        filler.unmount()
      })
    }

    expect(__getPanelManagerSizesForTests().states).toBeLessThanOrEqual(32)

    const returned = renderHook(() => usePanelSlot(OWNER_SID, 0))
    expect(returned.result.current.state.activeLoops).toEqual(LOOP)

    act(() => {
      returned.unmount()
    })
  })
})

describe('BF3 Phase 07 경계 ⓒ — 디스크 RESTORE 스냅샷 재로드 시 activeLoops 소실 봉합', () => {
  it('RESTORE(빈 PanelThreadSnapshot) 디스패치 후에도 직전 activeLoops가 보존된다', async () => {
    const SID = 'sess-restore-loop'
    const view = renderHook(() => usePanelSlot(SID, 0))
    await act(async () => {
      await view.result.current.send('goal 시작')
    })
    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'loops', loops: LOOP } })
    })
    expect(view.result.current.state.activeLoops).toEqual(LOOP)

    act(() => {
      view.result.current.restore({ messages: [], seq: 0 })
    })

    expect(view.result.current.state.activeLoops).toEqual(LOOP)
    expect(view.result.current.state.thread).toEqual([])

    act(() => {
      view.unmount()
    })
  })
})

describe('BF3 Phase 07 — 불변조건 + 정리 대칭 (패널)', () => {
  it('앱 재시작 시뮬레이션(매니저 전체 리셋) 후에는 배너가 복원되지 않는다(stale 방지)', async () => {
    const SID = 'sess-restart'
    const view = renderHook(() => usePanelSlot(SID, 0))
    await act(async () => {
      await view.result.current.send('go')
    })
    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'loops', loops: LOOP } })
    })
    expect(view.result.current.state.activeLoops).toEqual(LOOP)
    act(() => {
      view.unmount()
    })

    __resetPanelSessionManagerForTests()

    const returned = renderHook(() => usePanelSlot(SID, 0))
    expect(returned.result.current.state.activeLoops).toEqual([])
    act(() => {
      returned.unmount()
    })
  })

  it('레지스트리 잔존 0: CLEAR_LOOPS(abort)의 정지확인 배너까지 닫히면 레지스트리 엔트리가 스스로 지워진다', async () => {
    const SID = 'sess-abort-clear'
    const view = renderHook(() => usePanelSlot(SID, 0))
    await act(async () => {
      await view.result.current.send('go')
    })
    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'loops', loops: LOOP } })
    })
    expect(__getPanelManagerSizesForTests().loopDisplay).toBeGreaterThan(0)

    await act(async () => {
      await view.result.current.abort()
    })

    expect(view.result.current.state.activeLoops).toEqual([])
    expect(view.result.current.state.loopsStoppedNotice).toBe(true)
    expect(__getPanelManagerSizesForTests().loopDisplay).toBeGreaterThan(0)

    act(() => {
      view.result.current.dismissLoopsStopped()
    })
    expect(__getPanelManagerSizesForTests().loopDisplay).toBe(0)

    act(() => {
      view.unmount()
    })
  })

  it('레지스트리 잔존 0: disposePanelManagerSession(영구 폐기) 시 레지스트리 엔트리가 명시 정리된다', async () => {
    const SID = 'sess-dispose'
    const view = renderHook(() => usePanelSlot(SID, 0))
    await act(async () => {
      await view.result.current.send('go')
    })
    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'loops', loops: LOOP } })
    })
    act(() => {
      view.unmount()
    })
    expect(__getPanelManagerSizesForTests().loopDisplay).toBeGreaterThan(0)

    disposePanelManagerSession(makePanelSlotKey(SID, 0))

    expect(__getPanelManagerSizesForTests().loopDisplay).toBe(0)
  })
})
