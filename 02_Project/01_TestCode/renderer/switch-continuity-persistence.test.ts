import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from '../../../02_Project/00_Source/renderer/src/store/appStore'
import type {
  ConversationRecord,
  AgentEventPayload,
  ConversationSaveRequest,
  ConversationSaveResponse,
} from '../../../02_Project/00_Source/shared/ipcContract'
import type { ThreadItem } from '../../../02_Project/00_Source/renderer/src/store/threadTypes'
import { installWindowApi } from './helpers/windowApiMock'

const CONV_A_BASE: ConversationRecord = {
  id: 'A',
  title: '대화 A',
  messages: [{ role: 'user', content: 'A의 질문' }],
  backendId: 'claude-code',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  sessionId: 'sess-a',
  cwd: 'C:\\projA',
}

const CONV_B_BASE: ConversationRecord = {
  id: 'B',
  title: '대화 B',
  messages: [],
  backendId: 'claude-code',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  sessionId: 'sess-b',
  cwd: 'C:\\projB',
}

let capturedHandler: ((payload: AgentEventPayload) => void) | null = null

const conversationSaveMock = vi.fn(
  async (req: ConversationSaveRequest): Promise<ConversationSaveResponse> => ({
    id: req.conversation.id ?? 'cv-generated',
  })
)

installWindowApi({
  conversationLoad: async (req: { id?: string; limit?: number }) => {
    if (req.id === 'A') return { conversations: [CONV_A_BASE] }
    if (req.id === 'B') return { conversations: [CONV_B_BASE] }
    if (req.id) return { conversations: [] }
    return { conversations: [CONV_A_BASE, CONV_B_BASE] }
  },
  conversationSave: conversationSaveMock,
  onAgentEvent: (cb: (payload: AgentEventPayload) => void) => {
    capturedHandler = cb
    return () => {
      capturedHandler = null
    }
  },
  agentRun: async () => ({ runId: 'run-a' }),
  workspaceOpen: async (req: { folderPath?: string }) => ({
    rootPath: req.folderPath ?? null,
    tree: null,
  }),
})

function threadTexts(items: ThreadItem[]): string[] {
  return items
    .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
    .map((item) => item.text)
}

function setupRunningA(): void {
  useAppStore.setState({
    conversationId: 'A',
    currentRunId: 'run-a',
    isRunning: true,
    thread: [
      { kind: 'msg', id: 'm-a-user', role: 'user', text: 'A의 질문' },
      { kind: 'msg', id: 'm-a-assistant', role: 'assistant', text: '1부터 셉니다: 1, 2, 3' },
    ],
    openGroupId: null,
    openMsgId: 'm-a-assistant',
    seq: 2,
    errorMessage: undefined,
    sessionId: 'sess-a',
  } as Parameters<typeof useAppStore.setState>[0])
}

describe('switch-continuity — P3c 백그라운드 라우팅 영속: bg done/session이 conversationSave를 발화한다', () => {
  beforeEach(() => {
    capturedHandler = null
    conversationSaveMock.mockClear()
    useAppStore.setState({ bgRuns: {} } as Parameters<typeof useAppStore.setState>[0])
    setupRunningA()
  })

  it('[P3c-Tdone] 🔴 bg run-a의 done 이벤트가 도착하면 conversationSave가 A의 데이터(누적 텍스트 포함)로 호출된다', async () => {
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    expect(capturedHandler).not.toBeNull()

    await useAppStore.getState().selectConversation('B')
    expect(useAppStore.getState().conversationId).toBe('B')
    const bThreadBefore = useAppStore.getState().thread

    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 4', messageId: 'm-a-assistant' },
    })
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 5', messageId: 'm-a-assistant' },
    })

    capturedHandler!({ runId: 'run-a', event: { type: 'done' } })

    const saveCall = conversationSaveMock.mock.calls.find(([req]) => req.conversation.id === 'A')
    expect(saveCall).toBeDefined()
    const savedMessages = saveCall![0].conversation.messages
    const assistantMsg = savedMessages.find((m) => m.role === 'assistant')
    expect(assistantMsg?.content).toContain(', 4')
    expect(assistantMsg?.content).toContain(', 5')

    const after = useAppStore.getState()
    expect(after.conversationId).toBe('B')
    expect(after.thread).toEqual(bThreadBefore)
    expect(conversationSaveMock.mock.calls.some(([req]) => req.conversation.id === 'B')).toBe(false)

    unsubscribe()
  })

  it('[P3c-Tsession] 🔴 bg run-a의 session 이벤트가 도착하면 conversationSave가 A 레코드에 새 sessionId로 호출된다(B의 sessionId 불변)', async () => {
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    expect(capturedHandler).not.toBeNull()

    await useAppStore.getState().selectConversation('B')
    expect(useAppStore.getState().conversationId).toBe('B')
    expect(useAppStore.getState().sessionId).toBe('sess-b')

    capturedHandler!({ runId: 'run-a', event: { type: 'session', sessionId: 'sess-a-new' } })

    const saveCall = conversationSaveMock.mock.calls.find(([req]) => req.conversation.id === 'A')
    expect(saveCall).toBeDefined()
    expect(saveCall![0].conversation.sessionId).toBe('sess-a-new')

    expect(useAppStore.getState().sessionId).toBe('sess-b')

    unsubscribe()
  })

  it('[P3c-Tsync] bg done 후 A로 복귀하면 대화 데이터(thread)와 그 저장 파생분이 백그라운드 누적분을 포함한다', async () => {
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().selectConversation('B')

    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 4', messageId: 'm-a-assistant' },
    })
    capturedHandler!({ runId: 'run-a', event: { type: 'done' } })

    await useAppStore.getState().selectConversation('A')

    const after = useAppStore.getState()
    expect(after.conversationId).toBe('A')
    expect(threadTexts(after.thread).join('')).toContain(', 4')

    const assistantItem = after.thread.find(
      (item): item is Extract<ThreadItem, { kind: 'msg' }> =>
        item.kind === 'msg' && item.role === 'assistant'
    )
    expect(assistantItem?.text).toContain(', 4')

    conversationSaveMock.mockClear()
    await useAppStore.getState().saveConversation()
    const saveCall = conversationSaveMock.mock.calls.find(([req]) => req.conversation.id === 'A')
    expect(saveCall).toBeDefined()
    const persistedAssistant = saveCall![0].conversation.messages.find((m) => m.role === 'assistant')
    expect(persistedAssistant?.content).toContain(', 4')

    unsubscribe()
  })
})
