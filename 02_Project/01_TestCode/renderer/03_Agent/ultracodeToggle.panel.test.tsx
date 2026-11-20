// @vitest-environment jsdom
// 패널 UltraCode 토글 — 옛 이름 ultracodeToggle.multi.test.tsx.
// M10 G1 — 멀티 화면을 지웠다. 패널 카드(PanelView)와 패널 세션 기계는 G3 세션 탭이 다시 쓰려고 남겼으므로 패널 하네스로 그린다.
// 옛 I 묶음(멀티 세션 저장 payload에 토글이 실리지 않는다)은 멀티 세션 저장과 함께 없어져 뺐다.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { __resetPanelSessionManagerForTests } from '@renderer/03_Agent/state/panelSession'
import { __resetUltracodeToggleForTests } from '@renderer/03_Agent/state/ultracodeToggle'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'
import { PanelHarness } from '../00_Helpers/panelHarness'

const mockApi = {
  windowMinimize: vi.fn(),
  windowMaximizeToggle: vi.fn().mockResolvedValue({ maximized: false }),
  windowClose: vi.fn(),
  windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
  windowDragStart: vi.fn(),
  windowDragEnd: vi.fn(),
  windowResizeStart: vi.fn(),
  windowResizeEnd: vi.fn(),
  onWindowState: vi.fn().mockReturnValue(() => {}),
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  agentRun: vi.fn().mockResolvedValue({ runId: 'run-1' }),
  agentAbort: vi.fn().mockResolvedValue({ ok: true }),
  agentInterrupt: vi.fn().mockResolvedValue({}),
  pickFolder: vi.fn().mockResolvedValue({ path: null }),
}
Object.defineProperty(window, 'api', { value: adaptFlatApi(mockApi), writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.agentRun.mockResolvedValue({ runId: 'run-1' })
  mockApi.onAgentEvent.mockReturnValue(() => {})
  __resetPanelSessionManagerForTests()
  __resetUltracodeToggleForTests()
})

afterEach(() => {
  cleanup()
})

async function renderPanels() {
  const { container } = render(<PanelHarness sessionId="uc-panels" />)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
  return container
}

describe('panel-ultracode-A: .orch-toggle 렌더', () => {
  it('패널 4개 각각에 .orch-toggle이 있다', async () => {
    const container = await renderPanels()
    const panels = container.querySelectorAll('.ma-panel')
    expect(panels.length).toBe(4)
    panels.forEach((panel) => {
      expect(panel.querySelector('.orch-toggle')).toBeTruthy()
    })
  })

  // G9b: 패널도 공용 입력창 바(.composer-bar) 안의 선택기 묶음을 쓴다.
  it('.orch-toggle은 입력창 바(.composer-bar) 안에 위치한다', async () => {
    const container = await renderPanels()
    const panel = container.querySelector('.ma-panel')!
    const pickers = panel.querySelector('.composer-bar')!
    expect(pickers.querySelector('.orch-toggle')).toBeTruthy()
  })
})

describe('panel-ultracode-B: 초기 ON 상태(UC1-P07)', () => {
  it('초기 UltraCode 토글은 .orch-on 클래스를 가진다(기본 ON)', async () => {
    const container = await renderPanels()
    const ultracodeToggles = Array.from(container.querySelectorAll('.orch-toggle')).filter(
      (el) => el.getAttribute('aria-label') === 'UltraCode 모드 토글'
    )
    expect(ultracodeToggles.length).toBeGreaterThan(0)
    ultracodeToggles.forEach((toggle) => {
      expect(toggle.classList.contains('orch-on')).toBe(true)
    })
  })

  it('초기 UltraCode aria-pressed="true"', async () => {
    const container = await renderPanels()
    const toggle = Array.from(container.querySelectorAll('.orch-toggle')).find(
      (el) => el.getAttribute('aria-label') === 'UltraCode 모드 토글'
    ) as HTMLButtonElement
    expect(toggle).toBeTruthy()
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
  })

  it('초기 UltraCode .orch-badge 텍스트는 "ON"', async () => {
    const container = await renderPanels()
    const toggle = Array.from(container.querySelectorAll('.orch-toggle')).find(
      (el) => el.getAttribute('aria-label') === 'UltraCode 모드 토글'
    )
    const badge = toggle?.querySelector('.orch-badge')
    expect(badge?.textContent?.trim()).toBe('ON')
  })
})

describe('panel-ultracode-C: 클릭 → OFF', () => {
  it('클릭 후 .orch-on 클래스가 제거된다', async () => {
    const container = await renderPanels()
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    expect(toggle.classList.contains('orch-on')).toBe(true)
    await act(async () => { fireEvent.click(toggle) })
    expect(toggle.classList.contains('orch-on')).toBe(false)
  })

  it('클릭 후 aria-pressed="false"', async () => {
    const container = await renderPanels()
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    await act(async () => { fireEvent.click(toggle) })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })

  it('클릭 후 .orch-badge 텍스트는 "OFF"', async () => {
    const container = await renderPanels()
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    await act(async () => { fireEvent.click(toggle) })
    const badge = toggle.querySelector('.orch-badge')
    expect(badge?.textContent?.trim()).toBe('OFF')
  })
})

describe('panel-ultracode-D: 재클릭 → ON 복귀', () => {
  it('OFF 후 재클릭 → .orch-on 복귀', async () => {
    const container = await renderPanels()
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    await act(async () => { fireEvent.click(toggle) })
    expect(toggle.classList.contains('orch-on')).toBe(false)
    await act(async () => { fireEvent.click(toggle) })
    expect(toggle.classList.contains('orch-on')).toBe(true)
  })
})

