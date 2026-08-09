import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../../../02_Project/00_Source/renderer/src/store/appStore'
import type { ConversationRecord, AgentEventPayload } from '../../../02_Project/00_Source/shared/ipcContract'
import type { ThreadItem } from '../../../02_Project/00_Source/renderer/src/store/threadTypes'
import type { AttachedImage } from '../../../02_Project/00_Source/renderer/src/store/slices/types'
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

installWindowApi({
  conversationLoad: async (req: { id?: string; limit?: number }) => {
    if (req.id === 'A') return { conversations: [CONV_A_BASE] }
    if (req.id === 'B') return { conversations: [CONV_B_BASE] }
    if (req.id) return { conversations: [] }
    return { conversations: [CONV_A_BASE, CONV_B_BASE] }
  },
  conversationSave: async () => ({ id: 'cv-x' }),
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
    messages: [
      { id: 'm-a-user', role: 'user', content: 'A의 질문' },
      { id: 'm-a-assistant', role: 'assistant', content: '1부터 셉니다: 1, 2, 3' },
    ],
    openGroupId: null,
    openMsgId: 'm-a-assistant',
    seq: 2,
    errorMessage: undefined,
    sessionId: 'sess-a',
  } as Parameters<typeof useAppStore.setState>[0])
}

describe('switch-continuity — P3b seamless: 백그라운드 실행 보존(설계=추천안 a, bgRuns 맵)', () => {
  beforeEach(() => {
    capturedHandler = null
    setupRunningA()
  })

  it('[P3b-T1] A를 떠나 B로 전환 후 run-a가 백그라운드로 계속되면, A로 복귀 시 그 진행이 이어져 보인다', async () => {
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    expect(capturedHandler).not.toBeNull()

    expect(useAppStore.getState().conversationId).toBe('A')
    expect(useAppStore.getState().currentRunId).toBe('run-a')
    expect(useAppStore.getState().isRunning).toBe(true)

    await useAppStore.getState().selectConversation('B')
    expect(useAppStore.getState().conversationId).toBe('B')

    expect(capturedHandler).not.toBeNull()
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 4', messageId: 'm-a-assistant' },
    })
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 5', messageId: 'm-a-assistant' },
    })
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 6', messageId: 'm-a-assistant' },
    })

    await useAppStore.getState().selectConversation('A')

    const after = useAppStore.getState()
    expect(after.conversationId).toBe('A')
    const joined = threadTexts(after.thread).join('')

    expect(joined).toContain(', 4')
    expect(joined).toContain(', 5')
    expect(joined).toContain(', 6')

    expect(after.isRunning).toBe(true)

    unsubscribe()
  })

  it('[P3b-T2a] B를 보는 동안 run-a 텍스트는 B thread에 새지 않는다(교차오염 0 — P3a 유지 확인)', async () => {
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().selectConversation('B')
    expect(useAppStore.getState().conversationId).toBe('B')

    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: '누출되면 안 되는 텍스트', messageId: 'm-a-assistant' },
    })

    const bState = useAppStore.getState()
    expect(bState.conversationId).toBe('B')
    expect(threadTexts(bState.thread).join('')).not.toContain('누출되면 안 되는 텍스트')

    unsubscribe()
  })

  it('[P3b-T2b] B를 보는 동안 도착한 run-a 텍스트도, A로 복귀하면 A thread에 보존돼 있어야 한다', async () => {
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().selectConversation('B')

    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 4', messageId: 'm-a-assistant' },
    })

    await useAppStore.getState().selectConversation('A')

    const after = useAppStore.getState()
    expect(after.conversationId).toBe('A')
    expect(threadTexts(after.thread).join('')).toContain(', 4')

    unsubscribe()
  })

  it('[P3b-Tcwd] 🔴 A(cwd=projA)에서 B(cwd=projB)로 전환 후 A로 복귀하면 workspaceRoot도 A의 cwd로 복원돼야 한다', async () => {
    useAppStore.setState({ workspaceRoot: 'C:\\projA' } as Parameters<typeof useAppStore.setState>[0])

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().selectConversation('B')
    expect(useAppStore.getState().workspaceRoot).toBe('C:\\projB')

    expect(capturedHandler).not.toBeNull()
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 4', messageId: 'm-a-assistant' },
    })

    await useAppStore.getState().selectConversation('A')

    expect(useAppStore.getState().workspaceRoot).toBe('C:\\projA')

    unsubscribe()
  })

  it('[P3b-Timg] 🟡#1 A(attachedImages 1개+restoredSession=true)에서 B로 전환 후 복귀하면 그 값이 A로 복원돼야 한다(B값이 새면 안 됨)', async () => {
    const aImage: AttachedImage = { path: 'C:\\imgs\\a.png', dataUrl: 'data:image/png;base64,AAA==' }
    useAppStore.setState({
      attachedImages: [aImage],
      restoredSession: true,
    } as Parameters<typeof useAppStore.setState>[0])

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().selectConversation('B')
    expect(useAppStore.getState().attachedImages).toEqual([])
    expect(useAppStore.getState().restoredSession).toBe(false)

    await useAppStore.getState().selectConversation('A')

    const after = useAppStore.getState()
    expect(after.attachedImages).toEqual([aImage])
    expect(after.restoredSession).toBe(true)

    unsubscribe()
  })

})

describe('switch-continuity — P3b-2 "새 대화" seamless: newConversation도 진행 중 대화를 스냅샷해 복귀 시 이어진다', () => {
  beforeEach(() => {
    capturedHandler = null
    setupRunningA()
  })

  it('[P3b2-T1] A 실행 중 "새 대화" 클릭 → 새 대화 전환 뒤 도착한 run-a 텍스트가 A 복귀 시 보존된다', async () => {
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    expect(capturedHandler).not.toBeNull()

    expect(useAppStore.getState().conversationId).toBe('A')
    expect(useAppStore.getState().currentRunId).toBe('run-a')
    expect(useAppStore.getState().isRunning).toBe(true)

    useAppStore.getState().newConversation()

    const justAfterNew = useAppStore.getState()
    expect(justAfterNew.conversationId).toBeNull()
    expect(threadTexts(justAfterNew.thread)).toEqual([])

    expect(capturedHandler).not.toBeNull()
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 4', messageId: 'm-a-assistant' },
    })
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 5', messageId: 'm-a-assistant' },
    })
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 6', messageId: 'm-a-assistant' },
    })

    await useAppStore.getState().selectConversation('A')

    const after = useAppStore.getState()
    expect(after.conversationId).toBe('A')
    const joined = threadTexts(after.thread).join('')
    expect(joined).toContain(', 4')
    expect(joined).toContain(', 5')
    expect(joined).toContain(', 6')

    unsubscribe()
  })

  it('[P3b2-T2] A가 실행 중이 아닐 때 "새 대화"는 스냅샷 없이 그냥 리셋한다(불필요 bgRuns 엔트리 방지)', () => {
    useAppStore.setState({
      currentRunId: null,
      isRunning: false,
    } as Parameters<typeof useAppStore.setState>[0])

    useAppStore.getState().newConversation()

    const after = useAppStore.getState()
    expect(after.conversationId).toBeNull()
    expect(threadTexts(after.thread)).toEqual([])
    expect('A' in after.bgRuns).toBe(false)
  })
})
