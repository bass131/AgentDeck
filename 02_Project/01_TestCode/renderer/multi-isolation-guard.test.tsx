// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { useAppStore } from '../../../02_Project/00_Source/renderer/src/store/appStore'

let liveHandler: ((payload: { runId: string; event: { type: string } }) => void) | null = null
const mockUnsubscribe = vi.fn(() => {
  liveHandler = null
})
const mockOnAgentEvent = vi.fn().mockImplementation(
  (cb: (payload: { runId: string; event: { type: string } }) => void) => {
    liveHandler = cb
    return mockUnsubscribe
  },
)

const mockApi = {
  windowMinimize: vi.fn().mockResolvedValue(undefined),
  windowMaximizeToggle: vi.fn().mockResolvedValue({ maximized: false }),
  windowClose: vi.fn().mockResolvedValue(undefined),
  windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
  windowGetBounds: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1200, height: 800 }),
  windowSetBounds: vi.fn().mockResolvedValue(undefined),
  windowDragStart: vi.fn().mockResolvedValue(undefined),
  windowDragEnd: vi.fn().mockResolvedValue(undefined),
  windowResizeStart: vi.fn().mockResolvedValue(undefined),
  windowResizeEnd: vi.fn().mockResolvedValue(undefined),
  onWindowState: vi.fn().mockReturnValue(() => {}),
  onAgentEvent: mockOnAgentEvent,
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ ok: true }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'run-guard-0' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
  fsRead: vi.fn().mockResolvedValue({ content: '' }),
  listFiles: vi.fn().mockResolvedValue({ files: [] }),
  pathForFile: vi.fn().mockReturnValue(''),
  saveImageData: vi.fn().mockResolvedValue({ path: '' }),
  referenceAdd: vi.fn().mockResolvedValue({ reference: null }),
  referenceList: vi.fn().mockResolvedValue({ references: [] }),
  referenceTree: vi.fn().mockResolvedValue({ tree: null }),
  git: {
    root: vi.fn().mockResolvedValue(null),
  },
  conversationRename: vi.fn().mockResolvedValue({ ok: true }),
  conversationDelete: vi.fn().mockResolvedValue({ ok: true }),
  getUiPrefs: vi.fn().mockResolvedValue({}),
  setUiPref: vi.fn().mockResolvedValue({ ok: true }),
  getAppVersion: vi.fn().mockResolvedValue(''),
  checkEngineUpdate: vi.fn().mockResolvedValue({ current: null, latest: null, updateAvailable: false }),
}

Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

const REAL_SUBSCRIBE_AGENT_EVENTS = useAppStore.getState().subscribeAgentEvents

beforeEach(() => {
  vi.clearAllMocks()
  liveHandler = null
  useAppStore.setState({ workspaceMode: 'single' })
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ workspaceMode: 'single', subscribeAgentEvents: REAL_SUBSCRIBE_AGENT_EVENTS })
})

describe('회귀 가드 A: single 모드에서 전역 구독이 라이브다', () => {
  it('Conversation 마운트 시 subscribeAgentEvents(→ onAgentEvent)가 1회 호출된다', async () => {
    useAppStore.setState({ workspaceMode: 'single' })
    const { Shell } = await import('../../../02_Project/00_Source/renderer/src/layout/Shell')

    await act(async () => {
      render(<Shell />)
    })

    expect(mockOnAgentEvent).toHaveBeenCalledTimes(1)
  })

  it('single 모드 렌더 직후 unsubscribe는 아직 호출되지 않았다(구독 라이브)', async () => {
    useAppStore.setState({ workspaceMode: 'single' })
    const { Shell } = await import('../../../02_Project/00_Source/renderer/src/layout/Shell')

    await act(async () => {
      render(<Shell />)
    })

    expect(mockUnsubscribe).not.toHaveBeenCalled()
  })
})

