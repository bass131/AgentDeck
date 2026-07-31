import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from '../../../02_Source/renderer/src/store/appStore'
import type { ConversationRecord, AgentEventPayload } from '../../../02_Source/shared/ipcContract'
import type { ThreadItem } from '../../../02_Source/renderer/src/store/threadTypes'

const CONV_B: ConversationRecord = {
  id: 'B',
  title: '대화 B',
  messages: [],
  backendId: 'claude-code',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  sessionId: 'sess-b',
}

let capturedHandler: ((payload: AgentEventPayload) => void) | null = null

const mockApi = {
  conversationLoad: async (req: { id?: string; limit?: number }) => {
    if (req.id === 'B') return { conversations: [CONV_B] }
    if (req.id) return { conversations: [] }
    return { conversations: [CONV_B] }
  },
  conversationSave: async () => ({ id: 'cv-x' }),
  conversationRename: async () => ({ ok: true }),
  conversationDelete: async () => ({ ok: true }),
  setUiPref: async (_req: { key: string; value: unknown }) => ({ ok: true }),
  onAgentEvent: (cb: (payload: AgentEventPayload) => void) => {
    capturedHandler = cb
    return () => {
      capturedHandler = null
    }
  },
  agentRun: vi.fn(async () => ({ runId: 'run-a' })),
  agentAbort: async () => ({ accepted: true }),
  agentInterrupt: async () => ({ accepted: true }),
}

Object.defineProperty(globalThis, 'window', {
  value: { api: mockApi },
  writable: true,
  configurable: true,
})

function threadTexts(items: ThreadItem[]): string[] {
  return items
    .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
    .map((item) => item.text)
}

describe('switch-continuity — P3a correctness 바닥: subscription 레벨 runId 필터 + currentRunId 정합', () => {
  beforeEach(() => {
    capturedHandler = null
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: 'run-a',
      isRunning: true,
      thread: [{ kind: 'msg', id: 'm-a-user', role: 'user', text: 'A의 질문' }],
      messages: [{ id: 'm-a-user', role: 'user', content: 'A의 질문' }],
      openGroupId: null,
      openMsgId: null,
      seq: 1,
      errorMessage: undefined,
      sessionId: 'sess-a',
    } as Parameters<typeof useAppStore.setState>[0])
  })

  it('[P3a-1] run-a 구독 라이브 상태에서 B로 전환 후, run-a의 늦은 text가 B thread로 새면 안 된다', async () => {
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    expect(capturedHandler).not.toBeNull()

    expect(useAppStore.getState().currentRunId).toBe('run-a')
    expect(useAppStore.getState().conversationId).toBe('A')
    expect(useAppStore.getState().isRunning).toBe(true)

    await useAppStore.getState().selectConversation('B')

    const afterSwitch = useAppStore.getState()
    expect(afterSwitch.conversationId).toBe('B')
    expect(afterSwitch.thread).toHaveLength(0)

    expect(capturedHandler).not.toBeNull()
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: 'A에서 새어나온 텍스트', messageId: 'leak-msg-a' },
    })

    const afterLeak = useAppStore.getState()
    const leakedTexts = threadTexts(afterLeak.thread)

    expect(leakedTexts).not.toContain('A에서 새어나온 텍스트')

    unsubscribe()
  })

  it('[P3a-2] selectConversation(\'B\')(B는 실행 중 아님) 후 currentRunId는 이전 대화(A)의 run-a가 아니라 B의 값(null)이어야 한다', async () => {
    expect(useAppStore.getState().currentRunId).toBe('run-a')

    await useAppStore.getState().selectConversation('B')

    const afterSwitch = useAppStore.getState()
    expect(afterSwitch.conversationId).toBe('B')
    expect(afterSwitch.currentRunId).toBe(null)
  })

  it('[P3a-3] 전환 후 늦은 run-a 이벤트가 도착해도 B에 유령 "생각 중"(isRunning=true)이 켜지면 안 된다', async () => {
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().selectConversation('B')
    expect(useAppStore.getState().isRunning).toBe(false)

    expect(capturedHandler).not.toBeNull()
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: 'A에서 새어나온 텍스트(유령 표시 진단)', messageId: 'leak-msg-a3' },
    })

    expect(useAppStore.getState().isRunning).toBe(false)

    unsubscribe()
  })

  it('[P3a-4] sendMessage 후 currentRunId가 즉시 세팅되고, 그 뒤 도착하는 활성 run 이벤트는 드롭되지 않는다(순서 불변식)', async () => {
    useAppStore.setState({
      conversationId: 'ORDER-INVARIANT',
      currentRunId: null,
      isRunning: false,
      thread: [],
      messages: [],
      openGroupId: null,
      openMsgId: null,
      seq: 1,
      errorMessage: undefined,
      sessionId: undefined,
    } as Parameters<typeof useAppStore.setState>[0])

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    expect(capturedHandler).not.toBeNull()

    mockApi.agentRun.mockResolvedValueOnce({ runId: 'rX' })

    await useAppStore.getState().sendMessage('순서 불변식 확인용 메시지')

    expect(useAppStore.getState().currentRunId).toBe('rX')

    expect(capturedHandler).not.toBeNull()
    capturedHandler!({
      runId: 'rX',
      event: { type: 'text', delta: '드롭되면 안 되는 텍스트', messageId: 'order-invariant-msg' },
    })

    const texts = threadTexts(useAppStore.getState().thread)
    expect(texts).toContain('드롭되면 안 되는 텍스트')

    unsubscribe()
  })

})
