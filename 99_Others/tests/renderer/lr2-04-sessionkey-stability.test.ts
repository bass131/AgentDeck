import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetAppStore } from './helpers/storeReset'

const capturedRuns: { [k: string]: unknown }[] = []

const mockApi = {
  conversationLoad: async () => ({ conversations: [] }),
  conversationSave: vi.fn(async () => ({ id: 'cv-stable-1' })),
  agentRun: vi.fn(async (req: { [k: string]: unknown }) => {
    capturedRuns.push(req)
    return { runId: (req.sessionKey as string) ?? `r${capturedRuns.length}` }
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
  setUiPref: async () => ({ ok: true }),
  getUiPrefs: async () => ({ prefs: {} }),
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

function resetStore(useAppStore: Awaited<ReturnType<typeof getStore>>) {
  capturedRuns.length = 0
  mockApi.agentRun.mockClear()
  mockApi.conversationSave.mockClear()
  resetAppStore(useAppStore, {
    messages: [],
    conversationId: null,
    attachedImages: [],
    queue: [],
    currentRunId: null,
    isRunning: false,
  })
}

describe('LR2-04 T1: 신규 대화(convId=null)에서 sessionKey가 대화 생애 안정', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
  })

  it('replMode ON·2회 send → 두 agentRun sessionKey 동일 && === conversationId (고아 세션 벡터 제거)', async () => {
    useAppStore.getState().setReplMode(true)

    await useAppStore.getState().sendMessage('첫 메시지')
    useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().sendMessage('두 번째 메시지')

    expect(capturedRuns.length).toBe(2)
    const key1 = capturedRuns[0].sessionKey as string
    const key2 = capturedRuns[1].sessionKey as string

    expect(key1).toBe(key2)
    expect(key1).toBe('cv-stable-1')
    expect(useAppStore.getState().conversationId).toBe('cv-stable-1')
    expect(capturedRuns[0].persistent).toBe(true)
    expect(capturedRuns[1].persistent).toBe(true)
  })
})

describe('LR2-04 T2: 기존 대화(convId 보유)는 기존 거동 그대로', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
  })

  it('convId="cv-exist" + replMode ON → sessionKey === "cv-exist" (선저장 미발동)', async () => {
    useAppStore.getState().setReplMode(true)
    useAppStore.setState({ conversationId: 'cv-exist' } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().sendMessage('안녕')

    expect(capturedRuns.length).toBe(1)
    expect(capturedRuns[0].sessionKey).toBe('cv-exist')
    expect(capturedRuns[0].persistent).toBe(true)
  })
})

describe('LR2-04 T3: 단발(OFF) 경로 회귀 0', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
  })

  it('replMode OFF·신규 대화 → persistent/sessionKey 미포함 (선저장이 OFF 경로에 새지 않음)', async () => {
    useAppStore.getState().setReplMode(false)

    await useAppStore.getState().sendMessage('안녕')

    expect(capturedRuns.length).toBe(1)
    expect(capturedRuns[0].persistent).toBeFalsy()
    expect(capturedRuns[0].sessionKey).toBeUndefined()
  })
})

describe('LR2-04 T4: 선저장 실패 시 폴백', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
  })

  it('conversationSave reject → sessionKey는 currentSessionKey 폴백 + send 정상 진행', async () => {
    useAppStore.getState().setReplMode(true)
    const stableKey = useAppStore.getState().currentSessionKey
    mockApi.conversationSave.mockImplementationOnce(async () => {
      throw new Error('disk full')
    })

    await useAppStore.getState().sendMessage('첫 메시지')

    expect(capturedRuns.length).toBe(1)
    expect(capturedRuns[0].sessionKey).toBe(stableKey)
    expect(capturedRuns[0].persistent).toBe(true)
  })
})
