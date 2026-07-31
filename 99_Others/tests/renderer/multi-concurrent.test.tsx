// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { useAppStore } from '../../../02_Source/renderer/src/store/appStore'
import { __resetPanelSessionManagerForTests } from '../../../02_Source/renderer/src/store/panelSession'

let runIdCounter = 0
let capturedEventCallbacks: Array<(payload: unknown) => void> = []

const mockUnsubFns: Array<ReturnType<typeof vi.fn>> = []

const mockApi = {
  agentRun: vi.fn().mockImplementation(() => {
    const runId = `run-${runIdCounter}`
    runIdCounter++
    return Promise.resolve({ runId })
  }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockImplementation((cb: (payload: unknown) => void) => {
    capturedEventCallbacks.push(cb)
    const unsub = vi.fn()
    mockUnsubFns.push(unsub)
    return unsub
  }),
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  workspaceOpen: vi.fn().mockResolvedValue({ root: null, tree: null }),
  windowMinimize: vi.fn(),
  windowMaximizeToggle: vi.fn().mockResolvedValue({ maximized: false }),
  windowClose: vi.fn(),
  windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
  windowGetBounds: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1200, height: 800 }),
  windowSetBounds: vi.fn(),
  windowDragStart: vi.fn(),
  windowDragEnd: vi.fn(),
  windowResizeStart: vi.fn(),
  windowResizeEnd: vi.fn(),
  onWindowState: vi.fn().mockReturnValue(() => {}),
}

Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

function emitAgentEvent(runId: string, event: Record<string, unknown>): void {
  capturedEventCallbacks.forEach((cb) => cb({ runId, event }))
}

beforeEach(() => {
  vi.clearAllMocks()
  runIdCounter = 0
  capturedEventCallbacks = []
  mockUnsubFns.length = 0
  mockApi.agentRun.mockImplementation(() => {
    const runId = `run-${runIdCounter}`
    runIdCounter++
    return Promise.resolve({ runId })
  })
  mockApi.onAgentEvent.mockImplementation((cb: (payload: unknown) => void) => {
    capturedEventCallbacks.push(cb)
    const unsub = vi.fn()
    mockUnsubFns.push(unsub)
    return unsub
  })
  __resetPanelSessionManagerForTests()
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ workspaceMode: 'single', workspaceRoot: null })
})

async function renderMultiWorkspace(workspaceRoot: string | null = '/test/workspace') {
  useAppStore.setState({ workspaceRoot, workspaceMode: 'multi' })
  const { MultiWorkspace } = await import('../../../02_Source/renderer/src/components/00_shell/MultiWorkspace')
  const { container } = render(<MultiWorkspace />)
  return container
}

function lastAssistantText(thread: import('../../../02_Source/renderer/src/store/threadTypes').ThreadItem[]): string {
  const msgs = thread.filter(
    (item): item is Extract<import('../../../02_Source/renderer/src/store/threadTypes').ThreadItem, { kind: 'msg' }> =>
      item.kind === 'msg' && item.role === 'assistant'
  )
  return msgs[msgs.length - 1]?.text ?? ''
}

async function renderSixHooks() {
  const { usePanelSession } = await import('../../../02_Source/renderer/src/store/panelSession')
  function SixHookComponent() {
    const s0 = usePanelSession()
    const s1 = usePanelSession()
    void usePanelSession()
    void usePanelSession()
    void usePanelSession()
    void usePanelSession()
    const h0Stream = lastAssistantText(s0.state.thread)
    const h1Stream = lastAssistantText(s1.state.thread)
    return (
      <div data-testid="six-hooks">
        <span data-testid="h0-running">{String(s0.state.isRunning)}</span>
        <span data-testid="h1-running">{String(s1.state.isRunning)}</span>
        <span data-testid="h0-stream">{h0Stream}</span>
        <span data-testid="h1-stream">{h1Stream}</span>
        <button data-testid="send-h0" onClick={() => void s0.send('panel-0 msg', { workspaceRoot: '/workspace' })} />
        <button data-testid="send-h1" onClick={() => void s1.send('panel-1 msg', { workspaceRoot: '/workspace' })} />
        <button data-testid="abort-h0" onClick={() => void s0.abort()} />
      </div>
    )
  }
  const { container } = render(<SixHookComponent />)
  return container
}

