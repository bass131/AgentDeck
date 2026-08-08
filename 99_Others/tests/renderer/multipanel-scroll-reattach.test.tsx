// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { useAppStore } from '../../../02_Source/renderer/src/store/appStore'
import { __resetPanelSessionManagerForTests } from '../../../02_Source/renderer/src/store/panelSession'

let runIdCounter = 0
let capturedEventCallbacks: Array<(payload: unknown) => void> = []

function emitAgentEvent(runId: string, event: Record<string, unknown>): void {
  capturedEventCallbacks.forEach((cb) => cb({ runId, event }))
}

const mockApi = {
  agentRun: vi.fn().mockImplementation(() => {
    const runId = `run-${runIdCounter}`
    runIdCounter++
    return Promise.resolve({ runId })
  }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  agentInterrupt: vi.fn().mockResolvedValue({}),
  onAgentEvent: vi.fn().mockImplementation((cb: (payload: unknown) => void) => {
    capturedEventCallbacks.push(cb)
    return vi.fn()
  }),
  permissionRespond: vi.fn().mockResolvedValue({ ok: true }),
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  multiSessionLoad: vi.fn().mockResolvedValue({ state: null }),
  workspaceOpen: vi.fn().mockResolvedValue({ root: null, tree: null }),
  pickFolder: vi.fn().mockResolvedValue({ path: null }),
  getUsage: vi.fn().mockResolvedValue({ fiveHour: null, weekly: null }),
  getProfile: vi.fn().mockResolvedValue({}),
  listSlashCommands: vi.fn().mockResolvedValue([]),
  listSkills: vi.fn().mockResolvedValue([]),
  readDir: vi.fn().mockResolvedValue([]),
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

beforeEach(() => {
  vi.clearAllMocks()
  runIdCounter = 0
  capturedEventCallbacks = []
  mockApi.agentRun.mockImplementation(() => {
    const runId = `run-${runIdCounter}`
    runIdCounter++
    return Promise.resolve({ runId })
  })
  mockApi.onAgentEvent.mockImplementation((cb: (payload: unknown) => void) => {
    capturedEventCallbacks.push(cb)
    return vi.fn()
  })
  __resetPanelSessionManagerForTests()
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ workspaceMode: 'single', workspaceRoot: null })
})

async function renderMultiWorkspace() {
  useAppStore.setState({ workspaceRoot: '/test/workspace', workspaceMode: 'multi' })
  const { MultiWorkspace } = await import('../../../02_Source/renderer/src/features/shell/MultiWorkspace')
  const { container } = render(<MultiWorkspace />)
  return container
}

async function sendFromPanel(container: Element, slot: number, text: string): Promise<string> {
  const panel = container.querySelector(`.ma-panel[data-slot="${slot}"]`) as HTMLElement
  const ta = panel.querySelector('textarea') as HTMLTextAreaElement
  const before = mockApi.agentRun.mock.calls.length
  await act(async () => {
    fireEvent.change(ta, { target: { value: text } })
  })
  await act(async () => {
    fireEvent.keyDown(ta, { key: 'Enter' })
  })
  await act(async () => { await Promise.resolve() })
  const callIdx = before
  const result = await mockApi.agentRun.mock.results[callIdx].value
  return result.runId
}

function setScrollHeight(el: HTMLElement, value: number): void {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value })
}
function setClientHeight(el: HTMLElement, value: number): void {
  Object.defineProperty(el, 'clientHeight', { configurable: true, value })
}

describe('MultiWorkspace — 패널 자동 스크롤(.ma-p-thread) 이식', () => {
  it('신규 텍스트 도착 시 바닥까지 자동 스크롤된다', async () => {
    const container = await renderMultiWorkspace()
    const runId0 = await sendFromPanel(container, 0, '테스트')
    const panel0 = container.querySelector('.ma-panel[data-slot="0"]') as HTMLElement
    const threadEl = panel0.querySelector('.ma-p-thread') as HTMLElement
    expect(threadEl).toBeTruthy()

    setClientHeight(threadEl, 200)
    setScrollHeight(threadEl, 500)

    act(() => {
      emitAgentEvent(runId0, { type: 'text', delta: 'hello' })
    })

    expect(threadEl.scrollTop).toBe(500)
  })

  it('사용자가 위로 스크롤한(바닥에서 41px 이상 이탈) 뒤에는 신규 텍스트가 와도 강제로 끌어내리지 않는다', async () => {
    const container = await renderMultiWorkspace()
    const runId0 = await sendFromPanel(container, 0, '테스트')
    const panel0 = container.querySelector('.ma-panel[data-slot="0"]') as HTMLElement
    const threadEl = panel0.querySelector('.ma-p-thread') as HTMLElement

    setClientHeight(threadEl, 200)
    setScrollHeight(threadEl, 500)
    act(() => {
      emitAgentEvent(runId0, { type: 'text', delta: 'hello' })
    })
    expect(threadEl.scrollTop).toBe(500)

    threadEl.scrollTop = 100
    act(() => {
      fireEvent.scroll(threadEl)
    })

    setScrollHeight(threadEl, 700)
    act(() => {
      emitAgentEvent(runId0, { type: 'text', delta: ' world' })
    })

    expect(threadEl.scrollTop).toBe(100)
  })

  it('사용자가 바닥 근처(40px 이내)로 되돌아오면 다음 신규 메시지부터 다시 자동 스크롤이 붙는다(재부착)', async () => {
    const container = await renderMultiWorkspace()
    const runId0 = await sendFromPanel(container, 0, '테스트')
    const panel0 = container.querySelector('.ma-panel[data-slot="0"]') as HTMLElement
    const threadEl = panel0.querySelector('.ma-p-thread') as HTMLElement

    setClientHeight(threadEl, 200)
    setScrollHeight(threadEl, 500)
    act(() => {
      emitAgentEvent(runId0, { type: 'text', delta: 'a' })
    })
    expect(threadEl.scrollTop).toBe(500)

    threadEl.scrollTop = 100
    act(() => {
      fireEvent.scroll(threadEl)
    })
    setScrollHeight(threadEl, 600)
    act(() => {
      emitAgentEvent(runId0, { type: 'text', delta: 'b' })
    })
    expect(threadEl.scrollTop).toBe(100)

    threadEl.scrollTop = 380
    act(() => {
      fireEvent.scroll(threadEl)
    })

    setScrollHeight(threadEl, 800)
    act(() => {
      emitAgentEvent(runId0, { type: 'text', delta: 'c' })
    })

    expect(threadEl.scrollTop).toBe(800)
  })

  it('사용자가 위로 스크롤한 상태여도, 직접 새 메시지를 보내면 다시 바닥으로 따라간다(전송 시 강제 리셋 — 단일챗 sendNow와 동형)', async () => {
    const container = await renderMultiWorkspace()
    const runId0 = await sendFromPanel(container, 0, '테스트')
    const panel0 = container.querySelector('.ma-panel[data-slot="0"]') as HTMLElement
    const threadEl = panel0.querySelector('.ma-p-thread') as HTMLElement

    setClientHeight(threadEl, 200)
    setScrollHeight(threadEl, 500)
    act(() => {
      emitAgentEvent(runId0, { type: 'text', delta: 'a' })
    })

    threadEl.scrollTop = 100
    act(() => {
      fireEvent.scroll(threadEl)
    })

    act(() => {
      emitAgentEvent(runId0, { type: 'done' })
    })

    setScrollHeight(threadEl, 900)
    await sendFromPanel(container, 0, '두번째 메시지')

    expect(threadEl.scrollTop).toBe(900)
  })
})
