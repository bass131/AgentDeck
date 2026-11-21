import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetAppStore } from '../00_Helpers/storeReset'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'
import type { AgentEventPayload } from '@shared/ipcContract'

let agentEventHandler: ((payload: AgentEventPayload) => void) | null = null

const mockApi = {
  conversationLoad: async () => ({ conversations: [] }),
  conversationSave: async () => ({ id: 'cv-1' }),
  agentRun: vi.fn(async () => ({ runId: 'r1' })),
  agentAbort: async () => ({ ok: true }),
  agentSetMode: vi.fn(async () => ({ ok: true })),
  onAgentEvent: vi.fn((cb: (payload: AgentEventPayload) => void) => {
    agentEventHandler = cb
    return () => {
      agentEventHandler = null
    }
  }),
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

type Store = Awaited<ReturnType<typeof getStore>>

function resetStore(useAppStore: Store, patch: Record<string, unknown> = {}) {
  mockApi.agentSetMode.mockClear()
  agentEventHandler = null
  resetAppStore(useAppStore, {
    conversationId: null,
    currentRunId: null,
    isRunning: false,
    replMode: true,
    pickerMode: 'normal',
    ...patch,
  })
}

function permissionModePayload(runId: string, mode: string): AgentEventPayload {
  return { runId, event: { type: 'permission_mode', mode } } as unknown as AgentEventPayload
}

describe('gap1-p13 ① setPickerMode — 활성 REPL run 라이브 전환 IPC (RED)', () => {
  let useAppStore: Store

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore, { currentRunId: 'run-live-1', replMode: true })
  })

  it("setPickerMode('plan') → window.api.agentSetMode({runId:'run-live-1', mode:'plan'}) 1회 + 로컬 pickerMode 반영", () => {
    useAppStore.getState().setPickerMode('plan')

    expect(useAppStore.getState().pickerMode).toBe('plan')
    expect(mockApi.agentSetMode).toHaveBeenCalledTimes(1)
    expect(mockApi.agentSetMode).toHaveBeenCalledWith({ runId: 'run-live-1', mode: 'plan' })
  })

  it("setPickerMode('normal') → mode는 picker id 원문 'normal' 그대로(SDK 'default' 변환 금지 — ADR-003)", () => {
    useAppStore.getState().setPickerMode('normal')

    expect(mockApi.agentSetMode).toHaveBeenCalledTimes(1)
    expect(mockApi.agentSetMode).toHaveBeenCalledWith({ runId: 'run-live-1', mode: 'normal' })
  })
})

describe("gap1-p13 ② setPickerMode('bypass') — 라이브 전환 제외 (GREEN 핀·구현 후 불변)", () => {
  it('agentSetMode 미호출 + pickerMode는 bypass로 로컬 변경', async () => {
    const useAppStore = await getStore()
    resetStore(useAppStore, { currentRunId: 'run-live-1', replMode: true })

    useAppStore.getState().setPickerMode('bypass')

    expect(mockApi.agentSetMode).not.toHaveBeenCalled()
    expect(useAppStore.getState().pickerMode).toBe('bypass')
  })
})

describe('gap1-p13 ③ 라이브 전환 게이트 — run 부재·비REPL (GREEN 핀·구현 후 불변)', () => {
  it('currentRunId=null(진행 중 세션 없음) → agentSetMode 미호출 + 로컬 변경만', async () => {
    const useAppStore = await getStore()
    resetStore(useAppStore, { currentRunId: null, replMode: true })

    useAppStore.getState().setPickerMode('plan')

    expect(mockApi.agentSetMode).not.toHaveBeenCalled()
    expect(useAppStore.getState().pickerMode).toBe('plan')
  })

  it('replMode=false(단발 대화) → agentSetMode 미호출 — 라이브 전환은 지속(REPL) 세션 전용', async () => {
    const useAppStore = await getStore()
    resetStore(useAppStore, { currentRunId: 'run-oneshot', replMode: false })

    useAppStore.getState().setPickerMode('plan')

    expect(mockApi.agentSetMode).not.toHaveBeenCalled()
    expect(useAppStore.getState().pickerMode).toBe('plan')
  })
})

describe('gap1-p13 ④ permission_mode 이벤트 → pickerMode 동기화 (RED)', () => {
  let useAppStore: Store
  let unsubscribe: (() => void) | null = null

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore, { currentRunId: 'run-live-1', replMode: true, pickerMode: 'normal' })
    unsubscribe = useAppStore.getState().subscribeAgentEvents()
  })

  it('활성 run(runId 일치)의 permission_mode 수신 → pickerMode가 이벤트 mode로 동기화', () => {
    expect(agentEventHandler).not.toBeNull()

    agentEventHandler!(permissionModePayload('run-live-1', 'acceptEdits'))

    expect(useAppStore.getState().pickerMode).toBe('acceptEdits')
    expect(mockApi.agentSetMode).not.toHaveBeenCalled()

    unsubscribe?.()
  })

  it('타 run(runId 불일치)의 permission_mode 수신 → pickerMode 불변(교차오염 0 — GREEN 핀)', () => {
    expect(agentEventHandler).not.toBeNull()

    agentEventHandler!(permissionModePayload('other-run', 'acceptEdits'))

    expect(useAppStore.getState().pickerMode).toBe('normal')

    unsubscribe?.()
  })

  // 배경 대화 run의 모드 변화는 그 대화의 스냅샷에 남는다(전경 선택기는 그대로).
  it('배경 대화 run의 permission_mode → 그 대화 스냅샷의 pickerMode가 바뀐다', async () => {
    const bg = await import('@renderer/03_Agent/state/backgroundRuns')
    bg.__resetBackgroundRunsForTests()
    bg.__seedBackgroundRunsForTests({
      'conv-bg': { ...useAppStore.getState(), currentRunId: 'run-bg', isRunning: true, pickerMode: 'auto' } as never,
    })
    agentEventHandler!(permissionModePayload('run-bg', 'normal'))
    expect(bg.__backgroundRunOf('conv-bg')?.pickerMode).toBe('normal')
    expect(useAppStore.getState().pickerMode).toBe('normal')
    agentEventHandler!(permissionModePayload('run-bg', 'plan'))
    expect(bg.__backgroundRunOf('conv-bg')?.pickerMode).toBe('plan')
    expect(useAppStore.getState().pickerMode).toBe('normal')
    const saves: unknown[] = []
    const originalSave = mockApi.conversationSave
    mockApi.conversationSave = async (req?: unknown) => { saves.push(req); return { id: 'conv-bg' } }
    try {
      bg.__seedBackgroundRunsForTests({
        'conv-bg': { ...bg.__backgroundRunOf('conv-bg')!, thread: [{ kind: 'msg', id: 'm1', role: 'user', text: 'hi' }], selectedModel: 'sonnet' } as never,
      })
      agentEventHandler!({ runId: 'run-bg', event: { type: 'done' } } as unknown as AgentEventPayload)
      expect(saves).toHaveLength(1)
      expect(saves.at(-1)).toMatchObject({ conversation: { id: 'conv-bg', mode: 'plan', model: 'sonnet' } })
    } finally {
      mockApi.conversationSave = originalSave
    }
    bg.__resetBackgroundRunsForTests()
    unsubscribe?.()
  })
})