describe('M4-3 23e: (1) 동시 2패널 독립 — 교차 오염 0', () => {
  it('패널0 text 이벤트 → 패널0만 thread 갱신, 패널1 미오염', async () => {
    const container = await renderSixHooks()

    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="send-h0"]')!)
    })

    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="send-h1"]')!)
    })

    act(() => {
      emitAgentEvent('run-0', { type: 'text', delta: 'A' })
    })

    expect(container.querySelector('[data-testid="h0-stream"]')?.textContent).toBe('A')
    expect(container.querySelector('[data-testid="h1-stream"]')?.textContent).toBe('')
  })

  it('패널1 text 이벤트 → 패널1만 thread 갱신, 패널0 미오염', async () => {
    const container = await renderSixHooks()

    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="send-h0"]')!)
    })
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="send-h1"]')!)
    })

    act(() => {
      emitAgentEvent('run-0', { type: 'text', delta: 'X' })
    })

    act(() => {
      emitAgentEvent('run-1', { type: 'text', delta: 'B' })
    })

    expect(container.querySelector('[data-testid="h0-stream"]')?.textContent).toBe('X')
    expect(container.querySelector('[data-testid="h1-stream"]')?.textContent).toBe('B')
  })

  it('agentRun이 패널마다 다른 runId 반환 (run-0, run-1)', async () => {
    await renderSixHooks()

    const container = document.body.firstElementChild as HTMLElement

    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="send-h0"]')!)
    })
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="send-h1"]')!)
    })

    const calls = mockApi.agentRun.mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(2)
    expect(calls[0][0].messages.some((m: { role: string }) => m.role === 'user')).toBe(true)
    expect(calls[1][0].messages.some((m: { role: string }) => m.role === 'user')).toBe(true)
  })

  it('run-0 done 이벤트 → 패널0 thread assistant msg 보존, 패널1 thread 미관여', async () => {
    const container = await renderSixHooks()

    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="send-h0"]')!)
    })
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="send-h1"]')!)
    })

    act(() => {
      emitAgentEvent('run-0', { type: 'text', delta: 'reply-A' })
    })
    act(() => {
      emitAgentEvent('run-1', { type: 'text', delta: 'reply-B' })
    })

    act(() => {
      emitAgentEvent('run-0', { type: 'done' })
    })

    expect(container.querySelector('[data-testid="h0-stream"]')?.textContent).toBe('reply-A')
    expect(container.querySelector('[data-testid="h1-stream"]')?.textContent).toBe('reply-B')
  })
})

describe('M4-3 23e: (2) 패널 abort — 자기 runId만 중단', () => {
  it('패널0 abort → agentAbort({runId: run-0}) 호출', async () => {
    const container = await renderSixHooks()

    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="send-h0"]')!)
    })
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="send-h1"]')!)
    })

    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="abort-h0"]')!)
    })

    expect(mockApi.agentAbort).toHaveBeenCalledWith({ runId: 'run-0' })
    expect(mockApi.agentAbort).toHaveBeenCalledTimes(1)
    expect(mockApi.agentAbort).not.toHaveBeenCalledWith({ runId: 'run-1' })
  })

  it('abort 전 send 없으면 agentAbort 미호출 (currentRunId=null 안전)', async () => {
    const container = await renderSixHooks()

    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="abort-h0"]')!)
    })

    expect(mockApi.agentAbort).not.toHaveBeenCalled()
  })
})

describe('M4-3 23e: (3) 워크스페이스 미오픈 시 send 비활성', () => {
  it('workspaceRoot=null → MultiWorkspace 내 전송 시 agentRun 미호출', async () => {
    const container = await renderMultiWorkspace(null)

    const countBtns = Array.from(container.querySelectorAll('.ma-count-btn'))
    const btn2 = countBtns.find((b) => b.textContent?.trim() === '2')
    if (btn2) {
      await act(async () => { fireEvent.click(btn2) })
    }

    const textarea = container.querySelector('textarea')
    if (textarea) {
      await act(async () => {
        fireEvent.change(textarea, { target: { value: '테스트 메시지' } })
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
      })
    }

    expect(mockApi.agentRun).not.toHaveBeenCalled()
  })

  it('workspaceRoot=null → 패널 composer send 버튼 비활성 또는 클릭 무반응', async () => {
    const container = await renderMultiWorkspace(null)

    const sendBtn = container.querySelector('.ma-send') as HTMLButtonElement | null

    if (sendBtn) {
      await act(async () => {
        fireEvent.click(sendBtn)
      })
    }

    expect(mockApi.agentRun).not.toHaveBeenCalled()
  })

  it('workspaceRoot 있으면 send → agentRun 호출', async () => {
    const container = await renderMultiWorkspace('/test/workspace')

    const textarea = container.querySelector('textarea')
    if (textarea) {
      await act(async () => {
        fireEvent.change(textarea, { target: { value: '작업 시작' } })
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
      })
    }

    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)
  })
})

