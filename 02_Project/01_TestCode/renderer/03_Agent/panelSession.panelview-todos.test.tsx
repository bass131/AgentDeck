// 작업 ID: gap1-p01 · 옛 이름 gap1-p01-panelview-todos.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { useAppStore } from '@renderer/00_App/appStore'
import { __resetPanelSessionManagerForTests } from '@renderer/03_Agent/state/panelSession'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

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

Object.defineProperty(window, 'api', { value: adaptFlatApi(mockApi), writable: true, configurable: true })

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

// M10 G1 — 멀티 화면을 지웠다. 패널 기계(usePanelSlot + PanelView)를 패널 하네스로 그려 같은 동작을 본다.
async function renderPanels() {
  useAppStore.setState({ workspaceRoot: '/test/workspace' })
  const { PanelHarness } = await import('../00_Helpers/panelHarness')
  const { container } = render(<PanelHarness sessionId="panelview-todos" />)
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

describe('PanelView — todos 마운트 (GAP1 P01b, T-08)', () => {
  it('todos 이벤트 도착 전에는 할 일 섹션이 없다(빈 상태 클러터 방지)', async () => {
    const container = await renderPanels()
    await sendFromPanel(container, 0, '테스트 메시지')

    const panel0 = container.querySelector('.ma-panel[data-slot="0"]') as HTMLElement
    expect(panel0.querySelector('.ag-sec')).toBeFalsy()
  })

  it('todos 이벤트 도착 → 패널에 할 일 섹션(.ag-sec) + 진행바(.progress) + 항목(.todo) 렌더', async () => {
    const container = await renderPanels()
    const runId0 = await sendFromPanel(container, 0, '테스트 메시지')

    act(() => {
      emitAgentEvent(runId0, {
        type: 'todos',
        todos: [
          { id: '1', label: '탐색', status: 'done' },
          { id: '2', label: '구현', status: 'running' },
          { id: '3', label: '검증', status: 'planned' },
        ],
      })
    })

    const panel0 = container.querySelector('.ma-panel[data-slot="0"]') as HTMLElement
    expect(panel0.querySelector('.ag-sec')).toBeTruthy()
    expect(panel0.querySelector('.progress')).toBeTruthy()
    expect(panel0.querySelectorAll('.todo').length).toBe(3)
    expect(panel0.querySelector('.ag-count')?.textContent).toContain('1/3')
  })

  it('다른 패널(슬롯1)은 영향받지 않는다 — 슬롯0만 todos 표시(교차오염 0)', async () => {
    const container = await renderPanels()
    const runId0 = await sendFromPanel(container, 0, '슬롯0 메시지')
    await sendFromPanel(container, 1, '슬롯1 메시지')

    act(() => {
      emitAgentEvent(runId0, {
        type: 'todos',
        todos: [{ id: '1', label: '탐색', status: 'running' }],
      })
    })

    const panel0 = container.querySelector('.ma-panel[data-slot="0"]') as HTMLElement
    const panel1 = container.querySelector('.ma-panel[data-slot="1"]') as HTMLElement
    expect(panel0.querySelector('.ag-sec')).toBeTruthy()
    expect(panel1.querySelector('.ag-sec')).toBeFalsy()
  })
})
