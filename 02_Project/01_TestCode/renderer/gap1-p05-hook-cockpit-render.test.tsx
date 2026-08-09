// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'
import type { ThreadItem } from '../../../02_Project/00_Source/renderer/src/store/threadTypes'

const mockUnsub = vi.fn()
const mockApi = {
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(mockUnsub),
  listFiles: vi.fn().mockResolvedValue({ files: [] }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.onAgentEvent.mockReturnValue(mockUnsub)
  mockApi.listFiles.mockResolvedValue({ files: [] })
})
afterEach(() => cleanup())

const HOOK_TIMELINE_PATH = '../../../02_Project/00_Source/renderer/src/features/notice'

const sampleRuns = [
  { hookId: 'h1', hookName: 'PreToolUse:Bash', hookEvent: 'PreToolUse', status: 'success', exitCode: 0 },
  { hookId: 'h2', hookName: 'Stop', hookEvent: 'Stop', status: 'running' },
]

async function importHookTimeline(): Promise<{ HookTimeline: unknown }> {
  return (await import(/* @vite-ignore */ HOOK_TIMELINE_PATH)) as { HookTimeline: unknown }
}

describe('gap1-p05 HookTimeline — 소음 억제(접힘 기본·토글 펼침)', () => {
  it('(i) 컨테이너 data-testid="hook-timeline" 렌더 · (iii) 요약 data-testid="hook-timeline-summary" 항상 표시', async () => {
    const { HookTimeline } = (await importHookTimeline()) as { HookTimeline: React.ComponentType<{ hookRuns: unknown[] }> }
    const { container } = await act(async () => render(<HookTimeline hookRuns={sampleRuns} />))
    expect(container.querySelector('[data-testid="hook-timeline"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="hook-timeline-summary"]')).toBeTruthy()
  })

  it('(ii) 접힘 기본 — 상세 data-testid="hook-timeline-detail"이 초기 렌더에 없음', async () => {
    const { HookTimeline } = (await importHookTimeline()) as { HookTimeline: React.ComponentType<{ hookRuns: unknown[] }> }
    const { container } = await act(async () => render(<HookTimeline hookRuns={sampleRuns} />))
    expect(container.querySelector('[data-testid="hook-timeline-detail"]')).toBeNull()
  })

  it('(iv)(v) toggle 클릭 → 상세 표시 + hookRuns 항목(PreToolUse:Bash)이 상세에 렌더', async () => {
    const { HookTimeline } = (await importHookTimeline()) as { HookTimeline: React.ComponentType<{ hookRuns: unknown[] }> }
    const { container } = await act(async () => render(<HookTimeline hookRuns={sampleRuns} />))
    const toggle = container.querySelector('[data-testid="hook-timeline-toggle"]') as HTMLElement
    expect(toggle).toBeTruthy()
    await act(async () => { fireEvent.click(toggle) })
    const detail = container.querySelector('[data-testid="hook-timeline-detail"]')
    expect(detail).toBeTruthy()
    expect(detail?.textContent).toContain('PreToolUse:Bash')
  })
})

async function setStore(patch: Record<string, unknown>) {
  const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
  useAppStore.setState({
    thread: [] as ThreadItem[],
    messages: [],
    streamingText: '',
    toolCards: [],
    isRunning: false,
    errorMessage: undefined,
    thinkingText: null,
    todos: [],
    openGroupId: null,
    openMsgId: null,
    seq: 0,
    ...patch,
  } as Parameters<typeof useAppStore.setState>[0])
}

async function renderConv() {
  const { Conversation } = await import('../../../02_Project/00_Source/renderer/src/features/conversation/Conversation')
  return act(async () => render(<Conversation />))
}

describe('gap1-p05 대화 인라인 — informational · permission_denied 표시', () => {
  it('informational thread item → content 문구가 대화에 렌더된다', async () => {
    await setStore({
      thread: [
        {
          kind: 'informational',
          id: 'inf1',
          content: 'UserPromptSubmit 훅이 입력을 차단했습니다: 금지된 경로',
          level: 'warning',
        },
      ] as unknown as ThreadItem[],
    })
    const { container } = await renderConv()
    expect(container.textContent).toContain('UserPromptSubmit 훅이 입력을 차단했습니다: 금지된 경로')
  })

  it('permission-denied thread item → toolName·decisionReason 문구가 대화에 렌더된다', async () => {
    await setStore({
      thread: [
        {
          kind: 'permission-denied',
          id: 'pd1',
          toolName: 'Bash',
          decisionReasonType: 'rule',
          decisionReason: 'deny 규칙에 의해 차단: Bash(rm:*)',
        },
      ] as unknown as ThreadItem[],
    })
    const { container } = await renderConv()
    expect(container.textContent).toContain('Bash')
    expect(container.textContent).toContain('deny 규칙에 의해 차단: Bash(rm:*)')
  })
})
