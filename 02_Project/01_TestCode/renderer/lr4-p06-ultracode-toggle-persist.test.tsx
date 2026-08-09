// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup, type RenderResult } from '@testing-library/react'
import { type JSX } from 'react'
import { __resetPanelSessionManagerForTests } from '../../../02_Project/00_Source/renderer/src/store/panelSession'
import { __resetUltracodeToggleForTests } from '../../../02_Project/00_Source/renderer/src/store/ultracodeToggle'

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
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  agentRun: vi.fn().mockResolvedValue({ runId: 'run-1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  agentInterrupt: vi.fn().mockResolvedValue({}),
  multiSessionLoad: vi.fn().mockResolvedValue({ state: null }),
  multiCmdUpsert: vi.fn().mockResolvedValue({ ok: true, state: { version: 2, activeSessionId: '', sessions: [] } }),
  pickFolder: vi.fn().mockResolvedValue({ path: null }),
  listFiles: vi.fn().mockResolvedValue({ files: [] }),
  getUsage: vi.fn().mockResolvedValue({ pct: null, resetsAt: null }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.onAgentEvent.mockReturnValue(() => {})
  mockApi.agentRun.mockResolvedValue({ runId: 'run-1' })
  mockApi.multiSessionLoad.mockResolvedValue({ state: null })
  mockApi.multiCmdUpsert.mockResolvedValue({ ok: true, state: { version: 2, activeSessionId: '', sessions: [] } })
  mockApi.listFiles.mockResolvedValue({ files: [] })
  mockApi.getUsage.mockResolvedValue({ pct: null, resetsAt: null })
  __resetPanelSessionManagerForTests()
  __resetUltracodeToggleForTests()
})

afterEach(async () => {
  cleanup()
  const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
  useAppStore.setState({
    workspaceMode: 'single',
    workspaceRoot: null,
    conversationId: null,
    activeMultiSessionId: '',
  } as Parameters<typeof useAppStore.setState>[0])
})

function ultraToggles(root: ParentNode): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll('.orch-toggle')).filter(
    (el) => el.getAttribute('aria-label') === 'UltraCode 모드 토글'
  ) as HTMLButtonElement[]
}
function badgeOf(toggle: Element): string {
  return toggle.querySelector('.orch-badge')?.textContent?.trim() ?? ''
}

async function store() {
  const mod = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
  return mod.useAppStore
}

describe('lr4-p06-A: 단일챗 왕복 보존 (single→multi→single OFF 유지)', () => {
  async function renderSingleShellHarness(): Promise<RenderResult> {
    const useAppStore = await store()
    const { selectWorkspaceMode } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    const { Conversation } = await import(
      '../../../02_Project/00_Source/renderer/src/features/conversation/Conversation'
    )
    function SingleShellHarness(): JSX.Element {
      const mode = useAppStore(selectWorkspaceMode)
      return mode === 'multi' ? <div data-testid="multi-stub" /> : <Conversation />
    }
    let r!: RenderResult
    await act(async () => {
      r = render(<SingleShellHarness />)
      await new Promise((res) => setTimeout(res, 20))
    })
    return r
  }

  it('단일 뷰에서 토글 OFF → 멀티 진입(언마운트) → 단일 복귀 시 OFF가 유지된다', async () => {
    const useAppStore = await store()
    useAppStore.setState({
      workspaceRoot: '/test/workspace',
      conversationId: 'conv-roundtrip',
      workspaceMode: 'single',
    } as Parameters<typeof useAppStore.setState>[0])

    const { container } = await renderSingleShellHarness()

    const t0 = ultraToggles(container)[0]
    expect(t0).toBeTruthy()
    expect(t0.classList.contains('orch-on')).toBe(true)

    await act(async () => { fireEvent.click(t0) })
    expect(badgeOf(ultraToggles(container)[0])).toBe('OFF')

    await act(async () => {
      useAppStore.getState().setWorkspaceMode('multi')
      await new Promise((res) => setTimeout(res, 10))
    })
    expect(ultraToggles(container).length).toBe(0)

    await act(async () => {
      useAppStore.getState().setWorkspaceMode('single')
      await new Promise((res) => setTimeout(res, 20))
    })

    const tBack = ultraToggles(container)[0]
    expect(tBack).toBeTruthy()
    expect(tBack.classList.contains('orch-on')).toBe(false)
    expect(badgeOf(tBack)).toBe('OFF')
  })
})

