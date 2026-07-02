// @vitest-environment jsdom
/**
 * bf3-p07-banner-continuity-panel.test.tsx — BF3 Phase 07: 멀티패널 loops/goal 배너 연속성
 * (경계 ⓑ — panelManagerStates cap(32) 축출 / 경계 ⓒ — 디스크 RESTORE 스냅샷).
 *
 * 배경(01.Phases/BF3-backlog-sweep/07-banner-continuity.md): panelManagerStates(앱수명
 * 매니저, LR3-P07)는 PANEL_MANAGER_CAP=32로 유계다. capPanelManagerStates는 "실행 중
 * (isRunning) 또는 마운트 중(리스너 존재)"만 보존하는데, SDK 크론(activeLoops)은 `loops`
 * 이벤트로만 갱신되고 isRunning과 무관하게 살아있을 수 있다(턴 사이 idle 구간). 즉
 * activeLoops를 가진 슬롯이 unmount+idle 상태에서 CAP 축출 대상이 될 수 있다 — 축출되면
 * 재마운트 시 빈 상태(makePanelInitialState())로 새로 만들어져 배너가 사라진다.
 *
 * 또한 RESTORE(디스크 PanelThreadSnapshot 재로드, useMultiPersist 마운트 효과)는
 * makePanelInitialState(snapshot)로 상태를 통째로 교체한다 — 스냅샷이 loops를 담지 않으므로
 * (불변조건) RESTORE는 항상 activeLoops를 비운다. CAP에 안 걸려도(마운트 중이라도) RESTORE가
 * 호출되면 소실된다 — 이게 경계 ⓒ.
 *
 * 봉합: panelLoopDisplayRegistry(panelSession.ts 모듈 내부) — "sessionId::slot" 키의
 * 앱수명 레지스트리. dispatchToPanelManager 매 디스패치 후 write-through, getPanelManagerState
 * 신규 생성 시 오버레이, RESTORE 액션 결과에도 오버레이.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import {
  usePanelSlot,
  __resetPanelSessionManagerForTests,
  __getPanelManagerSizesForTests,
  disposePanelManagerSession,
  makePanelSlotKey,
} from '../../../02.Source/renderer/src/store/panelSession'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

let runIdCounter = 0
let capturedHandler: ((payload: AgentEventPayload) => void) | null = null

const mockApi = {
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
}

Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

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

    // 1) loop-owner 슬롯: send → run 확보 → loops 이벤트로 activeLoops 세팅 → unmount.
    //    (done 이벤트 없음 — 실측 그대로: 턴 사이 idle에서도 SDK 크론은 살아있을 수 있다.)
    const owner = renderHook(() => usePanelSlot(OWNER_SID, 0))
    await act(async () => {
      await owner.result.current.send('시작해줘')
    })
    expect(capturedHandler).toBeTruthy()
    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'loops', loops: LOOP } })
    })
    expect(owner.result.current.state.activeLoops).toEqual(LOOP)
    expect(owner.result.current.state.isRunning).toBe(false) // loops 이벤트는 isRunning 미변경(idle)
    act(() => {
      owner.unmount()
    })

    // 2) 나머지 슬롯 32개를 마운트만 하고 언마운트 — CAP(32) 초과를 유발해 loop-owner(최초
    //    삽입, 실행 중 아님·리스너 없음)가 축출 후보 1순위가 되게 한다.
    for (let s = 0; s < 32; s++) {
      const filler = renderHook(() => usePanelSlot(`sess-filler-${s}`, 0))
      act(() => {
        filler.unmount()
      })
    }

    // 사전조건: CAP 로직이 실제로 축출을 일으켰는지(states<=32, loop-owner 포함 33개 방문).
    expect(__getPanelManagerSizesForTests().states).toBeLessThanOrEqual(32)

    // 3) loop-owner 재마운트 — 레지스트리 오버레이가 activeLoops를 되살려야 한다.
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

    // useMultiPersist 마운트 효과가 호출하는 것과 동형 — 디스크 스냅샷은 loops 미포함(불변조건).
    act(() => {
      view.result.current.restore({ messages: [], seq: 0 })
    })

    expect(view.result.current.state.activeLoops).toEqual(LOOP)
    // thread는 스냅샷대로 정상 교체(빈 배열) — 표시 트리오만 승격 대상이라는 스코프 확인.
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

    // "재시작" — 매니저 전체 리셋(내부적으로 panelLoopDisplayRegistry도 함께 리셋).
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

    // CLEAR_LOOPS는 activeLoops를 비우지만, 끊긴 루프가 있었으므로 loopsStoppedNotice(정지
    // 확인 배너)를 대신 켠다(LR3-06) — 표시 트리오 중 하나가 여전히 non-empty이므로 레지스트리
    // 엔트리는 아직 살아있어야 정상(자기 가지치기는 "완전히 빈 값"일 때만).
    expect(view.result.current.state.activeLoops).toEqual([])
    expect(view.result.current.state.loopsStoppedNotice).toBe(true)
    expect(__getPanelManagerSizesForTests().loopDisplay).toBeGreaterThan(0)

    // 사용자가 정지확인 배너를 닫음(✕) — 이제 표시 트리오 전부 빈 값 → 자기 가지치기.
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
