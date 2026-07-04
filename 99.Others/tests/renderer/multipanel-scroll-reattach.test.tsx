// @vitest-environment jsdom
/**
 * multipanel-scroll-reattach.test.tsx — 멀티패널 자동 스크롤 재부착
 * (영호 육안 피드백 2026-07-04 ⑤: "MultiPanel에서 채팅창을 위로 올렸을 때, 신규 대화로
 * 자동 스크롤링이 이후에 안 됨, 조작이 너무 불편함").
 *
 * 진단(코드 실측):
 *   - 단일챗(Conversation.tsx)은 scrollRef + userScrolledUp ref로 스크롤을 추적한다.
 *     handleScroll(L438-449)은 매 scroll 이벤트마다 isScrolledUp(lib/scrollHelpers.ts,
 *     threshold 40px)로 "바닥 근접 여부"를 다시 계산해 userScrolledUp.current에 그대로
 *     대입한다 — 즉 사용자가 위로 스크롤해도, 다시 바닥 40px 이내로 스크롤해 돌아오면
 *     같은 핸들러가 자동으로 sticky를 재부착한다(별도 "재부착" 버튼/로직 불요, 판정 자체가
 *     매번 갱신되는 구조). thread 변경 useEffect(L408-414)는 userScrolledUp.current가
 *     false일 때만 scrollTop=scrollHeight로 강제한다.
 *   - 멀티패널(PanelView.tsx)은 .ma-p-thread(overflow-y:auto)에 스크롤 추적 로직이
 *     전혀 없었다(scrollRef/handleScroll/자동스크롤 useEffect 전부 부재) — 사용자가
 *     아무 위치로 스크롤하든 상관없이 새 메시지가 계속 쌓여도 뷰가 절대 따라가지 않았다.
 *     "위로 올린 뒤 재부착이 안 된다"는 육안 증상은 사실 애초에 자동 스크롤 자체가
 *     하나도 없었던 것의 극단적 사례다.
 *
 * 봉합: PanelView.tsx에 Conversation.tsx와 동형(threshold 40px, 사용자 스크롤업 중
 *   미강제, 근접 복귀 시 자동 재부착, 전송 시 강제 리셋)의 scrollRef/handleScroll/
 *   자동스크롤 useEffect를 이식.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import { __resetPanelSessionManagerForTests } from '../../../02.Source/renderer/src/store/panelSession'

// ── window.api mock (fb2-p08-banner-revision.test.tsx와 동일 목록) ────────────────

let runIdCounter = 0
let capturedEventCallbacks: Array<(payload: unknown) => void> = []

function emitAgentEvent(runId: string, event: Record<string, unknown>): void {
  capturedEventCallbacks.forEach((cb) => cb({ runId, event }))
}

const mockApi = {
  agentRun: vi.fn().mockImplementation(() => {
    const runId = `run-${runIdCounter}`
    runIdCounter++
    return Promise.resolve({ runId })
  }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  agentInterrupt: vi.fn().mockResolvedValue({}),
  onAgentEvent: vi.fn().mockImplementation((cb: (payload: unknown) => void) => {
    capturedEventCallbacks.push(cb)
    return vi.fn()
  }),
  permissionRespond: vi.fn().mockResolvedValue({ ok: true }),
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  multiSessionLoad: vi.fn().mockResolvedValue({ state: null }),
  workspaceOpen: vi.fn().mockResolvedValue({ root: null, tree: null }),
  pickFolder: vi.fn().mockResolvedValue({ path: null }),
  getUsage: vi.fn().mockResolvedValue({ fiveHour: null, weekly: null }),
  getProfile: vi.fn().mockResolvedValue({}),
  listSlashCommands: vi.fn().mockResolvedValue([]),
  listSkills: vi.fn().mockResolvedValue([]),
  readDir: vi.fn().mockResolvedValue([]),
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
  capturedEventCallbacks = []
  mockApi.agentRun.mockImplementation(() => {
    const runId = `run-${runIdCounter}`
    runIdCounter++
    return Promise.resolve({ runId })
  })
  mockApi.onAgentEvent.mockImplementation((cb: (payload: unknown) => void) => {
    capturedEventCallbacks.push(cb)
    return vi.fn()
  })
  __resetPanelSessionManagerForTests()
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ workspaceMode: 'single', workspaceRoot: null })
})

async function renderMultiWorkspace() {
  useAppStore.setState({ workspaceRoot: '/test/workspace', workspaceMode: 'multi' })
  const { MultiWorkspace } = await import('../../../02.Source/renderer/src/components/00_shell/MultiWorkspace')
  const { container } = render(<MultiWorkspace />)
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

// jsdom은 scrollHeight/clientHeight를 항상 0으로 반환(getter만 존재, 실 레이아웃 없음) —
// 테스트 시나리오에 맞춰 값을 주입하기 위해 defineProperty로 override.
function setScrollHeight(el: HTMLElement, value: number): void {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value })
}
function setClientHeight(el: HTMLElement, value: number): void {
  Object.defineProperty(el, 'clientHeight', { configurable: true, value })
}

describe('MultiWorkspace — 패널 자동 스크롤(.ma-p-thread) 이식', () => {
  it('신규 텍스트 도착 시 바닥까지 자동 스크롤된다', async () => {
    const container = await renderMultiWorkspace()
    const runId0 = await sendFromPanel(container, 0, '테스트')
    const panel0 = container.querySelector('.ma-panel[data-slot="0"]') as HTMLElement
    const threadEl = panel0.querySelector('.ma-p-thread') as HTMLElement
    expect(threadEl).toBeTruthy()

    setClientHeight(threadEl, 200)
    setScrollHeight(threadEl, 500)

    act(() => {
      emitAgentEvent(runId0, { type: 'text', delta: 'hello' })
    })

    expect(threadEl.scrollTop).toBe(500)
  })

  it('사용자가 위로 스크롤한(바닥에서 41px 이상 이탈) 뒤에는 신규 텍스트가 와도 강제로 끌어내리지 않는다', async () => {
    const container = await renderMultiWorkspace()
    const runId0 = await sendFromPanel(container, 0, '테스트')
    const panel0 = container.querySelector('.ma-panel[data-slot="0"]') as HTMLElement
    const threadEl = panel0.querySelector('.ma-p-thread') as HTMLElement

    setClientHeight(threadEl, 200)
    setScrollHeight(threadEl, 500)
    act(() => {
      emitAgentEvent(runId0, { type: 'text', delta: 'hello' })
    })
    expect(threadEl.scrollTop).toBe(500)

    // 사용자가 위로 스크롤: 500-100-200=200 > 40 → 스크롤업 상태
    threadEl.scrollTop = 100
    act(() => {
      fireEvent.scroll(threadEl)
    })

    // 새 콘텐츠 도착(스크롤 높이 증가) — 스크롤업 중이므로 강제 이동 금지
    setScrollHeight(threadEl, 700)
    act(() => {
      emitAgentEvent(runId0, { type: 'text', delta: ' world' })
    })

    expect(threadEl.scrollTop).toBe(100)
  })

  it('사용자가 바닥 근처(40px 이내)로 되돌아오면 다음 신규 메시지부터 다시 자동 스크롤이 붙는다(재부착)', async () => {
    const container = await renderMultiWorkspace()
    const runId0 = await sendFromPanel(container, 0, '테스트')
    const panel0 = container.querySelector('.ma-panel[data-slot="0"]') as HTMLElement
    const threadEl = panel0.querySelector('.ma-p-thread') as HTMLElement

    setClientHeight(threadEl, 200)
    setScrollHeight(threadEl, 500)
    act(() => {
      emitAgentEvent(runId0, { type: 'text', delta: 'a' })
    })
    expect(threadEl.scrollTop).toBe(500)

    // 위로 스크롤 — sticky 해제
    threadEl.scrollTop = 100
    act(() => {
      fireEvent.scroll(threadEl)
    })
    setScrollHeight(threadEl, 600)
    act(() => {
      emitAgentEvent(runId0, { type: 'text', delta: 'b' })
    })
    expect(threadEl.scrollTop).toBe(100) // 아직 안 붙음(회귀 가드)

    // 사용자가 바닥 근처로 되돌아옴: 600-380-200=20 <= 40 → 바닥 근접
    threadEl.scrollTop = 380
    act(() => {
      fireEvent.scroll(threadEl)
    })

    // 재부착 확인: 다음 신규 메시지가 다시 바닥까지 자동으로 따라간다
    setScrollHeight(threadEl, 800)
    act(() => {
      emitAgentEvent(runId0, { type: 'text', delta: 'c' })
    })

    expect(threadEl.scrollTop).toBe(800)
  })

  it('사용자가 위로 스크롤한 상태여도, 직접 새 메시지를 보내면 다시 바닥으로 따라간다(전송 시 강제 리셋 — 단일챗 sendNow와 동형)', async () => {
    const container = await renderMultiWorkspace()
    const runId0 = await sendFromPanel(container, 0, '테스트')
    const panel0 = container.querySelector('.ma-panel[data-slot="0"]') as HTMLElement
    const threadEl = panel0.querySelector('.ma-p-thread') as HTMLElement

    setClientHeight(threadEl, 200)
    setScrollHeight(threadEl, 500)
    act(() => {
      emitAgentEvent(runId0, { type: 'text', delta: 'a' })
    })

    // 위로 스크롤 — sticky 해제
    threadEl.scrollTop = 100
    act(() => {
      fireEvent.scroll(threadEl)
    })

    act(() => {
      emitAgentEvent(runId0, { type: 'done' })
    })

    // 사용자가 직접 새 메시지 전송 — 이 시점에 userScrolledUp 리셋되어야 함
    setScrollHeight(threadEl, 900)
    await sendFromPanel(container, 0, '두번째 메시지')

    expect(threadEl.scrollTop).toBe(900)
  })
})
