// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import type { AgentEventPayload } from '@shared/ipcContract'
import type { AgentEvent } from '@shared/agentEvents'
import {
  usePanelSlot,
  makePanelInitialState,
  __resetPanelSessionManagerForTests,
} from '@renderer/03_Agent/state/panelSession'
import { nextMsgId } from '@renderer/00_App/state/ids'
import type { ThreadItem } from '@renderer/05_Conversation/state/threadTypes'

// M05 G9a — 단일·멀티 실행 동작 정렬. 차이 목록(91_G9-차이-목록.md)의 E 항목마다 새 동작을 고정한다.
// 맞출 쪽은 단일(S)이고, E17만 멀티(M)다.

type Listener = (payload: AgentEventPayload) => void
const listeners: Listener[] = []

const mockApi = {
  onAgentEvent: vi.fn((cb: Listener) => {
    listeners.push(cb)
    return () => {
      const i = listeners.indexOf(cb)
      if (i >= 0) listeners.splice(i, 1)
    }
  }),
  agentRun: vi.fn(async (_req: { [k: string]: unknown }) => ({ runId: 'run-1' })),
  agentAbort: vi.fn(async () => ({ accepted: true })),
  agentInterrupt: vi.fn(async () => ({ accepted: true })),
  permissionRespond: vi.fn(async () => undefined),
  questionRespond: vi.fn(async () => undefined),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

function emit(runId: string, event: AgentEvent): void {
  for (const l of [...listeners]) l({ runId, event } as AgentEventPayload)
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function msgs(thread: ThreadItem[]): Extract<ThreadItem, { kind: 'msg' }>[] {
  return thread.filter((t): t is Extract<ThreadItem, { kind: 'msg' }> => t.kind === 'msg')
}

function idNumber(id: string): number {
  const m = /(\d+)$/.exec(id)
  return m ? Number(m[1]) : NaN
}

beforeEach(() => {
  vi.clearAllMocks()
  listeners.length = 0
  mockApi.agentRun.mockImplementation(async () => ({ runId: 'run-1' }))
  __resetPanelSessionManagerForTests()
})

afterEach(() => {
  cleanup()
})

describe('E7 — 명령 카드·메시지 id 생성기 하나(nextMsgId)', () => {
  it('패널 사용자 메시지 id는 앱 공용 생성기(msg-N)에서 나온다', async () => {
    const { result } = renderHook(() => usePanelSlot('sess-e7', 0))
    await act(async () => {
      await result.current.send('안녕')
    })
    const [user] = msgs(result.current.state.thread)
    expect(user.id).toMatch(/^msg-\d+$/)
    expect(idNumber(nextMsgId())).toBeGreaterThan(idNumber(user.id))
  })

  it('패널 명령 카드 id는 단일과 같은 cmd-msg-N 형식이다', async () => {
    const { result } = renderHook(() => usePanelSlot('sess-e7', 1))
    await act(async () => {
      await result.current.send('/goal 목표 한 줄')
    })
    const card = result.current.state.thread.find((t) => t.kind === 'cmdresult')
    expect(card?.id).toMatch(/^cmd-msg-\d+$/)
  })

  it('단일과 패널이 한 생성기를 나눠 써서 id가 서로 겹치지 않는다', async () => {
    const { result: a } = renderHook(() => usePanelSlot('sess-e7', 2))
    const { result: b } = renderHook(() => usePanelSlot('sess-e7', 3))
    await act(async () => {
      await a.current.send('하나')
      await b.current.send('둘')
    })
    const between = nextMsgId()
    const ids = [msgs(a.current.state.thread)[0].id, msgs(b.current.state.thread)[0].id, between]
    expect(new Set(ids).size).toBe(3)
  })

  it('복원된 패널 메시지도 같은 생성기에서 새 id를 받는다', () => {
    const restored = makePanelInitialState({
      messages: [{ id: 'old-1', role: 'user', text: 'a' }, { id: 'old-2', role: 'assistant', text: 'b' }],
      seq: 2,
    })
    const ids = restored.thread.map((t) => t.id)
    expect(ids.every((id) => /^msg-\d+$/.test(id))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('E1 — 실행 중 재전송은 무시한다(단일과 같음)', () => {
  it('패널이 실행 중이면 두 번째 send는 메시지도 agentRun도 만들지 않는다', async () => {
    const { result } = renderHook(() => usePanelSlot('sess-e1', 0))
    await act(async () => {
      await result.current.send('첫 요청')
    })
    expect(result.current.state.isRunning).toBe(true)
    await act(async () => {
      await result.current.send('실행 중 두 번째')
    })
    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)
    expect(msgs(result.current.state.thread).map((m) => m.text)).toEqual(['첫 요청'])
  })
})

describe('E3 — 전송하면 지난 오류를 지운다(단일과 같음)', () => {
  it('agentRun 실패로 남은 errorMessage가 다음 전송 시작과 함께 사라진다', async () => {
    const { result } = renderHook(() => usePanelSlot('sess-e3', 0))
    mockApi.agentRun.mockImplementationOnce(async () => { throw new Error('연결 실패') })
    await act(async () => {
      await result.current.send('실패할 요청')
    })
    expect(result.current.state.errorMessage).toBe('연결 실패')
    const gate = deferred<{ runId: string }>()
    mockApi.agentRun.mockImplementationOnce(() => gate.promise)
    let pending!: Promise<void>
    act(() => {
      pending = result.current.send('다시 요청')
    })
    expect(result.current.state.errorMessage).toBeUndefined()
    await act(async () => {
      gate.resolve({ runId: 'run-e3' })
      await pending
    })
  })
})

describe('E2 — 실행 세대 runGeneration으로 agentRun 대기 창을 지킨다(단일과 같음)', () => {
  it('대기 중 중단은 IPC를 보내지 않고, 실패하면 이전 세대로 돌아간다', async () => {
    const { result } = renderHook(() => usePanelSlot('sess-e2', 0))
    await act(async () => {
      await result.current.send('첫 run')
    })
    act(() => {
      emit('run-1', { type: 'done' })
    })
    const firstGeneration = result.current.state.runGeneration
    expect(typeof firstGeneration).toBe('string')
    expect(result.current.state.currentRunId).toBe('run-1')

    const gate = deferred<{ runId: string }>()
    mockApi.agentRun.mockImplementationOnce(() => gate.promise)
    let pending!: Promise<void>
    act(() => {
      pending = result.current.send('두 번째 run')
    })
    const pendingGeneration = result.current.state.runGeneration
    expect(pendingGeneration).not.toBeNull()
    expect(pendingGeneration).not.toBe(firstGeneration)

    await act(async () => {
      await result.current.abort()
    })
    expect(mockApi.agentAbort).not.toHaveBeenCalled()
    expect(result.current.state.isRunning).toBe(true)

    await act(async () => {
      gate.reject(new Error('agentRun 거절'))
      await pending
    })
    expect(result.current.state.runGeneration).toBe(firstGeneration)
    expect(result.current.state.errorMessage).toBe('agentRun 거절')
  })

  it('수립된 run의 중단은 세대를 지운다', async () => {
    const { result } = renderHook(() => usePanelSlot('sess-e2', 1))
    await act(async () => {
      await result.current.send('run')
    })
    await act(async () => {
      await result.current.abort()
    })
    expect(mockApi.agentAbort).toHaveBeenCalledWith({ runId: 'run-1' })
    expect(result.current.state.runGeneration).toBeNull()
  })

  it('새 패널과 복원 패널의 초기 세대는 null이다', () => {
    expect(makePanelInitialState().runGeneration).toBeNull()
    expect(makePanelInitialState({ messages: [{ id: 'a', role: 'user', text: 'x' }], seq: 1 }).runGeneration).toBeNull()
  })
})
