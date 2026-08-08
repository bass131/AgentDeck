// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { useAppStore } from '../../../02_Source/renderer/src/store/appStore'
import {
  __resetPanelSessionManagerForTests,
  __getPanelManagerSizesForTests,
  makePanelSlotKey,
} from '../../../02_Source/renderer/src/store/panelSession'
import type { AgentEventPayload, PersistedMultiState } from '../../../02_Source/shared/ipcContract'
import { makeMultiCmdMocks } from './helpers/multiCmdMock'

let runIdCounter = 0
let capturedHandler: ((payload: AgentEventPayload) => void) | null = null

let _disk: PersistedMultiState | null = null

const {
  multiCmdUpsert: mockMultiCmdUpsert,
  multiCmdCreate: mockMultiCmdCreate,
  multiCmdDelete: mockMultiCmdDelete,
  multiCmdRename: mockMultiCmdRename,
  multiCmdSelect: mockMultiCmdSelect,
} = makeMultiCmdMocks(
  () => _disk,
  (s) => { _disk = s }
)

const mockApi = {
  agentRun: vi.fn().mockImplementation(() => {
    const runId = `run-${runIdCounter}`
    runIdCounter++
    return Promise.resolve({ runId })
  }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  agentInterrupt: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockImplementation((cb: (payload: AgentEventPayload) => void) => {
    capturedHandler = cb
    return () => {
      capturedHandler = null
    }
  }),
  multiSessionLoad: vi.fn().mockImplementation(async () => ({ state: _disk })),
  multiCmdUpsert: mockMultiCmdUpsert,
  multiCmdCreate: mockMultiCmdCreate,
  multiCmdDelete: mockMultiCmdDelete,
  multiCmdRename: mockMultiCmdRename,
  multiCmdSelect: mockMultiCmdSelect,
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

beforeEach(() => {
  vi.clearAllMocks()
  runIdCounter = 0
  capturedHandler = null
  _disk = null
  __resetPanelSessionManagerForTests()
  mockApi.agentRun.mockImplementation(() => {
    const runId = `run-${runIdCounter}`
    runIdCounter++
    return Promise.resolve({ runId })
  })
  mockApi.onAgentEvent.mockImplementation((cb: (payload: AgentEventPayload) => void) => {
    capturedHandler = cb
    return () => {
      capturedHandler = null
    }
  })
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ workspaceMode: 'single', workspaceRoot: null, activeMultiSessionId: '' })
  __resetPanelSessionManagerForTests()
})

async function renderMultiWorkspace(sessionId: string): Promise<{ container: Element; unmount: () => void }> {
  useAppStore.setState({ workspaceRoot: '/test/workspace', workspaceMode: 'multi', activeMultiSessionId: sessionId })
  const { MultiWorkspace } = await import('../../../02_Source/renderer/src/features/shell/MultiWorkspace')
  let container!: Element
  let unmount!: () => void
  await act(async () => {
    const result = render(<MultiWorkspace />)
    container = result.container
    unmount = result.unmount
  })
  return { container, unmount }
}

async function sendFromPanel0(container: Element, text: string): Promise<void> {
  const textarea = container.querySelector('textarea')
  if (!textarea) throw new Error('panel textarea not found')
  await act(async () => {
    fireEvent.change(textarea, { target: { value: text } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
  })
}

function panel0Text(container: Element): string {
  const thread = container.querySelector('.ma-p-thread')
  return thread?.textContent ?? ''
}

describe('Phase 07 (1) — 스트림 증발 재현·수리: 언마운트 중 도착한 이벤트가 재마운트 후에도 보인다', () => {
  it('패널0 전송 중 unmount(모드 전환 시뮬) → 이벤트 도착 → 같은 세션 remount → thread에 반영됨', async () => {
    const SID = 'sess-evap'
    const first = await renderMultiWorkspace(SID)

    await sendFromPanel0(first.container, '1부터 세줘')
    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)

    act(() => {
      first.unmount()
    })

    expect(capturedHandler).toBeTruthy()
    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'text', delta: '1, 2, 3' } })
    })
    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'done' } })
    })

    const second = await renderMultiWorkspace(SID)
    expect(panel0Text(second.container)).toContain('1, 2, 3')

    act(() => {
      second.unmount()
    })
  })
})

