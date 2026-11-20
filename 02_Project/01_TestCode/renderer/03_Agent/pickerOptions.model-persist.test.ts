// 작업 ID: gap1-p02 · 옛 이름 gap1-p02-model-persist.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeInitialState } from '@renderer/05_Conversation/state/reducer'
import { buildConversationSavePayload } from '@renderer/06_Sessions/state/conversationPayload'
import type { ConversationPayloadSource } from '@renderer/06_Sessions/state/conversationPayload'
import type { ThreadItem } from '@renderer/05_Conversation/state/threadTypes'
import { DEFAULT_MODEL } from '@renderer/03_Agent/pickerOptions'
import { FALLBACK_MODELS } from '@shared/03_Agent/models/knownModels'
import { __resetBackgroundRunsForTests } from '@renderer/03_Agent/state/backgroundRuns'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

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
  value: { api: adaptFlatApi(mockApi) },
  writable: true,
  configurable: true,
})

async function getStore() {
  const { useAppStore } = await import('@renderer/00_App/appStore')
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
    selectedModel,
    modelRows: [...FALLBACK_MODELS],
  } as Parameters<typeof useAppStore.setState>[0])
  __resetBackgroundRunsForTests()
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

  // 손으로 적은 DEFAULT_MODEL이 아니라 SDK 목록이 기본값을 정한다
  it('대화 B(model 미설정) 선택 → 지금 목록 default 행의 정식 ID (M06 Backlog 17)', async () => {
    resetStore(useAppStore, 'sonnet')
    useAppStore.setState({
      modelRows: [{ value: 'default', resolvedModel: 'claude-fable-5-2', displayName: 'Default', description: '', supportedEffortLevels: [] }],
    } as never)
    await useAppStore.getState().selectConversation('conv-B')
    expect(useAppStore.getState().selectedModel).toBe('claude-fable-5-2')
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
    expect('mode' in (payload as object)).toBe(false)
  })

  // M11 G2 — M06 Backlog 1. 권한 모드도 같은 길로 저장 payload에 실린다.
  it('source.mode → payload.mode', () => {
    const payload = buildConversationSavePayload({ ...sourceWith('haiku'), mode: 'plan' }, 'conv-x')
    expect(payload).toMatchObject({ mode: 'plan', model: 'haiku' })
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

  it('저장된 권한 모드가 있는 최근 대화 로드 → pickerMode도 그 값(M06 Backlog 1)', async () => {
    mockApi.conversationLoad.mockImplementationOnce(async () => ({ conversations: [{ ...recordA, mode: 'plan' }] }))
    resetStore(useAppStore, DEFAULT_MODEL)
    await useAppStore.getState().loadConversation()
    expect(useAppStore.getState().pickerMode).toBe('plan')
  })

  it('conv.model 없는 레코드 로드 → DEFAULT_MODEL 폴백(크래시 0)', async () => {
    mockApi.conversationLoad.mockImplementationOnce(async () => ({ conversations: [recordB] }))
    resetStore(useAppStore, 'sonnet')
    await expect(useAppStore.getState().loadConversation()).resolves.toBeUndefined()
    expect(useAppStore.getState().selectedModel).toBe(DEFAULT_MODEL)
  })

  // M11 G2 — M06 Backlog 17. 모델 없는 옛 레코드의 기본값도 지금 목록의 default 행을 따른다.
  it('conv.model 없는 레코드 로드 → 지금 목록 default 행의 정식 ID', async () => {
    mockApi.conversationLoad.mockImplementationOnce(async () => ({ conversations: [recordB] }))
    resetStore(useAppStore, 'sonnet')
    useAppStore.setState({
      modelRows: [{ value: 'default', resolvedModel: 'claude-fable-5-2', displayName: 'Default', description: '', supportedEffortLevels: [] }],
    } as never)
    await useAppStore.getState().loadConversation()
    expect(useAppStore.getState().selectedModel).toBe('claude-fable-5-2')
  })

  // M06 G4: 옛 ID로 저장된 대화는 그 ID 그대로 열리고 이어서 보낼 때도 그 ID로 간다(정식 ID로 몰래 바꾸지 않는다).
  it('옛 ID(claude-haiku-4-5) 대화 로드 → selectedModel이 그대로이고 다음 실행 요청에 그 값이 실린다', async () => {
    const oldRecord = { ...recordA, id: 'conv-old', model: 'claude-haiku-4-5' }
    mockApi.conversationLoad.mockImplementationOnce(async () => ({ conversations: [oldRecord] }))
    resetStore(useAppStore, DEFAULT_MODEL)
    await useAppStore.getState().loadConversation()
    expect(useAppStore.getState().selectedModel).toBe('claude-haiku-4-5')
    mockApi.agentRun.mockClear()
    await useAppStore.getState().sendMessage('이어서', { model: useAppStore.getState().selectedModel, effort: 'max', mode: 'auto' })
    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)
    expect((mockApi.agentRun.mock.calls[0] as unknown as [{ model?: string }])[0].model).toBe('claude-haiku-4-5')
  })
})
