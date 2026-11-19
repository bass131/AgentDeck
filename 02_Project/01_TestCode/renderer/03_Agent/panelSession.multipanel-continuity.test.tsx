// 작업 ID: lr3-p07 · 옛 이름 lr3-p07-multipanel-continuity.test.tsx
// @vitest-environment jsdom
// M10 G1 — 멀티 화면을 지웠다. 패널 세션 기계(usePanelSlot + PanelView)는 G3 세션 탭이 다시 쓰려고 남겼으므로
// 그 연속성은 패널 하네스로 본다. 멀티 세션 영구 삭제의 정리(옛 (3))는 멀티 세션 목록과 함께 없어져 뺐다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { useAppStore } from '@renderer/00_App/appStore'
import {
  __resetPanelSessionManagerForTests,
  __getPanelManagerSizesForTests,
  makePanelSlotKey,
} from '@renderer/03_Agent/state/panelSession'
import type { AgentEventPayload } from '../../../../02_Project/00_Source/shared/ipcContract'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'
import { PanelHarness } from '../00_Helpers/panelHarness'

let runIdCounter = 0
let capturedHandler: ((payload: AgentEventPayload) => void) | null = null

const mockApi = {
  agentRun: vi.fn().mockImplementation(() => {
    const runId = `run-${runIdCounter}`
    runIdCounter++
    return Promise.resolve({ runId })
  }),
  agentAbort: vi.fn().mockResolvedValue({ ok: true }),
  agentInterrupt: vi.fn().mockResolvedValue({ ok: true }),
  onAgentEvent: vi.fn().mockImplementation((cb: (payload: AgentEventPayload) => void) => {
    capturedHandler = cb
    return () => {
      capturedHandler = null
    }
  }),
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

Object.defineProperty(window, 'api', { value: adaptFlatApi(mockApi), writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  runIdCounter = 0
  capturedHandler = null
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
  useAppStore.setState({ workspaceMode: 'single', workspaceRoot: null })
  __resetPanelSessionManagerForTests()
})

async function renderPanels(sessionId: string): Promise<{ container: Element; unmount: () => void }> {
  useAppStore.setState({ workspaceRoot: '/test/workspace' })
  let container!: Element
  let unmount!: () => void
  await act(async () => {
    const result = render(<PanelHarness sessionId={sessionId} />)
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
  it('패널0 전송 중 unmount(화면 전환 시뮬) → 이벤트 도착 → 같은 세션 remount → thread에 반영됨', async () => {
    const SID = 'sess-evap'
    const first = await renderPanels(SID)

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

    const second = await renderPanels(SID)
    expect(panel0Text(second.container)).toContain('1, 2, 3')

    act(() => {
      second.unmount()
    })
  })
})

describe('Phase 07 (2) — 세션 범위 전환 시 교차오염 0: 범위 id가 다르면 슬롯 상태가 격리된다', () => {
  it('범위A 슬롯0 진행 중 텍스트가 범위B 슬롯0에 새지 않는다', async () => {
    const SID_A = 'sess-cross-a'
    const SID_B = 'sess-cross-b'

    const a = await renderPanels(SID_A)
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

    const b = await renderPanels(SID_B)
    expect(panel0Text(b.container)).not.toContain('A 전용 응답')
    expect(panel0Text(b.container)).not.toContain('A 전용 질문')

    act(() => {
      b.unmount()
    })

    const a2 = await renderPanels(SID_A)
    expect(panel0Text(a2.container)).toContain('A 전용 응답')

    act(() => {
      a2.unmount()
    })
  })
})

describe('Phase 07 (4) — AUTO idle-close → resume 연속 (비가시 패널 판본, P02 재검증 🟡)', () => {
  it('done으로 idle이 된 뒤 화면을 벗어났다 돌아와도 sessionId가 보존돼 다음 send가 resumeSessionId로 주입한다', async () => {
    const SID = 'sess-idle-resume'
    const first = await renderPanels(SID)

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

    const second = await renderPanels(SID)

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
    const view = await renderPanels(SID)

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
      const view = await renderPanels(`sess-cap-${s}`)
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