describe('lr4-p06-B: 단일챗 대화별 독립 (conversation A/B 격리)', () => {
  async function renderConversation(): Promise<RenderResult> {
    const { Conversation } = await import(
      '../../../02_Project/00_Source/renderer/src/features/conversation/Conversation'
    )
    let r!: RenderResult
    await act(async () => {
      r = render(<Conversation />)
      await new Promise((res) => setTimeout(res, 20))
    })
    return r
  }

  it('대화 A에서 OFF → 대화 B로 전환 시 기본값 ON → 다시 A로 복귀 시 여전히 OFF', async () => {
    const useAppStore = await store()
    useAppStore.setState({
      workspaceRoot: '/test/workspace',
      conversationId: 'conv-A',
      workspaceMode: 'single',
    } as Parameters<typeof useAppStore.setState>[0])

    const { container } = await renderConversation()

    const tA = ultraToggles(container)[0]
    expect(tA.classList.contains('orch-on')).toBe(true)
    await act(async () => { fireEvent.click(tA) })
    expect(badgeOf(ultraToggles(container)[0])).toBe('OFF')

    await act(async () => {
      useAppStore.setState({ conversationId: 'conv-B' } as Parameters<typeof useAppStore.setState>[0])
      await new Promise((res) => setTimeout(res, 10))
    })
    const tB = ultraToggles(container)[0]
    expect(tB).toBeTruthy()
    expect(badgeOf(tB)).toBe('ON')
    expect(tB.classList.contains('orch-on')).toBe(true)

    await act(async () => {
      useAppStore.setState({ conversationId: 'conv-A' } as Parameters<typeof useAppStore.setState>[0])
      await new Promise((res) => setTimeout(res, 10))
    })
    const tA2 = ultraToggles(container)[0]
    expect(badgeOf(tA2)).toBe('OFF')
    expect(tA2.classList.contains('orch-on')).toBe(false)
  })
})

describe('lr4-p06-C: 멀티 패널별 독립 + 리마운트 유지', () => {
  async function renderMultiShellHarness(): Promise<RenderResult> {
    const useAppStore = await store()
    const { selectWorkspaceMode, selectActiveMultiSessionId } = await import(
      '../../../02_Project/00_Source/renderer/src/store/appStore'
    )
    const { MultiWorkspace } = await import(
      '../../../02_Project/00_Source/renderer/src/features/shell/MultiWorkspace'
    )
    function MultiShellHarness(): JSX.Element {
      const mode = useAppStore(selectWorkspaceMode)
      const activeId = useAppStore(selectActiveMultiSessionId)
      return mode === 'multi' ? <MultiWorkspace key={activeId} /> : <div data-testid="single-stub" />
    }
    let r!: RenderResult
    await act(async () => {
      r = render(<MultiShellHarness />)
      await new Promise((res) => setTimeout(res, 30))
    })
    return r
  }

  function panels(container: ParentNode): HTMLElement[] {
    return Array.from(container.querySelectorAll('.ma-panel:not(.ma-placeholder)')) as HTMLElement[]
  }

  it('패널1 OFF → 멀티↔단일 왕복(재마운트) 후에도 패널1 OFF 유지, 패널2 ON 유지', async () => {
    const useAppStore = await store()
    useAppStore.setState({
      workspaceRoot: '/test/workspace',
      workspaceMode: 'multi',
      activeMultiSessionId: 'm-roundtrip',
    } as Parameters<typeof useAppStore.setState>[0])

    const { container } = await renderMultiShellHarness()

    const p0 = panels(container)
    expect(p0.length).toBeGreaterThanOrEqual(2)
    const p1Toggle = ultraToggles(p0[0])[0]
    const p2Toggle = ultraToggles(p0[1])[0]
    expect(p1Toggle.classList.contains('orch-on')).toBe(true)
    expect(p2Toggle.classList.contains('orch-on')).toBe(true)

    await act(async () => { fireEvent.click(p1Toggle) })
    expect(badgeOf(ultraToggles(panels(container)[0])[0])).toBe('OFF')
    expect(badgeOf(ultraToggles(panels(container)[1])[0])).toBe('ON')

    await act(async () => {
      useAppStore.getState().setWorkspaceMode('single')
      await new Promise((res) => setTimeout(res, 10))
    })
    expect(container.querySelector('[data-testid="single-stub"]')).toBeTruthy()

    await act(async () => {
      useAppStore.getState().setWorkspaceMode('multi')
      await new Promise((res) => setTimeout(res, 30))
    })

    const pBack = panels(container)
    expect(pBack.length).toBeGreaterThanOrEqual(2)
    expect(badgeOf(ultraToggles(pBack[0])[0])).toBe('OFF')
    expect(ultraToggles(pBack[0])[0].classList.contains('orch-on')).toBe(false)
    expect(badgeOf(ultraToggles(pBack[1])[0])).toBe('ON')
  })
})