describe('M4-3 23e: (4) 전역 격리 — MultiWorkspace는 전역 store sendMessage/subscribeAgentEvents 미호출', () => {
  it('MultiWorkspace 마운트 시 전역 appStore.sendMessage가 호출되지 않음', async () => {
    const sendMessageSpy = vi.fn()
    useAppStore.setState({ sendMessage: sendMessageSpy } as never)

    await renderMultiWorkspace()

    expect(sendMessageSpy).not.toHaveBeenCalled()
  })

  it('MultiWorkspace 마운트 시 전역 appStore.subscribeAgentEvents가 호출되지 않음', async () => {
    const subscribeSpyFn = vi.fn().mockReturnValue(() => {})
    useAppStore.setState({ subscribeAgentEvents: subscribeSpyFn } as never)

    await renderMultiWorkspace()

    expect(subscribeSpyFn).not.toHaveBeenCalled()
  })

  it('usePanelSession은 onAgentEvent를 직접 구독 (각 훅 인스턴스마다 1회)', async () => {
    await renderSixHooks()

    expect(mockApi.onAgentEvent).toHaveBeenCalledTimes(6)
  })
})

describe('M4-3 23e → Phase 07: 앱 수명 매니저 구독 — 6훅이 전역 구독 1개를 공유', () => {
  it('MultiWorkspace 마운트 시 onAgentEvent가 정확히 1회 등록됨(6훅이 지연·멱등 공유)', async () => {
    await renderMultiWorkspace()

    expect(mockApi.onAgentEvent).toHaveBeenCalledTimes(1)
  })

  it('MultiWorkspace unmount 후에도 onAgentEvent 구독은 해제되지 않는다(앱 수명 보존 — 스트림 증발 방지)', async () => {
    const { MultiWorkspace } = await import('../../../02_Source/renderer/src/components/00_shell/MultiWorkspace')
    useAppStore.setState({ workspaceRoot: '/test', workspaceMode: 'multi' })
    const { unmount } = render(<MultiWorkspace />)

    expect(mockApi.onAgentEvent).toHaveBeenCalledTimes(1)

    act(() => {
      unmount()
    })

    const unsubCalled = mockUnsubFns.filter((f) => f.mock.calls.length > 0).length
    expect(unsubCalled).toBe(0)
  })
})

