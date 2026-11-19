// 작업 ID: bf3-p06 · 옛 이름 bf3-p06-permission-panel-wiring.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup, renderHook } from '@testing-library/react'
import { useAppStore } from '@renderer/00_App/appStore'
import { __resetPanelSessionManagerForTests } from '@renderer/03_Agent/state/panelSession'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

let runIdCounter = 0
let capturedEventCallbacks: Array<(payload: unknown) => void> = []
const mockUnsubFns: Array<ReturnType<typeof vi.fn>> = []

const mockApi = {
  agentRun: vi.fn().mockImplementation(() => {
    const runId = `run-${runIdCounter}`
    runIdCounter++
    return Promise.resolve({ runId })
  }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockImplementation((cb: (payload: unknown) => void) => {
    capturedEventCallbacks.push(cb)
    const unsub = vi.fn()
    mockUnsubFns.push(unsub)
    return unsub
  }),
  permissionRespond: vi.fn().mockResolvedValue({ ok: true }),
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  workspaceOpen: vi.fn().mockResolvedValue({ root: null, tree: null }),
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

function emitAgentEvent(runId: string, event: Record<string, unknown>): void {
  capturedEventCallbacks.forEach((cb) => cb({ runId, event }))
}

beforeEach(() => {
  vi.clearAllMocks()
  runIdCounter = 0
  capturedEventCallbacks = []
  mockUnsubFns.length = 0
  mockApi.agentRun.mockImplementation(() => {
    const runId = `run-${runIdCounter}`
    runIdCounter++
    return Promise.resolve({ runId })
  })
  mockApi.onAgentEvent.mockImplementation((cb: (payload: unknown) => void) => {
    capturedEventCallbacks.push(cb)
    const unsub = vi.fn()
    mockUnsubFns.push(unsub)
    return unsub
  })
  mockApi.permissionRespond.mockResolvedValue({ ok: true })
  __resetPanelSessionManagerForTests()
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ workspaceMode: 'single', workspaceRoot: null })
})

describe('(A) usePanelSlot — respondPermission 계약', () => {
  it('(1) pendingPermission 없을 때 respondPermission → no-op(IPC 미호출)', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-bf3-a', 0))

    await act(async () => {
      await result.current.respondPermission('allow')
    })

    expect(mockApi.permissionRespond).not.toHaveBeenCalled()
  })

  it('(2) 자기 runId permission_request 이벤트 → state.pendingPermission 설정', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-bf3-a', 0))

    await act(async () => {
      await result.current.send('테스트')
    })
    const runId = result.current.state.currentRunId!
    expect(runId).toBeTruthy()

    act(() => {
      emitAgentEvent(runId, { type: 'permission_request', requestId: 'req-x', toolName: 'Bash', summary: 'ls' })
    })

    expect(result.current.state.pendingPermission).toEqual({
      runId,
      requestId: 'req-x',
      toolName: 'Bash',
      summary: 'ls',
    })
  })

  it('(2b) 가드 질문 permission_request(askReason) → 패널 슬롯 pendingPermission에 사유가 실린다 (M06 G3 멀티 패널 카드)', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-g3-guard', 0))

    await act(async () => {
      await result.current.send('테스트')
    })
    const runId = result.current.state.currentRunId!
    const askReason = '비가역 작업 — master가 보이는 git push (master 진입 시도). 승인하면 실행되고, 거부하면 실행되지 않습니다.'

    act(() => {
      emitAgentEvent(runId, {
        type: 'permission_request', requestId: 'req-g3', toolName: 'Bash',
        summary: '명령 실행: git push origin HEAD:master', askReason,
      })
    })

    expect(result.current.state.pendingPermission).toEqual({
      runId,
      requestId: 'req-g3',
      toolName: 'Bash',
      summary: '명령 실행: git push origin HEAD:master',
      askReason,
    })
  })

  it('(3) respondPermission(behavior) → permissionRespond(runId/requestId/behavior) 호출 + 슬롯 정리', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-bf3-a', 0))

    await act(async () => {
      await result.current.send('테스트')
    })
    const runId = result.current.state.currentRunId!

    act(() => {
      emitAgentEvent(runId, { type: 'permission_request', requestId: 'req-y', toolName: 'Write', summary: '파일 생성' })
    })
    expect(result.current.state.pendingPermission).toBeTruthy()

    await act(async () => {
      await result.current.respondPermission('deny')
    })

    expect(mockApi.permissionRespond).toHaveBeenCalledWith({ runId, requestId: 'req-y', behavior: 'deny' })
    expect(result.current.state.pendingPermission).toBeNull()
  })

  it('(4) 타 runId 이벤트는 이 패널의 pendingPermission에 영향 없음(교차오염 0)', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-bf3-a', 0))

    await act(async () => {
      await result.current.send('테스트')
    })
    act(() => {
      emitAgentEvent('run-other-panel', { type: 'permission_request', requestId: 'req-z', toolName: 'Bash', summary: 'x' })
    })

    expect(result.current.state.pendingPermission).toBeNull()
  })
})