describe('lr4-p06-DE: 신규 대화 conversationId 발급(null→id) 마이그레이션', () => {
  async function renderConversation(): Promise<RenderResult> {
    const { Conversation } = await import(
      '../../../02_Project/00_Source/renderer/src/features/conversation/Conversation'
    )
    let r!: RenderResult
    await act(async () => {
      r = render(<Conversation />)
      await new Promise((res) => setTimeout(res, 20))
    })
    return r
  }

  it('D: conversationId=null에서 OFF → id 발급(null→id 전이) 후에도 토글 OFF 유지', async () => {
    const useAppStore = await store()
    useAppStore.setState({
      workspaceRoot: '/test/workspace',
      conversationId: null,
      workspaceMode: 'single',
    } as Parameters<typeof useAppStore.setState>[0])

    const { container } = await renderConversation()

    const t0 = ultraToggles(container)[0]
    expect(t0.classList.contains('orch-on')).toBe(true)
    await act(async () => { fireEvent.click(t0) })
    expect(badgeOf(ultraToggles(container)[0])).toBe('OFF')

    await act(async () => {
      useAppStore.setState({ conversationId: 'conv-issued-id' } as Parameters<typeof useAppStore.setState>[0])
      await new Promise((res) => setTimeout(res, 10))
    })

    const tAfter = ultraToggles(container)[0]
    expect(tAfter).toBeTruthy()
    expect(badgeOf(tAfter)).toBe('OFF')
    expect(tAfter.classList.contains('orch-on')).toBe(false)
  })

  it('E: id 발급 후 다음 새 대화(null 복귀)는 기본 ON — OFF 상속 금지(single:default 정리)', async () => {
    const useAppStore = await store()
    useAppStore.setState({
      workspaceRoot: '/test/workspace',
      conversationId: null,
      workspaceMode: 'single',
    } as Parameters<typeof useAppStore.setState>[0])

    const { container } = await renderConversation()

    await act(async () => { fireEvent.click(ultraToggles(container)[0]) })
    expect(badgeOf(ultraToggles(container)[0])).toBe('OFF')
    await act(async () => {
      useAppStore.setState({ conversationId: 'conv-migrated-id' } as Parameters<typeof useAppStore.setState>[0])
      await new Promise((res) => setTimeout(res, 10))
    })

    await act(async () => {
      useAppStore.setState({ conversationId: null } as Parameters<typeof useAppStore.setState>[0])
      await new Promise((res) => setTimeout(res, 10))
    })

    const tNew = ultraToggles(container)[0]
    expect(tNew).toBeTruthy()
    expect(badgeOf(tNew)).toBe('ON')
    expect(tNew.classList.contains('orch-on')).toBe(true)
  })
})
