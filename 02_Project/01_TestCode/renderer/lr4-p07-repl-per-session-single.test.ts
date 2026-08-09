import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeInitialState } from '../../../02_Project/00_Source/renderer/src/store/reducer'
import { buildConversationSavePayload } from '../../../02_Project/00_Source/renderer/src/store/slices/conversationPayload'
import type { ConversationPayloadSource } from '../../../02_Project/00_Source/renderer/src/store/slices/conversationPayload'
import type { ThreadItem } from '../../../02_Project/00_Source/renderer/src/store/threadTypes'

// eslint-disable-next-line prefer-const
let capturedAgentRun: { [k: string]: unknown } | null = null

function getCapture(): { [k: string]: unknown } {
  if (!capturedAgentRun) throw new Error('agentRun이 호출되지 않음')
  return capturedAgentRun
}

const recordA = {
  id: 'conv-A',
  title: '대화 A',
  messages: [
    { role: 'user', content: '안녕 A' },
    { role: 'assistant', content: '반가워 A' },
  ],
  backendId: 'claude-code',
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
  replMode: false,
}
const recordB = {
  id: 'conv-B',
  title: '대화 B',
  messages: [{ role: 'user', content: '안녕 B' }],
  backendId: 'claude-code',
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}
const recordLegacy = {
  id: 'conv-legacy',
  title: '옛 대화',
  messages: [{ role: 'user', content: '옛 메시지' }],
  backendId: 'claude-code',
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
}

const mockApi = {
  conversationLoad: vi.fn(async (req?: { id?: string; limit?: number }) => {
    if (req?.id === 'conv-A') return { conversations: [recordA] }
    if (req?.id === 'conv-B') return { conversations: [recordB] }
    if (req?.id === 'conv-legacy') return { conversations: [recordLegacy] }
    return { conversations: [recordA] }
  }),
  conversationSave: vi.fn(async () => ({ id: 'conv-A' })),
  agentRun: vi.fn(async (req: { [k: string]: unknown }) => {
    capturedAgentRun = req
    return { runId: (req.sessionKey as string) ?? 'r1' }
  }),
  agentAbort: async () => ({ accepted: true }),
  onAgentEvent: () => () => {},
  listFiles: async () => ({ files: [] }),
  getUsage: async () => ({ fiveHour: null, weekly: null }),
  pathForFile: () => '',
  workspaceOpen: async () => ({ rootPath: null, tree: null }),
  referenceList: async () => ({ references: [] }),
  referenceTree: async () => ({ tree: null }),
  referenceAdd: async () => ({ reference: null }),
  fsRead: async () => ({ kind: 'not-found' }),
}

Object.defineProperty(globalThis, 'window', {
  value: { api: mockApi },
  writable: true,
  configurable: true,
})

async function getStore() {
  const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
  return useAppStore
}

function resetStore(
  useAppStore: Awaited<ReturnType<typeof getStore>>,
  replMode: boolean
) {
  capturedAgentRun = null
  mockApi.agentRun.mockClear()
  useAppStore.setState({
    ...makeInitialState(),
    messages: [],
    conversationId: null,
    attachedImages: [],
    queue: [],
    currentRunId: null,
    isRunning: false,
    bgRuns: {},
    replMode,
  } as Parameters<typeof useAppStore.setState>[0])
}

describe('LR4 P07 시나리오 1(단일): 대화별 replMode 독립 복원', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>
  beforeEach(async () => {
    useAppStore = await getStore()
  })

  it('대화 A(replMode=false) 선택 → store.replMode=false 복원', async () => {
    resetStore(useAppStore, true)
    await useAppStore.getState().selectConversation('conv-A')
    expect(useAppStore.getState().replMode).toBe(false)
  })

  it('대화 B(replMode 미설정) 선택 → 기본 true (A의 false가 새지 않음)', async () => {
    resetStore(useAppStore, false)
    await useAppStore.getState().selectConversation('conv-B')
    expect(useAppStore.getState().replMode).toBe(true)
  })
})

describe('LR4 P07 시나리오 2(단일): conversationSave payload에 replMode 포함', () => {
  function sourceWith(replMode: boolean | undefined): ConversationPayloadSource {
    const thread: ThreadItem[] = [{ kind: 'msg', id: 'm1', role: 'user', text: 'hi' }]
    return { thread, workspaceRoot: null, ...(replMode !== undefined ? { replMode } : {}) } as ConversationPayloadSource
  }

  it('source.replMode=false → payload.replMode===false', () => {
    const payload = buildConversationSavePayload(sourceWith(false), 'conv-x')
    expect(payload).not.toBeNull()
    expect((payload as { replMode?: boolean }).replMode).toBe(false)
  })

  it('source.replMode=true → payload.replMode===true', () => {
    const payload = buildConversationSavePayload(sourceWith(true), 'conv-x')
    expect((payload as { replMode?: boolean }).replMode).toBe(true)
  })

  it('source.replMode 미지정 → payload에 replMode 미포함 (compat — 회귀 0)', () => {
    const payload = buildConversationSavePayload(sourceWith(undefined), 'conv-x')
    expect(payload).not.toBeNull()
    expect('replMode' in (payload as object)).toBe(false)
  })
})

describe('LR4 P07 시나리오 3(단일): 복원된 세션 replMode로 send held-open 게이트', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>
  beforeEach(async () => {
    useAppStore = await getStore()
  })

  it('replMode=false 대화 로드 후 send → agentRun에 persistent/sessionKey 미포함', async () => {
    resetStore(useAppStore, true)
    await useAppStore.getState().loadConversation()

    capturedAgentRun = null
    await useAppStore.getState().sendMessage('테스트')

    expect(capturedAgentRun).not.toBeNull()
    const cap = getCapture()
    expect(cap.persistent).toBeFalsy()
    expect(cap.sessionKey).toBeUndefined()
  })
})

describe('LR4 P07 시나리오 4(단일): 옛 레코드 로드 하위호환 (크래시 0 + 폴백)', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>
  beforeEach(async () => {
    useAppStore = await getStore()
  })

  it('replMode 미설정 옛 레코드 선택 → 크래시 0 + 폴백 기본 true (미시드 전역 마이그값)', async () => {
    resetStore(useAppStore, false)
    await expect(useAppStore.getState().selectConversation('conv-legacy')).resolves.toBeUndefined()
    expect(useAppStore.getState().replMode).toBe(true)
  })
})
