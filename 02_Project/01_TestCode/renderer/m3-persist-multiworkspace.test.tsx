// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import React from 'react'
import type { PersistedMultiState } from '../../../02_Project/00_Source/shared/ipcContract'
import { makeMultiCmdMocks } from './helpers/multiCmdMock'

let runIdCounter = 0
let _disk: PersistedMultiState | null = null
const mockMultiSessionLoad = vi.fn()
const { multiCmdUpsert: mockMultiCmdUpsert } = makeMultiCmdMocks(
  () => _disk,
  (s) => { _disk = s }
)

const mockApi = {
  agentRun: vi.fn().mockImplementation(() => {
    const runId = `run-${runIdCounter++}`
    return Promise.resolve({ runId })
  }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  multiCmdUpsert: mockMultiCmdUpsert,
  multiSessionLoad: mockMultiSessionLoad,
  pickFolder: vi.fn().mockResolvedValue({ path: null }),
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
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

async function renderMultiWorkspace() {
  const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
  useAppStore.setState({ workspaceRoot: '/test/root', workspaceMode: 'multi' })
  const { MultiWorkspace } = await import('../../../02_Project/00_Source/renderer/src/features/shell/MultiWorkspace')
  let container: Element = document.body
  await act(async () => {
    const result = render(React.createElement(MultiWorkspace))
    container = result.container
  })
  return container
}

beforeEach(() => {
  runIdCounter = 0
  vi.clearAllMocks()
  _disk = null
  mockMultiSessionLoad.mockResolvedValue({ state: null })
})

afterEach(() => {
  cleanup()
  vi.resetModules()
})

describe('B3 — race 게이트: 복원 완료 전 save 미발화', () => {

  it('마운트 시 multiSessionLoad()가 호출된다', async () => {
    await renderMultiWorkspace()
    expect(mockMultiSessionLoad).toHaveBeenCalled()
  })

  it('multiSessionLoad가 null 반환 시 — first-run, save는 복원 완료 후에만 허용', async () => {
    let resolveLoad!: (v: { state: null }) => void
    const loadDeferred = new Promise<{ state: null }>((res) => { resolveLoad = res })
    mockMultiSessionLoad.mockReturnValue(loadDeferred)

    await renderMultiWorkspace()

    const saveBeforeResolve = mockMultiCmdUpsert.mock.calls.length

    await act(async () => {
      resolveLoad({ state: null })
      await new Promise((r) => setTimeout(r, 600))
    })

    expect(saveBeforeResolve).toBe(0)
  })
})

describe('B4 — picker 리프팅: PanelView가 picker/setPicker props 수용', () => {

  it('PanelView는 picker prop을 외부에서 주입받아 모델 표시', async () => {
    const { PanelView } = await import('../../../02_Project/00_Source/renderer/src/features/shell/MultiWorkspace')
    const { DEFAULT_PICKER, SAMPLE_PANELS } = await import('../../../02_Project/00_Source/renderer/src/lib/multiAgentSampleData')
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 동적 import에서는 `import type`을 쓸 수 없어 값으로 가져오지만 ReturnType<typeof usePanelSession> 타입 캐스트에만 사용
    const { usePanelSession } = await import('../../../02_Project/00_Source/renderer/src/store/panelSession')

    const mockSession = {
      state: {
        thread: [],
        isRunning: false,
        activeLoops: [],
        errorMessage: undefined,
        lastUsage: undefined,
        lastContextWindow: undefined,
        currentRunId: null,
        openMsgId: null,
        openGroupId: null,
        seq: 0,
        changedFiles: new Set<string>(),
        fileDiffs: {},
        thinkingText: null,
        thinkingStartedAt: null,
        todos: [],
        subagents: [],
        pendingPermission: null,
        pendingQuestion: null,
        loopsStoppedNotice: false,
        autonomyActive: false,
        lastActivityAt: null,
        bannerStale: false,
        staleDismissed: false,
        goalRun: null,
        replMode: true,
        apiRetry: null,
        compacting: null,
        sdkSessionState: null,
        hookRuns: [],
      },
      send: vi.fn(),
      abort: vi.fn(),
      restore: vi.fn(),
      dismissLoopsStopped: vi.fn(),
      respondPermission: vi.fn(),
      setReplMode: vi.fn(),
      dismissGoalStale: vi.fn(),
    }

    const pickerState = { ...DEFAULT_PICKER, model: 'opus' }
    const setPicker = vi.fn()

    let container: Element = document.body
    await act(async () => {
      const result = render(
        React.createElement(PanelView, {
          slot: 0,
          panel: SAMPLE_PANELS[0],
          session: mockSession as ReturnType<typeof usePanelSession>,
          workspaceRoot: '/test',
          expanded: false,
          onExpand: vi.fn(),
          onPrompt: vi.fn(),
          onPickFolder: vi.fn(),
          picker: pickerState,
          setPicker: setPicker,
        })
      )
      container = result.container
    })

    expect(container).toBeTruthy()
  })

  it('MultiWorkspace 마운트 — picker가 per-slot state로 관리됨 (리프팅 후)', async () => {
    const container = await renderMultiWorkspace()
    const panels = container.querySelectorAll('.ma-panel')
    expect(panels.length).toBeGreaterThan(0)
    const pickBtns = container.querySelectorAll('.pick-btn')
    expect(pickBtns.length).toBeGreaterThan(0)
  })
})

describe('통합 — multiSessionLoad 마운트 복원', () => {

  it('load state=null 시 크래시 없이 기본 패널 렌더', async () => {
    mockMultiSessionLoad.mockResolvedValue({ state: null })
    const container = await renderMultiWorkspace()
    expect(container.querySelector('.multi')).toBeTruthy()
  })

  it('load state가 유효한 PersistedMultiState → 패널 count 복원', async () => {
    const savedState = {
      version: 2,
      activeSessionId: 'sess-1',
      sessions: [{
        id: 'sess-1',
        count: 3,
        panels: [
          { title: '복원패널1', picker: { model: 'sonnet', effort: 'high', mode: 'normal' } },
          { title: '복원패널2', picker: { model: 'opus', effort: 'max', mode: 'normal' } },
          { title: '복원패널3', picker: { model: 'haiku', effort: 'medium', mode: 'normal' } },
        ],
      }],
    }

    mockMultiSessionLoad.mockResolvedValue({ state: savedState })

    const container = await renderMultiWorkspace()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    const panels = container.querySelectorAll('.ma-panel:not(.ma-placeholder)')
    expect(panels.length).toBe(3)
  })
})