describe('Phase 07 (2) — 멀티세션 전환 시 교차오염 0: 세션이 다르면 슬롯 상태가 격리된다', () => {
  it('세션A 슬롯0 진행 중 텍스트가 세션B 슬롯0에 새지 않는다', async () => {
    const SID_A = 'sess-cross-a'
    const SID_B = 'sess-cross-b'

    const a = await renderMultiWorkspace(SID_A)
    await sendFromPanel0(a.container, 'A 전용 질문')

    act(() => {
      a.unmount()
    })

    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'text', delta: 'A 전용 응답' } })
    })
    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'done' } })
    })

    const b = await renderMultiWorkspace(SID_B)
    expect(panel0Text(b.container)).not.toContain('A 전용 응답')
    expect(panel0Text(b.container)).not.toContain('A 전용 질문')

    act(() => {
      b.unmount()
    })

    const a2 = await renderMultiWorkspace(SID_A)
    expect(panel0Text(a2.container)).toContain('A 전용 응답')

    act(() => {
      a2.unmount()
    })
  })
})

describe('Phase 07 (3) — 고스트 run 정리: 멀티세션 영구 삭제 시 진행 중 슬롯을 abort·정리한다', () => {
  it('deleteMultiSession(id) → 진행 중이던 패널의 runId로 agentAbort 호출 + 이후 이벤트는 무시된다', async () => {
    const SID = 'sess-delete-me'
    _disk = {
      version: 2,
      activeSessionId: SID,
      sessions: [
        { id: SID, title: '삭제될 세션', count: 2, panels: [] },
        { id: 'sess-keep', title: '남는 세션', count: 2, panels: [] },
      ],
    }

    const view = await renderMultiWorkspace(SID)
    await sendFromPanel0(view.container, '오래 걸리는 작업')
    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)

    act(() => {
      view.unmount()
    })

    await act(async () => {
      await useAppStore.getState().deleteMultiSession(SID)
    })

    expect(mockApi.agentAbort).toHaveBeenCalledWith({ runId: 'run-0' })

    expect(() => {
      act(() => {
        capturedHandler!({ runId: 'run-0', event: { type: 'text', delta: '너무 늦은 응답' } })
      })
    }).not.toThrow()
  })
})

describe('Phase 07 (4) — AUTO idle-close → resume 연속 (비가시 패널 판본, P02 재검증 🟡)', () => {
  it('done으로 idle이 된 뒤 화면을 벗어났다 돌아와도 sessionId가 보존돼 다음 send가 resumeSessionId로 주입한다', async () => {
    const SID = 'sess-idle-resume'
    const first = await renderMultiWorkspace(SID)

    await sendFromPanel0(first.container, '첫 턴')
    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)

    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'session', sessionId: 'sess-engine-abc' } })
    })
    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'done' } })
    })

    act(() => {
      first.unmount()
    })

    const second = await renderMultiWorkspace(SID)

    mockApi.agentRun.mockClear()
    await sendFromPanel0(second.container, '두 번째 턴(재개)')

    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)
    const sentReq = mockApi.agentRun.mock.calls[0][0] as { resumeSessionId?: string }
    expect(sentReq.resumeSessionId).toBe('sess-engine-abc')

    act(() => {
      second.unmount()
    })
  })
})

describe('Phase 07 — makePanelSlotKey 유틸(키 스킴 계약)', () => {
  it('makePanelSlotKey(sessionId, slot)는 세션과 슬롯이 다르면 다른 키를 낸다', () => {
    expect(makePanelSlotKey('s1', 0)).not.toBe(makePanelSlotKey('s1', 1))
    expect(makePanelSlotKey('s1', 0)).not.toBe(makePanelSlotKey('s2', 0))
    expect(makePanelSlotKey('s1', 0)).toBe(makePanelSlotKey('s1', 0))
  })
})

describe('Phase 07 (5) — 매니저 누수 회귀 가드(reviewer 🟡)', () => {
  it('같은 슬롯 재전송 시 직전 runId 라우팅이 교체-정리된다(무한 증가 차단)', async () => {
    const SID = 'sess-leak'
    const view = await renderMultiWorkspace(SID)

    await sendFromPanel0(view.container, '첫 턴')
    act(() => {
      capturedHandler!({ runId: 'run-0', event: { type: 'done' } })
    })
    await sendFromPanel0(view.container, '둘째 턴')

    expect(__getPanelManagerSizesForTests().runIds).toBe(1)

    act(() => view.unmount())
  })

  it('CAP 축출이 완료 슬롯을 회수한다(실행 중·마운트 중만 보존) + dangling 라우팅 0', async () => {
    for (let s = 0; s < 33; s++) {
      const view = await renderMultiWorkspace(`sess-cap-${s}`)
      const before = runIdCounter
      await sendFromPanel0(view.container, `msg-${s}`)
      act(() => {
        capturedHandler!({ runId: `run-${before}`, event: { type: 'done' } })
      })
      act(() => view.unmount())
    }
    const sizes = __getPanelManagerSizesForTests()
    expect(sizes.states).toBeLessThanOrEqual(32)
    expect(sizes.runIds).toBeLessThanOrEqual(sizes.states)
  })
})