describe('회귀 가드 B: single→multi 전환해도 전역 구독은 유지된다 (Phase 07 — 역방향 유령 수리)', () => {
  it('workspaceMode를 multi로 바꿔도 unsubscribe가 호출되지 않는다(구독이 Shell 수명으로 승격됨)', async () => {
    useAppStore.setState({ workspaceMode: 'single' })
    const { Shell } = await import('../../../02_Project/00_Source/renderer/src/layout/Shell')

    await act(async () => {
      render(<Shell />)
    })

    expect(mockOnAgentEvent).toHaveBeenCalledTimes(1)
    expect(mockUnsubscribe).not.toHaveBeenCalled()

    await act(async () => {
      useAppStore.setState({ workspaceMode: 'multi' })
    })

    expect(mockUnsubscribe).not.toHaveBeenCalled()
  })

  it('multi 전환 후 전역 onAgentEvent 재호출 없음(중복 구독 없음)', async () => {
    useAppStore.setState({ workspaceMode: 'single' })
    const { Shell } = await import('../../../02_Project/00_Source/renderer/src/layout/Shell')

    await act(async () => {
      render(<Shell />)
    })

    const callCountAfterSingle = mockOnAgentEvent.mock.calls.length

    await act(async () => {
      useAppStore.setState({ workspaceMode: 'multi' })
    })

    const callCountAfterMulti = mockOnAgentEvent.mock.calls.length
    const deltaAfterMulti = callCountAfterMulti - callCountAfterSingle

    expect(deltaAfterMulti).toBeLessThanOrEqual(1)
  })
})

describe('회귀 가드 C: multi 모드로 초기 진입해도 전역 구독이 있다 (Phase 07 — 역방향 유령 수리)', () => {
  it('workspaceMode=multi로 초기 렌더해도 전역 subscribeAgentEvents가 호출된다(Shell 마운트 시점)', async () => {
    const subscribeSpyFn = vi.fn().mockReturnValue(() => {})
    useAppStore.setState({ subscribeAgentEvents: subscribeSpyFn } as never)

    useAppStore.setState({ workspaceMode: 'multi' })
    const { Shell } = await import('../../../02_Project/00_Source/renderer/src/layout/Shell')

    await act(async () => {
      render(<Shell />)
    })

    expect(subscribeSpyFn).toHaveBeenCalledTimes(1)
  })

  it('multi 모드 렌더 직후 전역 onAgentEvent 라이브 구독 수는 1이다', async () => {
    const subscribeSpyFn = vi.fn().mockReturnValue(() => {})
    useAppStore.setState({ subscribeAgentEvents: subscribeSpyFn } as never)

    useAppStore.setState({ workspaceMode: 'multi' })
    const { Shell } = await import('../../../02_Project/00_Source/renderer/src/layout/Shell')

    await act(async () => {
      render(<Shell />)
    })

    expect(subscribeSpyFn).toHaveBeenCalledTimes(1)
  })
})

describe('회귀 가드 E: 역방향 유령 재현·수리 확정 (Phase 07)', () => {
  it('단일챗 활성 run 진행 중 multi로 전환 → done 도착 → single 복귀 시 isRunning이 정상 해제된다', async () => {
    useAppStore.setState({ workspaceMode: 'single' })
    const { Shell } = await import('../../../02_Project/00_Source/renderer/src/layout/Shell')

    await act(async () => {
      render(<Shell />)
    })

    useAppStore.setState({
      currentRunId: 'run-ghost',
      isRunning: true,
    } as Parameters<typeof useAppStore.setState>[0])

    await act(async () => {
      useAppStore.setState({ workspaceMode: 'multi' })
    })

    expect(liveHandler).toBeTruthy()
    act(() => {
      liveHandler!({ runId: 'run-ghost', event: { type: 'done' } })
    })

    await act(async () => {
      useAppStore.setState({ workspaceMode: 'single' })
    })

    expect(useAppStore.getState().isRunning).toBe(false)
  })
})

describe('회귀 가드 D: 보조 — Shell.tsx가 multi에서 null을 렌더 (소스 구조 검증)', () => {
  it('Shell 소스에 workspaceMode=multi 시 Conversation을 null로 대체하는 패턴이 있다', async () => {
    const shellSrc = await import('../../../02_Project/00_Source/renderer/src/layout/Shell?raw')
    const src: string = (shellSrc as unknown as { default: string }).default

    const hasNullGuard =
      /workspaceMode\s*===\s*['"]multi['"]\s*\?\s*null/.test(src) ||
      /workspaceMode\s*!==\s*['"]multi['"]\s*&&/.test(src) ||
      /workspaceMode\s*!==\s*['"]multi['"]\s*\?/.test(src)

    expect(hasNullGuard).toBe(true)
  })

  it('Shell 소스에 multi 모드 시 <Conversation>이 렌더 블록 밖에 있음을 확인', async () => {
    const shellSrc = await import('../../../02_Project/00_Source/renderer/src/layout/Shell?raw')
    const src: string = (shellSrc as unknown as { default: string }).default

    const multiNullIdx = src.indexOf("workspaceMode === 'multi' ? null")
    expect(multiNullIdx).toBeGreaterThan(-1)

    const convIdx = src.indexOf('<Conversation')
    expect(convIdx).toBeGreaterThan(-1)

    expect(convIdx).toBeGreaterThan(multiNullIdx)
  })
})
