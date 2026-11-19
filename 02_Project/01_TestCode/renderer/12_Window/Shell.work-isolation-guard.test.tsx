// @vitest-environment jsdom
// Shell 전역 구독 회귀 가드 — 대화(Conversation)가 화면에서 내려가는 모드로 바꿔도 전역 agent 이벤트 구독은 Shell 수명이다.
// 옛 이름 Shell.multi-isolation-guard.test.tsx — M10 G1에서 멀티 모드를 지우며 같은 성질을 「작업」 모드(대화 자리에 루프 화면)로 옮겼다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { useAppStore } from '@renderer/00_App/appStore'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

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
  onLoopState: vi.fn().mockReturnValue(() => {}),
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

Object.defineProperty(window, 'api', { value: adaptFlatApi(mockApi), writable: true, configurable: true })

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

describe('회귀 가드 A: 채팅 모드에서 전역 구독이 라이브다', () => {
  it('Conversation 마운트 시 subscribeAgentEvents(→ onAgentEvent)가 1회 호출된다', async () => {
    useAppStore.setState({ workspaceMode: 'single' })
    const { Shell } = await import('@renderer/12_Window/Shell')

    await act(async () => {
      render(<Shell />)
    })

    expect(mockOnAgentEvent).toHaveBeenCalledTimes(1)
  })

  it('채팅 모드 렌더 직후 unsubscribe는 아직 호출되지 않았다(구독 라이브)', async () => {
    useAppStore.setState({ workspaceMode: 'single' })
    const { Shell } = await import('@renderer/12_Window/Shell')

    await act(async () => {
      render(<Shell />)
    })

    expect(mockUnsubscribe).not.toHaveBeenCalled()
  })
})

describe('회귀 가드 B: 채팅→작업 전환해도 전역 구독은 유지된다', () => {
  it('workspaceMode를 work로 바꿔도 unsubscribe가 호출되지 않는다(구독이 Shell 수명)', async () => {
    useAppStore.setState({ workspaceMode: 'single' })
    const { Shell } = await import('@renderer/12_Window/Shell')

    await act(async () => {
      render(<Shell />)
    })

    expect(mockOnAgentEvent).toHaveBeenCalledTimes(1)
    expect(mockUnsubscribe).not.toHaveBeenCalled()

    await act(async () => {
      useAppStore.setState({ workspaceMode: 'work' })
    })

    expect(mockUnsubscribe).not.toHaveBeenCalled()
  })

  it('작업 전환 후 전역 onAgentEvent 재호출 없음(중복 구독 없음)', async () => {
    useAppStore.setState({ workspaceMode: 'single' })
    const { Shell } = await import('@renderer/12_Window/Shell')

    await act(async () => {
      render(<Shell />)
    })

    const callCountAfterSingle = mockOnAgentEvent.mock.calls.length

    await act(async () => {
      useAppStore.setState({ workspaceMode: 'work' })
    })

    expect(mockOnAgentEvent.mock.calls.length - callCountAfterSingle).toBe(0)
  })
})

describe('회귀 가드 C: 작업 모드로 초기 진입해도 전역 구독이 있다', () => {
  it('workspaceMode=work로 초기 렌더해도 전역 subscribeAgentEvents가 한 번 호출된다(Shell 마운트 시점)', async () => {
    const subscribeSpyFn = vi.fn().mockReturnValue(() => {})
    useAppStore.setState({ subscribeAgentEvents: subscribeSpyFn } as never)

    useAppStore.setState({ workspaceMode: 'work' })
    const { Shell } = await import('@renderer/12_Window/Shell')

    await act(async () => {
      render(<Shell />)
    })

    expect(subscribeSpyFn).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.status-board')).not.toBeNull()
    expect(document.querySelector('.pane.chat')).toBeNull()
  })
})

describe('회귀 가드 E: 역방향 유령 — 작업 모드에 있는 동안 끝난 대화 run', () => {
  it('채팅 run 진행 중 작업으로 전환 → done 도착 → 채팅 복귀 시 isRunning이 정상 해제된다', async () => {
    useAppStore.setState({ workspaceMode: 'single' })
    const { Shell } = await import('@renderer/12_Window/Shell')

    await act(async () => {
      render(<Shell />)
    })

    useAppStore.setState({
      currentRunId: 'run-ghost',
      isRunning: true,
    } as Parameters<typeof useAppStore.setState>[0])

    await act(async () => {
      useAppStore.setState({ workspaceMode: 'work' })
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

describe('회귀 가드 D: 보조 — Shell.tsx가 작업 모드에서 대화 대신 작업 모드 몸체를 그린다 (소스 구조 검증)', () => {
  it("Shell 소스에서 <Conversation>은 workspaceMode === 'work' 분기의 다른 쪽(채팅)에만 있다", async () => {
    const shellSrc = await import('@renderer/12_Window/Shell?raw')
    const src: string = (shellSrc as unknown as { default: string }).default

    const workIdx = src.indexOf("workspaceMode === 'work' ? (")
    expect(workIdx).toBeGreaterThan(-1)
    const loopIdx = src.indexOf('<WorkView', workIdx)
    const convIdx = src.indexOf('<Conversation', workIdx)
    expect(loopIdx).toBeGreaterThan(workIdx)
    expect(convIdx).toBeGreaterThan(loopIdx)
    expect(src.split('<Conversation').length - 1).toBe(1)
    expect(src.split('<WorkView').length - 1).toBe(1)
    expect(src).not.toContain('<LoopScreen')
  })
})
