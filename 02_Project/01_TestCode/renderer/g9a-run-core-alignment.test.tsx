// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import {
  usePanelSlot,
  makePanelInitialState,
  __resetPanelSessionManagerForTests,
} from '@renderer/03_Agent/state/panelSession'
import { nextMsgId } from '@renderer/00_App/state/ids'
import type { ThreadItem } from '@renderer/05_Conversation/state/threadTypes'

// M05 G9a — 단일·멀티 실행 동작 정렬. 차이 목록(91_G9-차이-목록.md)의 E 항목마다 새 동작을 고정한다.
// 맞출 쪽은 단일(S)이고, E17만 멀티(M)다.

type Listener = (payload: unknown) => void
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
