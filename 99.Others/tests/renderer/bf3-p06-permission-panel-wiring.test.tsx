// @vitest-environment jsdom
/**
 * bf3-p06-permission-panel-wiring.test.tsx — 권한 요청 카드 멀티패널 배선 테스트
 * (BF3 Phase 06, ADR-030 — 멀티패널 권한 응답 격차 해소).
 *
 * 검증 범위:
 *   (A) usePanelSession — 패널 로컬 respondPermission 계약
 *       (1) pendingPermission 없을 때 respondPermission → no-op(IPC 미호출)
 *       (2) 자기 runId permission_request 이벤트 → state.pendingPermission 설정
 *       (3) respondPermission(behavior) → window.api.permissionRespond(runId/requestId/behavior)
 *           호출 + 응답 후 state.pendingPermission=null(슬롯 정리)
 *       (4) 타 runId 이벤트는 이 패널의 pendingPermission에 영향 없음(교차오염 0)
 *   (B) MultiWorkspace(usePanelSlot 실경로) 통합
 *       (5) 패널 0 권한 대기 → 패널 0의 .ma-panel 안에만 .perm-card 렌더, 패널 1 무영향
 *       (6) 패널 0 카드 클릭 응답 → 패널 0의 runId/requestId로 permissionRespond 호출
 *           (오배선 방지 라우팅 단언) + 응답 후 카드 사라짐
 *       (7) 키보드 가드: 패널 0·1 동시 권한 대기 시, 패널 0 카드 컨테이너에 dispatch한
 *           keydown은 패널 0만 응답(패널 1 무영향) — "포커스 패널만 반응"
 *       (8) 컴포저 타이핑 안전성: 패널 0 컴포저 textarea에 숫자키 입력 → permissionRespond 미호출
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup, renderHook } from '@testing-library/react'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import { __resetPanelSessionManagerForTests } from '../../../02.Source/renderer/src/store/panelSession'

// ── window.api mock ───────────────────────────────────────────────────────────

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

Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

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

// ═══════════════════════════════════════════════════════════════════════════════
// (A) usePanelSession — 패널 로컬 respondPermission 계약
// ═══════════════════════════════════════════════════════════════════════════════

describe('(A) usePanelSession — respondPermission 계약', () => {
  it('(1) pendingPermission 없을 때 respondPermission → no-op(IPC 미호출)', async () => {
    const { usePanelSession } = await import('../../../02.Source/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.respondPermission('allow')
    })

    expect(mockApi.permissionRespond).not.toHaveBeenCalled()
  })

  it('(2) 자기 runId permission_request 이벤트 → state.pendingPermission 설정', async () => {
    const { usePanelSession } = await import('../../../02.Source/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

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

  it('(3) respondPermission(behavior) → permissionRespond(runId/requestId/behavior) 호출 + 슬롯 정리', async () => {
    const { usePanelSession } = await import('../../../02.Source/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

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
    const { usePanelSession } = await import('../../../02.Source/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.send('테스트')
    })
    // 이 패널의 runId가 아닌 다른 runId로 permission_request 도착 — panelApply가 필터링해야 함.
    act(() => {
      emitAgentEvent('run-other-panel', { type: 'permission_request', requestId: 'req-z', toolName: 'Bash', summary: 'x' })
    })

    expect(result.current.state.pendingPermission).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// (B) MultiWorkspace(usePanelSlot 실경로) 통합
// ═══════════════════════════════════════════════════════════════════════════════

async function renderMultiWorkspace(workspaceRoot: string | null = '/test/workspace') {
  useAppStore.setState({ workspaceRoot, workspaceMode: 'multi' })
  const { MultiWorkspace } = await import('../../../02.Source/renderer/src/components/00_shell/MultiWorkspace')
  const { container } = render(<MultiWorkspace />)
  return container
}

/** 패널 slot의 textarea를 통해 메시지 전송 → agentRun이 반환한 runId 획득. */
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
  // agentRun은 비동기 — 반환된 runId를 얻기 위해 마이크로태스크를 흘려보낸다.
  await act(async () => { await Promise.resolve() })
  const callIdx = before // 이 호출 전까지의 개수 = 이번 호출의 인덱스
  const result = await mockApi.agentRun.mock.results[callIdx].value
  return result.runId
}

describe('(B) MultiWorkspace — 패널 권한 카드 배선(usePanelSlot)', () => {
  it('(5) 패널 0 권한 대기 → 패널 0에만 .perm-card 렌더, 패널 1 무영향', async () => {
    const container = await renderMultiWorkspace()
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
    const container = await renderMultiWorkspace()
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
    const container = await renderMultiWorkspace()
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

    // 패널 0 카드에 숫자 3(거부) — 패널 1은 전혀 건드리지 않는다(전역 리스너가 아니므로).
    await act(async () => {
      fireEvent.keyDown(card0, { key: '3' })
    })

    expect(mockApi.permissionRespond).toHaveBeenCalledTimes(1)
    expect(mockApi.permissionRespond).toHaveBeenCalledWith({ runId: runId0, requestId: 'req-0', behavior: 'deny' })
    // 패널 1 카드는 여전히 대기 중(응답 안 감)
    expect(panel1.querySelector('.perm-card')).toBeTruthy()
  })

  it('(8) 패널 0 컴포저 타이핑 중 숫자키 → permissionRespond 미호출(오발동 0)', async () => {
    const container = await renderMultiWorkspace()
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
