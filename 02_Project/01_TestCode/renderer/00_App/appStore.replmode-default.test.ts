// 작업 ID: lr2-01 · 옛 이름 lr2-01-replmode-default.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetAppStore } from '../00_Helpers/storeReset'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

// eslint-disable-next-line prefer-const
let capturedAgentRun: { [k: string]: unknown } | null = null

function getCapture(): { [k: string]: unknown } {
  if (!capturedAgentRun) throw new Error('agentRun이 호출되지 않음')
  return capturedAgentRun
}

const mockApi = {
  conversationLoad: async () => ({ conversations: [] }),
  conversationSave: async () => ({ id: 'cv-1' }),
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
  value: { api: adaptFlatApi(mockApi) },
  writable: true,
  configurable: true,
})

async function getStore() {
  const { useAppStore } = await import('@renderer/00_App/appStore')
  return useAppStore
}

function resetStore(useAppStore: Awaited<ReturnType<typeof getStore>>) {
  capturedAgentRun = null
  mockApi.agentRun.mockClear()
  resetAppStore(useAppStore, {
    messages: [],
    conversationId: null,
    attachedImages: [],
    queue: [],
    currentRunId: null,
    isRunning: false,
  })
}

describe('LR3-03 T1: replMode 기본값 계약', () => {
  it('store 초기값 replMode === true (held-open 지속세션이 기본값 — AUTO 세션 수명이 비용 상쇄)', async () => {
    const useAppStore = await getStore()
    expect(useAppStore.getState().replMode).toBe(true)
  })
})

describe('LR2-01 T2: 명시적 setReplMode(false) → 단발+resume 페이로드', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
  })

  it('sessionId 보유 상태에서 sendMessage → persistent/sessionKey 미포함 + resumeSessionId 포함', async () => {
    useAppStore.getState().setReplMode(false)
    useAppStore.setState({ sessionId: 'sess-prev' } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().sendMessage('안녕')

    expect(capturedAgentRun).not.toBeNull()
    const cap = getCapture()
    expect(cap.persistent).toBeFalsy()
    expect(cap.sessionKey).toBeUndefined()
    expect(cap.resumeSessionId).toBe('sess-prev')
  })

  // M06 G4: 대화가 마지막으로 잰 컨텍스트 창을 실행 요청에 싣는다 — main이 기록 재적재 예산을 그 창으로 정한다.
  it('lastContextWindow 보유 상태에서 sendMessage → contextWindow 포함', async () => {
    useAppStore.getState().setReplMode(false)
    useAppStore.setState({ sessionId: 'sess-prev', lastContextWindow: 200_000 } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().sendMessage('안녕')

    expect(getCapture().contextWindow).toBe(200_000)
  })

  it('lastContextWindow가 없으면 contextWindow 키를 싣지 않는다', async () => {
    useAppStore.getState().setReplMode(false)
    useAppStore.setState({ sessionId: 'sess-prev', lastContextWindow: undefined } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().sendMessage('안녕')

    expect('contextWindow' in getCapture()).toBe(false)
  })

  // M11 G2 — M06 Backlog 18. 모델을 바꾼 뒤 첫 실행은 옛 모델이 잰 창을 예산으로 싣지 않는다.
  // 계기는 잰 창을 그대로 보여 사용량이 창을 넘어 보이지 않는다(M06 Backlog 2).
  it('모델을 바꾼 뒤 첫 실행은 contextWindow를 싣지 않고, 계기의 창은 그대로다', async () => {
    useAppStore.getState().setReplMode(false)
    useAppStore.setState({ sessionId: 'sess-prev', selectedModel: 'claude-opus-5-5', lastContextWindow: 1_000_000 } as Parameters<typeof useAppStore.setState>[0])
    useAppStore.getState().setSelectedModel('claude-haiku-4-5-20251001')
    expect(useAppStore.getState().lastContextWindow).toBe(1_000_000)

    await useAppStore.getState().sendMessage('안녕')

    expect('contextWindow' in getCapture()).toBe(false)

    // 새 모델의 턴이 창을 새로 재면 다시 싣는다
    useAppStore.setState({ currentRunId: null, isRunning: false, lastContextWindow: 200_000, contextWindowStale: false } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().sendMessage('다시')
    expect(getCapture().contextWindow).toBe(200_000)
  })
})

describe('LR2-01 T3: 명시적 setReplMode(true) → held-open 페이로드', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
  })

  it('setReplMode(true) 후 sendMessage → agentRun에 persistent:true + sessionKey 포함', async () => {
    useAppStore.getState().setReplMode(true)
    await useAppStore.getState().sendMessage('안녕')

    expect(capturedAgentRun).not.toBeNull()
    const cap = getCapture()
    expect(cap.persistent).toBe(true)
    expect(typeof cap.sessionKey).toBe('string')
    expect((cap.sessionKey as string).length).toBeGreaterThan(0)
  })
})