describe('panel-ultracode-E: 기본 ON + 전송 → session.send orchestration: true', () => {
  it('패널1의 토글 ON(기본, 클릭 없이) 상태로 전송 → agentRun 호출 args에 orchestration: true', async () => {
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ workspaceRoot: '/test/workspace' })

    const container = await renderPanels()
    const panel = container.querySelector('.ma-panel') as HTMLElement

    const toggle = panel.querySelector('.orch-toggle') as HTMLButtonElement
    expect(toggle.classList.contains('orch-on')).toBe(true)

    const ta = panel.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      fireEvent.change(ta, { target: { value: 'test task' } })
    })
    const sendBtn = panel.querySelector('button.send[aria-label="전송"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(sendBtn) })

    expect(mockApi.agentRun).toHaveBeenCalled()
    const callArgs = mockApi.agentRun.mock.calls[0][0]
    expect(callArgs.orchestration).toBe(true)

    useAppStore.setState({ workspaceRoot: null })
  })
})

describe('panel-ultracode-F: 명시적 OFF + 전송 → orchestration 미포함', () => {
  it('토글을 클릭해 OFF로 내린 뒤 전송 → agentRun args에 orchestration 없거나 false', async () => {
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ workspaceRoot: '/test/workspace' })

    const container = await renderPanels()
    const panel = container.querySelector('.ma-panel') as HTMLElement

    const toggle = panel.querySelector('.orch-toggle') as HTMLButtonElement
    expect(toggle.classList.contains('orch-on')).toBe(true)
    await act(async () => { fireEvent.click(toggle) })
    expect(toggle.classList.contains('orch-on')).toBe(false)

    const ta = panel.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      fireEvent.change(ta, { target: { value: 'test task' } })
    })
    const sendBtn = panel.querySelector('button.send[aria-label="전송"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(sendBtn) })

    expect(mockApi.agentRun).toHaveBeenCalled()
    const callArgs = mockApi.agentRun.mock.calls[0][0]
    expect(callArgs.orchestration === undefined || callArgs.orchestration === false).toBe(true)

    useAppStore.setState({ workspaceRoot: null })
  })

  it('토글 OFF + 본문에 "ultracode" 언급 → orchestration 미포함(키워드 비승격, UC1-P07)', async () => {
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ workspaceRoot: '/test/workspace' })

    const container = await renderPanels()
    const panel = container.querySelector('.ma-panel') as HTMLElement
    const toggle = panel.querySelector('.orch-toggle') as HTMLButtonElement
    await act(async () => { fireEvent.click(toggle) })
    expect(toggle.classList.contains('orch-on')).toBe(false)

    const ta = panel.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      fireEvent.change(ta, { target: { value: 'please ultracode this task' } })
    })
    const sendBtn = panel.querySelector('button.send[aria-label="전송"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(sendBtn) })

    expect(mockApi.agentRun).toHaveBeenCalled()
    const callArgs = mockApi.agentRun.mock.calls[0][0]
    expect(callArgs.orchestration === undefined || callArgs.orchestration === false).toBe(true)

    useAppStore.setState({ workspaceRoot: null })
  })
})

describe('panel-ultracode-G: .orch-badge 텍스트', () => {
  it('.pick-lbl "UltraCode" 텍스트가 .orch-toggle 안에 있다', async () => {
    const container = await renderPanels()
    const toggle = container.querySelector('.orch-toggle')!
    const lbl = toggle.querySelector('.pick-lbl')
    expect(lbl?.textContent?.trim()).toBe('UltraCode')
  })
})

describe('panel-ultracode-H: 접근성 속성', () => {
  it('aria-label="UltraCode 모드 토글"', async () => {
    const container = await renderPanels()
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    expect(toggle.getAttribute('aria-label')).toBe('UltraCode 모드 토글')
  })
})

describe('panel-ultracode-J: 패널 독립 상태', () => {
  it('패널1 토글 클릭(OFF) → 패널2 토글은 기본 ON 유지(UC1-P07, 상태 격리)', async () => {
    const container = await renderPanels()
    const panels = Array.from(container.querySelectorAll('.ma-panel'))
    expect(panels.length).toBeGreaterThanOrEqual(2)

    const toggle1 = panels[0].querySelector('.orch-toggle') as HTMLButtonElement
    const toggle2 = panels[1].querySelector('.orch-toggle') as HTMLButtonElement
    expect(toggle1.classList.contains('orch-on')).toBe(true)
    expect(toggle2.classList.contains('orch-on')).toBe(true)

    await act(async () => { fireEvent.click(toggle1) })

    expect(toggle1.classList.contains('orch-on')).toBe(false)
    expect(toggle2.classList.contains('orch-on')).toBe(true)
  })
})

describe('panel-ultracode-K: 지속 토글(전송 후에도 ON 유지)', () => {
  it('패널 토글 기본 ON(클릭 없이) + 전송 → 전송 후에도 .orch-on 유지(one-shot 폐기, ADR-032)', async () => {
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ workspaceRoot: '/test/workspace' })

    const container = await renderPanels()
    const panel = container.querySelector('.ma-panel') as HTMLElement

    const toggle = panel.querySelector('.orch-toggle') as HTMLButtonElement
    expect(toggle.classList.contains('orch-on')).toBe(true)

    const ta = panel.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => { fireEvent.change(ta, { target: { value: 'persistent toggle task' } }) })
    const sendBtn = panel.querySelector('button.send[aria-label="전송"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(sendBtn) })

    expect(mockApi.agentRun).toHaveBeenCalled()
    expect(mockApi.agentRun.mock.calls[0][0].orchestration).toBe(true)
    expect(toggle.classList.contains('orch-on')).toBe(true)

    useAppStore.setState({ workspaceRoot: null })
  })
})