// M10 G1 — 멀티 화면을 지웠다. 패널 기계(usePanelSlot + PanelView)를 패널 하네스로 그려 같은 배선을 본다.
async function renderPanels(workspaceRoot: string | null = '/test/workspace') {
  useAppStore.setState({ workspaceRoot })
  const { PanelHarness } = await import('../00_Helpers/panelHarness')
  const { container } = render(<PanelHarness sessionId="bf3-p06" />)
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

describe('(B) 패널 하네스 — 패널 권한 카드 배선(usePanelSlot)', () => {
  it('(5) 패널 0 권한 대기 → 패널 0에만 .perm-card 렌더, 패널 1 무영향', async () => {
    const container = await renderPanels()
    const runId0 = await sendFromPanel(container, 0, '패널0 메시지')

    act(() => {
      emitAgentEvent(runId0, { type: 'permission_request', requestId: 'req-0', toolName: 'Bash', summary: 'rm -rf' })
    })

    const panel0 = container.querySelector('.ma-panel[data-slot="0"]') as HTMLElement
    const panel1 = container.querySelector('.ma-panel[data-slot="1"]') as HTMLElement
    expect(panel0.querySelector('.perm-card')).toBeTruthy()
    expect(panel1.querySelector('.perm-card')).toBeFalsy()
  })

  it('(6) 패널 0 카드 응답 → 패널 0의 runId/requestId로 permissionRespond 호출 + 카드 사라짐', async () => {
    const container = await renderPanels()
    const runId0 = await sendFromPanel(container, 0, '패널0 메시지')

    act(() => {
      emitAgentEvent(runId0, { type: 'permission_request', requestId: 'req-0', toolName: 'Bash', summary: 'rm -rf' })
    })

    const panel0 = container.querySelector('.ma-panel[data-slot="0"]') as HTMLElement
    const allowBtn = panel0.querySelector('.perm-card-opt[data-perm-choice="allow"]') as HTMLElement
    expect(allowBtn).toBeTruthy()

    await act(async () => {
      fireEvent.click(allowBtn)
    })

    expect(mockApi.permissionRespond).toHaveBeenCalledWith({ runId: runId0, requestId: 'req-0', behavior: 'allow' })
    expect(panel0.querySelector('.perm-card')).toBeFalsy()
  })

  it('(7) 패널 0·1 동시 권한 대기 — 패널 0 카드에 dispatch한 keydown은 패널 0만 응답', async () => {
    const container = await renderPanels()
    const runId0 = await sendFromPanel(container, 0, '패널0 메시지')
    const runId1 = await sendFromPanel(container, 1, '패널1 메시지')

    act(() => {
      emitAgentEvent(runId0, { type: 'permission_request', requestId: 'req-0', toolName: 'Bash', summary: 'x' })
    })
    act(() => {
      emitAgentEvent(runId1, { type: 'permission_request', requestId: 'req-1', toolName: 'Write', summary: 'y' })
    })

    const panel0 = container.querySelector('.ma-panel[data-slot="0"]') as HTMLElement
    const panel1 = container.querySelector('.ma-panel[data-slot="1"]') as HTMLElement
    const card0 = panel0.querySelector('.perm-card') as HTMLElement
    const card1 = panel1.querySelector('.perm-card') as HTMLElement
    expect(card0).toBeTruthy()
    expect(card1).toBeTruthy()

    await act(async () => {
      fireEvent.keyDown(card0, { key: '3' })
    })

    expect(mockApi.permissionRespond).toHaveBeenCalledTimes(1)
    expect(mockApi.permissionRespond).toHaveBeenCalledWith({ runId: runId0, requestId: 'req-0', behavior: 'deny' })
    expect(panel1.querySelector('.perm-card')).toBeTruthy()
  })

  it('(8) 패널 0 컴포저 타이핑 중 숫자키 → permissionRespond 미호출(오발동 0)', async () => {
    const container = await renderPanels()
    const runId0 = await sendFromPanel(container, 0, '패널0 메시지')

    act(() => {
      emitAgentEvent(runId0, { type: 'permission_request', requestId: 'req-0', toolName: 'Bash', summary: 'x' })
    })

    const panel0 = container.querySelector('.ma-panel[data-slot="0"]') as HTMLElement
    expect(panel0.querySelector('.perm-card')).toBeTruthy()

    const ta = panel0.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      fireEvent.change(ta, { target: { value: '1' } })
    })
    await act(async () => {
      fireEvent.keyDown(ta, { key: '1' })
    })

    expect(mockApi.permissionRespond).not.toHaveBeenCalled()
  })
})
