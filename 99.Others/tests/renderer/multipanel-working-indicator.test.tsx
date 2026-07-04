// @vitest-environment jsdom
/**
 * multipanel-working-indicator.test.tsx — 멀티패널 응답 대기 인디케이터 이식
 * (영호 육안 피드백 2026-07-04 ④: "MultiPanel에서 채팅으로 사용자가 요청하면,
 * Claude가 답변을 하기 전에 아무런 표시가 없어서 가시성이 떨어짐").
 *
 * 진단(코드 실측):
 *   - 단일챗(Conversation.tsx)은 sendMessage(slices/runtime.ts L97/L128)가 user 메시지를
 *     thread에 push하는 것과 "같은 set() 호출 안에서" isRunning:true를 낙관적으로 설정한다
 *     (백엔드 첫 이벤트 도착 전에도 즉시 true). Conversation.tsx L771-780의 WorkingIndicator는
 *     이 isRunning 플래그 하나만으로 즉시 표시된다.
 *   - 멀티패널(panelSession.ts)의 ADD_USER_MESSAGE/ADD_COMMAND_CARD 리듀서 케이스는 이
 *     낙관적 isRunning 설정이 없었다 — isRunning은 오직 첫 'text'/'thinking'/'tool_call'
 *     이벤트(reducer/text.ts·tool.ts)가 도착해야 true가 된다. 그 사이(사용자 전송~첫 토큰)
 *     구간에는 PanelView에 WorkingIndicator 자체도 없었다 — 이중으로 표시가 비어 있었다.
 *
 * 봉합: panelReducer의 ADD_USER_MESSAGE/ADD_COMMAND_CARD에 단일챗과 동형으로
 *   isRunning:true를 추가(panelSession.ts) + PanelView.tsx에 Conversation.tsx의
 *   WorkingIndicator를 동일 게이팅 조건(isRunning && !pendingQuestion && !pendingPermission
 *   && !lastIsLiveAssistant)으로 이식.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import {
  __resetPanelSessionManagerForTests,
  makePanelInitialState,
  panelReducerFn,
} from '../../../02.Source/renderer/src/store/panelSession'

// ── window.api mock (fb2-p08-banner-revision.test.tsx와 동일 목록 — MultiWorkspace 완전 마운트) ──

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

/** 패널 slot의 textarea를 통해 메시지 전송 → agentRun이 반환한 runId 획득 (bf3-p06 헬퍼 동형). */
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

// ═══════════════════════════════════════════════════════════════════════════════
// 리듀서 단위 — 낙관적 isRunning (단일챗 sendMessage와 동형)
// ═══════════════════════════════════════════════════════════════════════════════

describe('panelReducerFn — ADD_USER_MESSAGE/ADD_COMMAND_CARD 낙관적 isRunning', () => {
  it('ADD_USER_MESSAGE 디스패치 직후 isRunning=true (첫 이벤트 도착 전에도 즉시 반영)', () => {
    const base = makePanelInitialState()
    expect(base.isRunning).toBe(false)

    const next = panelReducerFn(base, { type: 'ADD_USER_MESSAGE', content: '안녕', time: '12:00' })

    expect(next.isRunning).toBe(true)
  })

  it('ADD_COMMAND_CARD(/goal 등) 디스패치 직후 isRunning=true', () => {
    const base = makePanelInitialState()

    const next = panelReducerFn(base, {
      type: 'ADD_COMMAND_CARD',
      name: 'goal',
      cardId: 'pcmd-1',
      time: '12:00',
      detail: '목표',
    })

    expect(next.isRunning).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 통합 — MultiWorkspace(usePanelSlot 실경로) — WorkingIndicator DOM 반영
// ═══════════════════════════════════════════════════════════════════════════════

describe('MultiWorkspace — 패널 응답 대기 인디케이터(.thinking) 이식', () => {
  it('메시지 전송 직후(첫 텍스트 도착 전) 패널에 .thinking 인디케이터가 표시된다', async () => {
    const container = await renderMultiWorkspace()
    await sendFromPanel(container, 0, '테스트 메시지')

    const panel0 = container.querySelector('.ma-panel[data-slot="0"]') as HTMLElement
    expect(panel0.querySelector('.thinking')).toBeTruthy()
  })

  it('첫 텍스트 델타 도착 후에는 인디케이터가 사라지고 실 스트리밍 버블만 남는다', async () => {
    const container = await renderMultiWorkspace()
    const runId0 = await sendFromPanel(container, 0, '테스트 메시지')

    const panel0 = container.querySelector('.ma-panel[data-slot="0"]') as HTMLElement
    expect(panel0.querySelector('.thinking')).toBeTruthy()

    act(() => {
      emitAgentEvent(runId0, { type: 'text', delta: '안녕하세요' })
    })

    // 인디케이터는 사라지고 실 스트리밍 버블(.msg.ai-msg)이 그 자리를 대신한다.
    // 텍스트 자체는 SmoothMarkdown(RAF 기반 점진 reveal)이 그려 jsdom에서 프레임이
    // 흐르지 않으면 즉시 보이지 않을 수 있어(구현과 무관한 타이밍) 구조만 단언.
    expect(panel0.querySelector('.thinking')).toBeFalsy()
    expect(panel0.querySelector('.msg.ai-msg')).toBeTruthy()
  })

  it('권한 요청 대기 중에는 인디케이터가 억제된다(ADR-030 — 단일챗과 동일 정책)', async () => {
    const container = await renderMultiWorkspace()
    const runId0 = await sendFromPanel(container, 0, '테스트 메시지')

    const panel0 = container.querySelector('.ma-panel[data-slot="0"]') as HTMLElement
    expect(panel0.querySelector('.thinking')).toBeTruthy()

    act(() => {
      emitAgentEvent(runId0, { type: 'permission_request', requestId: 'req-0', toolName: 'Bash', summary: 'ls' })
    })

    expect(panel0.querySelector('.thinking')).toBeFalsy()
  })

  it('done 이벤트 후에는 인디케이터가 사라진다', async () => {
    const container = await renderMultiWorkspace()
    const runId0 = await sendFromPanel(container, 0, '테스트 메시지')

    act(() => {
      emitAgentEvent(runId0, { type: 'done' })
    })

    const panel0 = container.querySelector('.ma-panel[data-slot="0"]') as HTMLElement
    expect(panel0.querySelector('.thinking')).toBeFalsy()
  })

  it('다른 패널(슬롯1)은 영향받지 않는다 — 슬롯0만 인디케이터 표시', async () => {
    const container = await renderMultiWorkspace()
    await sendFromPanel(container, 0, '슬롯0 메시지')

    const panel1 = container.querySelector('.ma-panel[data-slot="1"]') as HTMLElement
    expect(panel1.querySelector('.thinking')).toBeFalsy()
  })
})
