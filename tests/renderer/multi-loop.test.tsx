// @vitest-environment jsdom
/**
 * multi-loop.test.tsx — 멀티 패널 앱 레벨 /loop (드라이버 docs/LOOP_SUPPORT.md, 5단계).
 *
 * 패널별 독립 루프(usePanelSession 격리 정합). PanelView 컴포넌트 로컬 상태(panelReducer 무관).
 *   - /loop 30s do X → SDK엔 내부 프롬프트만(누수 0) + 패널 .loop-indicator 표시.
 *   - /loop stop → SDK 호출 0.
 *   - 패널 격리: 패널1 루프가 패널2 인디케이터에 영향 0.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'

const mockApi = {
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
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  agentRun: vi.fn().mockResolvedValue({ runId: 'run-1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  multiSessionLoad: vi.fn().mockResolvedValue({ state: null }),
  multiSessionSave: vi.fn().mockResolvedValue({ ok: true }),
  pickFolder: vi.fn().mockResolvedValue({ path: null }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.multiSessionLoad.mockResolvedValue({ state: null })
  mockApi.agentRun.mockResolvedValue({ runId: 'run-1' })
  mockApi.onAgentEvent.mockReturnValue(() => {})
})
afterEach(() => cleanup())

async function renderMW() {
  const { useAppStore } = await import('../../src/renderer/src/store/appStore')
  // 앱 레벨 /loop 인터셉트는 단발 모드(replMode OFF)에서만 동작(ADR-024 5a). 이 테스트는
  // 단발 폴백 인터셉트를 검증하므로 replMode:false 명시(REPL ON이면 /loop는 SDK 통과).
  useAppStore.setState({ workspaceRoot: '/test/workspace', replMode: false })
  const { MultiWorkspace } = await import('../../src/renderer/src/components/00_shell/MultiWorkspace')
  const { container } = render(<MultiWorkspace />)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
  return container
}

async function sendInPanel(panel: HTMLElement, text: string) {
  const ta = panel.querySelector('textarea') as HTMLTextAreaElement
  await act(async () => {
    fireEvent.change(ta, { target: { value: text } })
  })
  const sendBtn = panel.querySelector('.ma-send') as HTMLButtonElement
  await act(async () => {
    fireEvent.click(sendBtn)
  })
}

describe('멀티 패널 — /loop 인터셉트 (🔴#1 SDK 누수 차단)', () => {
  it('/loop 30s do X → SDK엔 내부 프롬프트(do X)만, /loop 누수 0', async () => {
    const container = await renderMW()
    const panel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    await sendInPanel(panel, '/loop 30s do X')

    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)
    const arg = mockApi.agentRun.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }
    const last = arg.messages[arg.messages.length - 1]
    expect(last.content).toBe('do X')
    expect(JSON.stringify(arg.messages)).not.toContain('/loop')
  })

  it('/loop 30s do X → 패널에 .loop-indicator 표시', async () => {
    const container = await renderMW()
    const panel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    await sendInPanel(panel, '/loop 30s do X')
    expect(panel.querySelector('.loop-indicator')).toBeTruthy()
  })

  it('/loop stop → SDK 호출 0', async () => {
    const container = await renderMW()
    const panel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    await sendInPanel(panel, '/loop stop')
    expect(mockApi.agentRun).not.toHaveBeenCalled()
  })
})

describe('멀티 패널 — REPL 모드 /loop SDK 통과 (ADR-024 5a)', () => {
  async function renderMWRepl() {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    // REPL ON(기본) — /loop가 인터셉트되지 않고 SDK로 통과(Claude 자기제어).
    useAppStore.setState({ workspaceRoot: '/test/workspace', replMode: true })
    const { MultiWorkspace } = await import('../../src/renderer/src/components/00_shell/MultiWorkspace')
    const { container } = render(<MultiWorkspace />)
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    return container
  }

  it('replMode ON → /loop가 SDK로 통과(원문 그대로) + 앱레벨 인디케이터 0 + persistent 전송', async () => {
    const container = await renderMWRepl()
    const panel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    await sendInPanel(panel, '/loop 30s do X')

    // 인터셉트 안 함 → 원문이 SDK로
    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)
    const arg = mockApi.agentRun.mock.calls[0][0] as { messages: Array<{ content: string }>; persistent?: boolean; sessionKey?: string }
    expect(arg.messages[arg.messages.length - 1].content).toBe('/loop 30s do X')
    // 앱 레벨 루프 인디케이터 미표시(SDK 내장 처리)
    expect(panel.querySelector('.loop-indicator')).toBeFalsy()
    // persistent + 패널 sessionKey 동반
    expect(arg.persistent).toBe(true)
    expect(typeof arg.sessionKey).toBe('string')
  })
})

describe('멀티 패널 — 루프 격리 (Q2)', () => {
  it('패널1 루프 시작 → 패널2 인디케이터 영향 0', async () => {
    const container = await renderMW()
    const panels = Array.from(container.querySelectorAll('.ma-panel:not(.ma-placeholder)')) as HTMLElement[]
    expect(panels.length).toBeGreaterThanOrEqual(2)

    await sendInPanel(panels[0], '/loop 1m do X')

    expect(panels[0].querySelector('.loop-indicator')).toBeTruthy()
    expect(panels[1].querySelector('.loop-indicator')).toBeNull()
  })
})