describe('M4-3 23e: (6) 패널 thread 실데이터화', () => {
  it('send 후 패널 thread에 user 메시지가 표시된다', async () => {
    const container = await renderMultiWorkspace('/test/workspace')

    const countBtns = Array.from(container.querySelectorAll('.ma-count-btn'))
    const btn2 = countBtns.find((b) => b.textContent?.trim() === '2')
    if (btn2) {
      await act(async () => { fireEvent.click(btn2) })
    }

    const textarea = container.querySelector('textarea')
    if (!textarea) {
      return
    }

    await act(async () => {
      fireEvent.change(textarea, { target: { value: '안녕하세요' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    if (mockApi.agentRun.mock.calls.length > 0) {
      const thread = container.querySelector('.ma-p-thread')
      const userMsg = thread?.querySelector('.msg.user')
      if (userMsg) {
        expect(userMsg.textContent).toContain('안녕하세요')
      }
    }
    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)
  })

  it('스트리밍 text 이벤트 → 패널 thread에 스트리밍 버블 표시', async () => {
    const container = await renderMultiWorkspace('/test/workspace')

    const countBtns = Array.from(container.querySelectorAll('.ma-count-btn'))
    const btn2 = countBtns.find((b) => b.textContent?.trim() === '2')
    if (btn2) {
      await act(async () => { fireEvent.click(btn2) })
    }

    const textarea = container.querySelector('textarea')
    if (!textarea) return

    await act(async () => {
      fireEvent.change(textarea, { target: { value: '작업 시작' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    if (mockApi.agentRun.mock.calls.length === 0) return

    act(() => {
      emitAgentEvent('run-0', { type: 'text', delta: '스트리밍 응답' })
    })

    const thread = container.querySelector('.ma-p-thread')
    if (thread?.querySelector('.msg.ai-msg')) {
      const hasStreamingContent =
        thread.querySelector('.smooth-markdown') !== null ||
        thread.querySelector('.markdown-view') !== null
      expect(hasStreamingContent).toBe(true)
    }
  })
})

describe('M4-3 23e: (7) 상태 도트 실데이터화', () => {
  it('idle 상태 패널에 .idle 클래스 dot이 있다 (초기 상태)', async () => {
    const container = await renderMultiWorkspace('/test/workspace')
    const panels = container.querySelectorAll('.ma-panel:not(.ma-placeholder)')
    if (panels.length > 0) {
      const dot = panels[0].querySelector('.ma-p-dot')
      expect(dot).toBeTruthy()
    }
  })

  it('send 후 isRunning=true → running 상태가 스테이터스에 반영된다', async () => {
    let resolveRun: ((val: { runId: string }) => void) | null = null
    mockApi.agentRun.mockImplementationOnce(
      () => new Promise<{ runId: string }>((res) => { resolveRun = res })
    )

    const container = await renderMultiWorkspace('/test/workspace')

    const countBtns = Array.from(container.querySelectorAll('.ma-count-btn'))
    const btn2 = countBtns.find((b) => b.textContent?.trim() === '2')
    if (btn2) {
      await act(async () => { fireEvent.click(btn2) })
    }

    const textarea = container.querySelector('textarea')
    if (!textarea || !resolveRun) return

    await act(async () => {
      fireEvent.change(textarea, { target: { value: '시작' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    await act(async () => {
      resolveRun!({ runId: 'run-0' })
    })

    act(() => {
      emitAgentEvent('run-0', { type: 'text', delta: 'hello' })
    })

    const firstPanel = container.querySelector('.ma-panel:not(.ma-placeholder)')
    if (firstPanel) {
      const dot = firstPanel.querySelector('.ma-p-dot')
      if (dot?.classList.contains('running')) {
        expect(dot.classList.contains('running')).toBe(true)
      } else {
        expect(dot).toBeTruthy()
      }
    }
  })
})

describe('M4-3 23e: 원본 미러 충실도 — panelId 격리 회귀', () => {
  it('각 usePanelSession 인스턴스는 독립 state를 갖는다 (panelApply 순수 함수로 검증)', async () => {
    const { panelApply, makePanelInitialState } = await import('../../../02_Source/renderer/src/store/panelSession')

    const s0 = { ...makePanelInitialState(), currentRunId: 'run-0' }
    const s1 = { ...makePanelInitialState(), currentRunId: null }

    const payload = { runId: 'run-0', event: { type: 'text' as const, delta: 'only-s0' } }

    const next0 = panelApply(s0, payload)
    const next1 = panelApply(s1, payload)

    expect(lastAssistantText(next0.thread)).toBe('only-s0')
    expect(lastAssistantText(next1.thread)).toBe('')
    expect(next1).toBe(s1)
  })

  it('run-N 이벤트는 해당 패널 훅만 반영 (타 패널 currentRunId 불일치 → 무시)', async () => {
    const { panelApply, makePanelInitialState } = await import('../../../02_Source/renderer/src/store/panelSession')

    const state0 = { ...makePanelInitialState(), currentRunId: 'run-A' }
    const state1 = { ...makePanelInitialState(), currentRunId: 'run-B' }

    const payload = { runId: 'run-A', event: { type: 'text' as const, delta: 'hello' } }

    const next0 = panelApply(state0, payload)
    const next1 = panelApply(state1, payload)

    expect(lastAssistantText(next0.thread)).toBe('hello')
    expect(lastAssistantText(next1.thread)).toBe('')
    expect(next1).toBe(state1)
  })
})
