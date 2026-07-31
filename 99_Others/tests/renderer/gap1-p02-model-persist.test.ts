import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeInitialState } from '../../../02_Source/renderer/src/store/reducer'
import { buildConversationSavePayload } from '../../../02_Source/renderer/src/store/slices/conversationPayload'
import type { ConversationPayloadSource } from '../../../02_Source/renderer/src/store/slices/conversationPayload'
import type { ThreadItem } from '../../../02_Source/renderer/src/store/threadTypes'
import { DEFAULT_MODEL } from '../../../02_Source/renderer/src/lib/pickerOptions'

const recordA = {
  id: 'conv-A',
  title: '대화 A',
  messages: [
    { role: 'user', content: '안녕 A' },
    { role: 'assistant', content: '반가워 A' },
  ],
  backendId: 'claude-code',
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T00:00:00.000Z',
  model: 'sonnet',
}
const recordB = {
  id: 'conv-B',
  title: '대화 B',
  messages: [{ role: 'user', content: '안녕 B' }],
  backendId: 'claude-code',
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T00:00:00.000Z',
}

const mockApi = {
  conversationLoad: vi.fn(async (req?: { id?: string; limit?: number }) => {
    if (req?.id === 'conv-A') return { conversations: [recordA] }
    if (req?.id === 'conv-B') return { conversations: [recordB] }
    return { conversations: [recordA] }
  }),
  conversationSave: vi.fn(async () => ({ id: 'conv-A' })),
  agentRun: vi.fn(async (req: { [k: string]: unknown }) => ({ runId: (req.sessionKey as string) ?? 'r1' })),
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
  const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
  return useAppStore
}

function resetStore(
  useAppStore: Awaited<ReturnType<typeof getStore>>,
  selectedModel: string
) {
  useAppStore.setState({
    ...makeInitialState(),
    messages: [],
    conversationId: null,
    attachedImages: [],
    queue: [],
    currentRunId: null,
    isRunning: false,
    bgRuns: {},
    selectedModel,
  } as Parameters<typeof useAppStore.setState>[0])
}

describe('GAP1 P02 시나리오 1: 대화별 selectedModel 독립 복원(selectConversation)', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>
  beforeEach(async () => {
    useAppStore = await getStore()
  })

  it('대화 A(model=sonnet) 선택 → store.selectedModel="sonnet" 복원', async () => {
    resetStore(useAppStore, DEFAULT_MODEL)
    await useAppStore.getState().selectConversation('conv-A')
    expect(useAppStore.getState().selectedModel).toBe('sonnet')
  })

  it('대화 B(model 미설정) 선택 → DEFAULT_MODEL 폴백(A의 sonnet이 새지 않음)', async () => {
    resetStore(useAppStore, 'sonnet')
    await useAppStore.getState().selectConversation('conv-B')
    expect(useAppStore.getState().selectedModel).toBe(DEFAULT_MODEL)
  })
})

describe('GAP1 P02 시나리오 2: conversationSave payload에 model 포함', () => {
  function sourceWith(model: string | undefined): ConversationPayloadSource {
    const thread: ThreadItem[] = [{ kind: 'msg', id: 'm1', role: 'user', text: 'hi' }]
    return { thread, workspaceRoot: null, ...(model !== undefined ? { model } : {}) } as ConversationPayloadSource
  }

  it('source.model="haiku" → payload.model==="haiku"', () => {
    const payload = buildConversationSavePayload(sourceWith('haiku'), 'conv-x')
    expect(payload).not.toBeNull()
    expect((payload as { model?: string }).model).toBe('haiku')
  })

  it('source.model 미지정 → payload에 model 미포함(compat — 회귀 0)', () => {
    const payload = buildConversationSavePayload(sourceWith(undefined), 'conv-x')
    expect(payload).not.toBeNull()
    expect('model' in (payload as object)).toBe(false)
  })
})

describe('GAP1 P02 시나리오 3: loadConversation model 복원(폴백 포함)', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>
  beforeEach(async () => {
    useAppStore = await getStore()
  })

  it('최근 대화(recordA, model=sonnet) 로드 → store.selectedModel="sonnet"', async () => {
    resetStore(useAppStore, DEFAULT_MODEL)
    await useAppStore.getState().loadConversation()
    expect(useAppStore.getState().selectedModel).toBe('sonnet')
  })

  it('conv.model 없는 레코드 로드 → DEFAULT_MODEL 폴백(크래시 0)', async () => {
    mockApi.conversationLoad.mockImplementationOnce(async () => ({ conversations: [recordB] }))
    resetStore(useAppStore, 'sonnet')
    await expect(useAppStore.getState().loadConversation()).resolves.toBeUndefined()
    expect(useAppStore.getState().selectedModel).toBe(DEFAULT_MODEL)
  })
})
