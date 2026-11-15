// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import {
  usePanelSlot,
  disposePanelManagerSessionsByPrefix,
  __resetPanelSessionManagerForTests,
  __getPanelManagerSizesForTests,
} from '@renderer/03_Agent/state/panelSession'
import { sessionRegistry } from '@renderer/03_Agent/state/sessionRegistry'
import { panelKey, panelPrefix } from '@renderer/03_Agent/state/sessionKeys'

// G9c Backlog 46 — 전송 직후 agentRun 응답 전에 패널을 폐기하면, 뒤이어 온 SET_RUN_ID가 지운 키를 되살리지
// 않고, 남은 main run은 기존 IPC(agentAbort)로 끊는다. 폐기 판정은 코어 포트(키 생애)로 한다.

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const agentRun = vi.fn()
const agentAbort = vi.fn()

beforeEach(() => {
  agentRun.mockReset()
  agentAbort.mockReset().mockResolvedValue({ accepted: true })
  Object.defineProperty(window, 'api', {
    value: { onAgentEvent: vi.fn(() => () => {}), agentRun, agentAbort },
    writable: true,
    configurable: true,
  })
  __resetPanelSessionManagerForTests()
})

afterEach(() => {
  cleanup()
  __resetPanelSessionManagerForTests()
})

describe('Backlog 46 — 코어의 폐기 포트(life)', () => {
  it('전송 중 life가 바뀌면 SET_RUN_ID·onRunStarted 없이 도착한 run을 agentAbort로 끊는다', async () => {
    const { createRunCore } = await import('@renderer/03_Agent/state/runCore')
    const { makePanelInitialState } = await import('@renderer/03_Agent/state/panelSession')
    const gate = deferred<{ runId: string }>()
    agentRun.mockReturnValueOnce(gate.promise)
    let life = 0
    let state = makePanelInitialState()
    const actions: string[] = []
    const onRunStarted = vi.fn()
    const core = createRunCore({
      readState: () => state,
      dispatch: (a) => { actions.push(a.type); if (a.type === 'ADD_USER_MESSAGE') state = { ...state, isRunning: true } },
      refreshStale: () => {},
      resolveRunTarget: () => ({}),
      onPermissionMode: () => {},
      onRunStarted,
      life: () => life,
    })
    const sending = core.send({ text: 'x' })
    life += 1
    gate.resolve({ runId: 'r-core' })
    await sending
    expect(actions).toEqual(['ADD_USER_MESSAGE'])
    expect(onRunStarted).not.toHaveBeenCalled()
    expect(agentAbort).toHaveBeenCalledWith({ runId: 'r-core' })
  })
})

describe('Backlog 46 — 폐기 뒤 도착한 SET_RUN_ID', () => {
  it('지운 키를 되살리지 않고, 도착한 run은 agentAbort로 끊는다', async () => {
    const gate = deferred<{ runId: string }>()
    agentRun.mockReturnValueOnce(gate.promise)
    const { result, unmount } = renderHook(() => usePanelSlot('gone', 0))
    let sending!: Promise<void>
    act(() => { sending = result.current.send('hi') })
    unmount()
    act(() => { disposePanelManagerSessionsByPrefix(panelPrefix('gone')) })
    expect(agentAbort).not.toHaveBeenCalled()

    await act(async () => {
      gate.resolve({ runId: 'run-orphan' })
      await sending
    })

    expect(agentAbort).toHaveBeenCalledWith({ runId: 'run-orphan' })
    expect(sessionRegistry.has(panelKey('gone', 0))).toBe(false)
    expect(sessionRegistry.lookup('run-orphan')).toBeUndefined()
    expect(__getPanelManagerSizesForTests()).toMatchObject({ states: 0, runIds: 0 })
  })

  it('agentRun이 실패해도 지운 키에 오류 상태를 되살리지 않는다', async () => {
    const gate = deferred<{ runId: string }>()
    agentRun.mockReturnValueOnce(gate.promise)
    const { result, unmount } = renderHook(() => usePanelSlot('gone2', 1))
    let sending!: Promise<void>
    act(() => { sending = result.current.send('hi') })
    unmount()
    act(() => { disposePanelManagerSessionsByPrefix(panelPrefix('gone2')) })

    await act(async () => {
      gate.reject(new Error('boom'))
      await sending
    })

    expect(sessionRegistry.has(panelKey('gone2', 1))).toBe(false)
    expect(agentAbort).not.toHaveBeenCalled()
  })

  it('키 하나를 폐기해도(disposePanelManagerSession) 같다 — 다른 슬롯의 전송은 그대로 붙는다', async () => {
    const { disposePanelManagerSession } = await import('@renderer/03_Agent/state/panelSession')
    const gateA = deferred<{ runId: string }>()
    const gateB = deferred<{ runId: string }>()
    agentRun.mockReturnValueOnce(gateA.promise).mockReturnValueOnce(gateB.promise)
    const a = renderHook(() => usePanelSlot('one', 0))
    const b = renderHook(() => usePanelSlot('one', 1))
    let sendA!: Promise<void>
    let sendB!: Promise<void>
    act(() => { sendA = a.result.current.send('a'); sendB = b.result.current.send('b') })
    a.unmount()
    act(() => { disposePanelManagerSession(panelKey('one', 0)) })
    await act(async () => {
      gateA.resolve({ runId: 'run-a' })
      gateB.resolve({ runId: 'run-b' })
      await Promise.all([sendA, sendB])
    })
    expect(agentAbort).toHaveBeenCalledTimes(1)
    expect(agentAbort).toHaveBeenCalledWith({ runId: 'run-a' })
    expect(sessionRegistry.has(panelKey('one', 0))).toBe(false)
    expect(b.result.current.state.currentRunId).toBe('run-b')
  })

  it('폐기하지 않은 패널은 지금처럼 SET_RUN_ID로 run이 붙고 중단 호출이 없다', async () => {
    agentRun.mockResolvedValueOnce({ runId: 'run-live' })
    const { result } = renderHook(() => usePanelSlot('live', 0))
    await act(async () => { await result.current.send('hi') })
    expect(result.current.state.currentRunId).toBe('run-live')
    expect(sessionRegistry.lookup('run-live')).toBe(panelKey('live', 0))
    expect(agentAbort).not.toHaveBeenCalled()
  })
})
