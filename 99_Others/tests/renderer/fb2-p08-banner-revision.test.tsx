// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { useAppStore } from '../../../02_Source/renderer/src/store/appStore'
import { __resetPanelSessionManagerForTests } from '../../../02_Source/renderer/src/store/panelSession'

function readSrc(relPath: string): string {
  return readFileSync(resolve(__dirname, '../../../02_Source/renderer/src', relPath), 'utf-8')
}

describe('FB2 P08② — LoopStatusBanner ↔ ContextStrip 폭 정합(토큰 공유)', () => {
  it('tokens.css가 --composer-max-w/--composer-pad-x를 정의한다', () => {
    const css = readSrc('theme/tokens.css')
    expect(css).toMatch(/--composer-max-w:\s*760px/)
    expect(css).toMatch(/--composer-pad-x:\s*28px/)
  })

  it('Composer.css(.composer-inner/.composer-wrap)가 리터럴이 아니라 공유 토큰을 참조한다', () => {
    const css = readSrc('features/conversation/Composer.css')
    expect(css).toContain('max-width: var(--composer-max-w)')
    expect(css).toContain('var(--composer-pad-x)')
    expect(css).not.toMatch(/max-width:\s*760px/)
  })

  it('LoopStatusBanner.css(.conversation > .loop-indicator)가 같은 토큰으로 최종 폭을 계산한다', () => {
    const css = readSrc('features/notice/LoopStatusBanner.css')
    expect(css).toContain('.conversation > .loop-indicator')
    expect(css).toContain('var(--composer-max-w)')
    expect(css).toContain('var(--composer-pad-x)')
  })

  it('멀티패널 변형(.ma-p-body 자식)은 이 폭 규칙의 영향을 받지 않는다 — 선택자가 .conversation 한정', () => {
    const css = readSrc('features/notice/LoopStatusBanner.css')
    expect(css).not.toContain('.ma-p-body > .loop-indicator')
    expect(css).not.toContain('.ma-p-body .loop-indicator')
  })
})

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
  const { MultiWorkspace } = await import('../../../02_Source/renderer/src/components/00_shell/MultiWorkspace')
  const { container } = render(<MultiWorkspace />)
  return container
}

describe('FB2 P08⑥ — 멀티패널 loop 배너 위치: .ma-p-body 하단(.ma-p-foot 밖)', () => {
  it('activeLoops 수신 시 배너가 .ma-p-body 안(.ma-p-thread 다음)에 렌더되고 .ma-p-foot 안에는 없다', async () => {
    const container = await renderMultiWorkspace()

    const textarea = container.querySelector('textarea')
    expect(textarea).toBeTruthy()
    if (!textarea) return

    await act(async () => {
      fireEvent.change(textarea, { target: { value: '/loop 1m 상태 점검' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })

    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)

    act(() => {
      emitAgentEvent('run-0', {
        type: 'loops',
        loops: [{ id: 'loop-1', summary: '상태 점검', interval: 'Every minute' }],
      })
    })

    const panel = container.querySelector('.ma-panel')
    expect(panel).toBeTruthy()

    const banner = panel?.querySelector('.loop-indicator.loop-sdk')
    expect(banner).toBeTruthy()

    expect(panel?.querySelector('.ma-p-body .loop-indicator')).toBeTruthy()
    expect(panel?.querySelector('.ma-p-foot .loop-indicator')).toBeNull()

    const body = panel?.querySelector('.ma-p-body')
    const thread = body?.querySelector('.ma-p-thread')
    expect(thread).toBeTruthy()
    if (thread && banner) {
      const position = thread.compareDocumentPosition(banner)
      // eslint-disable-next-line no-bitwise
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })
})
