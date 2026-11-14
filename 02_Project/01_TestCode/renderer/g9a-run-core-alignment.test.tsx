// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { AgentEventPayload } from '@shared/ipcContract'
import type { AgentEvent } from '@shared/agentEvents'
import {
  usePanelSlot,
  makePanelInitialState,
  makePanelSlotKey,
  panelSlotKeyPrefix,
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

describe('E4 — 엔진에 보내는 프롬프트에 @멘션을 첨부한다(단일 규칙)', () => {
  function lastEngineContent(): string {
    const call = mockApi.agentRun.mock.calls[mockApi.agentRun.mock.calls.length - 1][0] as {
      messages: { role: string; content: string }[]
    }
    return call.messages[call.messages.length - 1].content
  }

  it('본문의 @경로가 멘션 노트로 붙고, 화면의 사용자 메시지는 원문 그대로다', async () => {
    const { result } = renderHook(() => usePanelSlot('sess-e4', 0))
    await act(async () => {
      await result.current.send('@src/a.ts 이 파일 봐줘')
    })
    const content = lastEngineContent()
    expect(content.startsWith('@src/a.ts 이 파일 봐줘')).toBe(true)
    expect(content).toContain('[멘션된 파일 — 필요하면 Read 도구로 확인하세요]')
    expect(content).toContain('- src/a.ts')
    expect(msgs(result.current.state.thread)[0].text).toBe('@src/a.ts 이 파일 봐줘')
  })

  it('멘션과 첨부 이미지가 함께 있으면 두 노트를 다 붙인다', async () => {
    const { result } = renderHook(() => usePanelSlot('sess-e4', 2))
    await act(async () => {
      await result.current.send('@b.ts 와 그림', {
        images: [{ path: '/tmp/y.png', dataUrl: 'data:image/png;base64,BB' }],
      })
    })
    const content = lastEngineContent()
    expect(content).toContain('- b.ts')
    expect(content).toContain('- /tmp/y.png')
  })

  it('/로 시작하면 멘션·이미지 노트 없이 원문을 보낸다', async () => {
    const { result } = renderHook(() => usePanelSlot('sess-e4', 1))
    await act(async () => {
      await result.current.send('/unknown @src/a.ts', {
        images: [{ path: '/tmp/x.png', dataUrl: 'data:image/png;base64,AA' }],
      })
    })
    expect(lastEngineContent()).toBe('/unknown @src/a.ts')
  })
})

describe('E5 — REPL 세션키는 세션 자기 키 하나(단일 규칙: 호출부가 넘기지 않는다)', () => {
  it('패널 키는 앱 형식 multi:<세션>:slot:<n> 하나다', () => {
    expect(makePanelSlotKey('s1', 0)).toBe('multi:s1:slot:0')
    expect(panelSlotKeyPrefix('s1')).toBe('multi:s1:slot:')
    expect(makePanelSlotKey('s1', 3).startsWith(panelSlotKeyPrefix('s1'))).toBe(true)
    expect(makePanelSlotKey('s10', 0).startsWith(panelSlotKeyPrefix('s1'))).toBe(false)
  })

  it('REPL 켜진 패널은 자기 키로 persistent 실행을 연다', async () => {
    const { result } = renderHook(() => usePanelSlot('sess-e5', 2))
    act(() => {
      result.current.setReplMode(true)
    })
    await act(async () => {
      await result.current.send('안녕')
    })
    const req = mockApi.agentRun.mock.calls[0][0]
    expect(req.persistent).toBe(true)
    expect(req.sessionKey).toBe('multi:sess-e5:slot:2')
    expect(req.sessionKey).toBe(makePanelSlotKey('sess-e5', 2))
  })

  it('호출부가 옛 방식으로 세션키를 실어 보내도 무시하고 자기 키를 쓴다', async () => {
    const { result } = renderHook(() => usePanelSlot('sess-e5', 1))
    act(() => {
      result.current.setReplMode(true)
    })
    const legacy = { persistent: true, sessionKey: 'sess-e5::1', resumeSessionId: 'stale' } as unknown as Parameters<typeof result.current.send>[1]
    await act(async () => {
      await result.current.send('안녕', legacy)
    })
    const req = mockApi.agentRun.mock.calls[0][0]
    expect(req.sessionKey).toBe('multi:sess-e5:slot:1')
    expect(req.resumeSessionId).toBeUndefined()
  })

  it('패널 키 형식은 ultracode 범위키와 같은 문자열이다(키 하나)', () => {
    expect(makePanelSlotKey('m-1', 4)).toBe(`multi:${'m-1'}:slot:${4}`)
  })

  it('PanelView는 세션키를 send에 싣지 않고, 범위키도 makePanelSlotKey로 만든다', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../02_Project/00_Source/renderer/src/05_Conversation/PanelView.tsx'),
      'utf-8',
    )
    expect(src).not.toMatch(/sessionKey:\s*panelSessionKey/)
    expect(src).toContain('makePanelSlotKey(')
  })

  it('REPL 꺼진 패널은 persistent·sessionKey 없이 단발로 연다', async () => {
    const { result } = renderHook(() => usePanelSlot('sess-e5', 3))
    act(() => {
      result.current.setReplMode(false)
    })
    await act(async () => {
      await result.current.send('안녕')
    })
    const req = mockApi.agentRun.mock.calls[0][0]
    expect(req.persistent).toBeUndefined()
    expect(req.sessionKey).toBeUndefined()
  })
})

// E8 정렬로 RunCorePolicy가 비었다 — 코어에 단일·멀티 분기 옵션이 남지 않는다.
describe('E8 — 중단하면 열린 응답 메시지에 「중단됨」을 단다(단일과 같음)', () => {
  it('스트리밍 중 abort → 열린 assistant 메시지가 interrupted로 남는다', async () => {
    const { result } = renderHook(() => usePanelSlot('sess-e8', 0))
    await act(async () => {
      await result.current.send('질문')
    })
    act(() => {
      emit('run-1', { type: 'text', delta: '답하는 중', messageId: 'a-1' })
    })
    expect(result.current.state.openMsgId).toBe('a-1')
    await act(async () => {
      await result.current.abort()
    })
    expect(mockApi.agentAbort).toHaveBeenCalledWith({ runId: 'run-1' })
    const assistant = msgs(result.current.state.thread).find((m) => m.role === 'assistant')
    expect(assistant?.interrupted).toBe(true)
    expect(result.current.state.isRunning).toBe(false)
  })

  it('열린 메시지가 없으면(대기 중) 사용자 메시지는 건드리지 않는다', async () => {
    const { result } = renderHook(() => usePanelSlot('sess-e8', 1))
    await act(async () => {
      await result.current.send('질문')
    })
    await act(async () => {
      await result.current.abort()
    })
    expect(msgs(result.current.state.thread).every((m) => m.interrupted === undefined)).toBe(true)
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
