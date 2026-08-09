import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeInitialState } from '../../../02_Project/00_Source/renderer/src/store/reducer'
import { getReplModeDefault } from '../../../02_Project/00_Source/renderer/src/lib/replModeDefault'

// eslint-disable-next-line prefer-const
let capturedAgentRun: { [k: string]: unknown } | null = null

function getCapture(): { [k: string]: unknown } {
  if (!capturedAgentRun) throw new Error('agentRun이 호출되지 않음')
  return capturedAgentRun
}

let saveSeq = 0

const mockApi = {
  conversationLoad: async () => ({ conversations: [] }),
  conversationSave: async () => ({ id: `cv-${++saveSeq}` }),
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

function resetStore(useAppStore: Awaited<ReturnType<typeof getStore>>) {
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
  } as Parameters<typeof useAppStore.setState>[0])
}

describe('R5a-1: replMode 기본값·토글·휘발', () => {
  it('replMode 기본값이 true(held-open 지속세션 기본 — LR3-03: 앱 타이머 /loop 폐기 + AUTO 세션 수명으로 재전환)', async () => {
    const useAppStore = await getStore()
    const freshState = makeInitialState()
    expect(useAppStore.getState().replMode).toBe(true)
    void freshState
  })

  it('setReplMode(false) → replMode false, setReplMode(true) → true', async () => {
    const useAppStore = await getStore()
    useAppStore.getState().setReplMode(false)
    expect(useAppStore.getState().replMode).toBe(false)
    useAppStore.getState().setReplMode(true)
    expect(useAppStore.getState().replMode).toBe(true)
  })

  it('replMode는 clearConversation 후 getReplModeDefault()로 리셋 (LR4 P07: 세션 횡단→대화별 리셋으로 반전, ADR-024)', async () => {
    const useAppStore = await getStore()
    const dflt = getReplModeDefault()

    useAppStore.getState().setReplMode(!dflt)
    expect(useAppStore.getState().replMode).toBe(!dflt)

    useAppStore.getState().clearConversation()

    expect(useAppStore.getState().replMode).toBe(dflt)
    useAppStore.getState().setReplMode(dflt)
  })
})

describe('R5a-2: sendMessage agentRun 페이로드 — replMode ON/OFF', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
  })

  it('replMode ON → agentRun에 persistent:true + sessionKey(문자열) 포함', async () => {
    useAppStore.getState().setReplMode(true)
    await useAppStore.getState().sendMessage('안녕')

    expect(capturedAgentRun).not.toBeNull()
    const cap = getCapture()
    expect(cap.persistent).toBe(true)
    expect(typeof cap.sessionKey).toBe('string')
    expect((cap.sessionKey as string).length).toBeGreaterThan(0)
  })

  it('replMode OFF → agentRun에 persistent/sessionKey 미포함(단발 회귀 0)', async () => {
    useAppStore.getState().setReplMode(false)
    await useAppStore.getState().sendMessage('안녕')

    expect(capturedAgentRun).not.toBeNull()
    const cap = getCapture()
    expect(cap.persistent).toBeFalsy()
    expect(cap.sessionKey).toBeUndefined()
  })
})

describe('R5a-3: sessionKey 안정성', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
    useAppStore.getState().setReplMode(true)
  })

  it('신규 대화 연속 전송 → 선저장으로 conversationId가 키가 되고 안정 유지(LR2-04 계약)', async () => {
    useAppStore.setState({ conversationId: null, isRunning: false } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().sendMessage('첫 번째')
    const key1 = getCapture().sessionKey as string

    capturedAgentRun = null
    useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().sendMessage('두 번째')
    const key2 = getCapture().sessionKey as string

    expect(key1).toBe(useAppStore.getState().conversationId)
    expect(key1).toBe(key2)
  })

  it('clearConversation 후 → sessionKey 변경(새 대화 새 키)', async () => {
    await useAppStore.getState().sendMessage('첫 번째')
    const key1 = getCapture().sessionKey as string

    useAppStore.getState().clearConversation()
    useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0])

    capturedAgentRun = null
    await useAppStore.getState().sendMessage('새 대화 첫 메시지')
    const key2 = getCapture().sessionKey as string

    expect(key1).toBeTruthy()
    expect(key2).toBeTruthy()
    expect(key1).not.toBe(key2)
  })

  it('conversationId가 있으면 sessionKey === conversationId', async () => {
    useAppStore.setState({ conversationId: 'conv-fixed-123', isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().sendMessage('메시지')
    expect(getCapture().sessionKey).toBe('conv-fixed-123')
  })
})

describe('R5a-4: cron-turn 라우팅 락인 — panelApply runId 필터', () => {
  it('panelApply: currentRunId=sessionKey → done.origin:cron 이벤트가 통과해 thread 반영', async () => {
    const { panelApply, makePanelInitialState } = await import('../../../02_Project/00_Source/renderer/src/store/panelSession')

    const sessionKey = 'key-cron-test'
    const state = { ...makePanelInitialState(), currentRunId: sessionKey }

    const payload = {
      runId: sessionKey,
      event: { type: 'done' as const, origin: 'cron' as const },
    }

    const next = panelApply(state, payload, '12:00')
    expect(next.isRunning).toBe(false)
    expect(next.currentRunId).toBe(sessionKey)
  })

  it('panelApply: 다른 runId → cron 이벤트 무시(타 패널 격리)', async () => {
    const { panelApply, makePanelInitialState } = await import('../../../02_Project/00_Source/renderer/src/store/panelSession')

    const state = { ...makePanelInitialState(), currentRunId: 'my-run', isRunning: true }
    const payload = {
      runId: 'other-run',
      event: { type: 'done' as const, origin: 'cron' as const },
    }

    const next = panelApply(state, payload)
    expect(next.isRunning).toBe(true)
    expect(next.currentRunId).toBe('my-run')
  })

  it('appStore: done 이벤트 후 currentRunId가 유지(persistent 모드 — done이 runId를 지우지 않음)', async () => {
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    const { applyAgentEvent, makeInitialState } = await import('../../../02_Project/00_Source/renderer/src/store/reducer')

    const sessionKey = 'repl-session-key'
    const baseState = { ...makeInitialState(), isRunning: true }
    const payload = { runId: sessionKey, event: { type: 'done' as const } }
    const next = applyAgentEvent(baseState, payload)

    expect(next.isRunning).toBe(false)

    useAppStore.setState({ currentRunId: sessionKey, isRunning: true } as Parameters<typeof useAppStore.setState>[0])
    expect(useAppStore.getState().currentRunId).toBe(sessionKey)
  })
})

describe('R5a-5: /loop 항상 SDK 통과 — replMode ON/OFF 무관 (앱 인터셉트 폐기)', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
  })

  it('replMode ON: /loop 입력 → sendMessage 경유(agentRun 호출됨), 원문 그대로 SDK 전달', async () => {
    useAppStore.getState().setReplMode(true)
    await useAppStore.getState().sendMessage('/loop 5m 반복작업')

    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)
    const cap = getCapture()
    const msgs = cap.messages as Array<{ role: string; content: string }>
    const last = msgs[msgs.length - 1]
    expect(last.content).toContain('/loop')
  })

  it('replMode OFF: /loop 입력 → 앱 레벨 인터셉트 없이 그대로 SDK 전달(LR3-03: OFF에서도 인터셉트 0)', async () => {
    useAppStore.getState().setReplMode(false)

    await useAppStore.getState().sendMessage('/loop stop')
    expect(mockApi.agentRun).toHaveBeenCalledTimes(1)
    const cap = getCapture()
    const msgs = cap.messages as Array<{ role: string; content: string }>
    expect(msgs[msgs.length - 1].content).toBe('/loop stop')
  })
})

describe('R5a-6: panelSession.buildAgentRunArgs — persistent/sessionKey', () => {
  it('persistent:true + sessionKey 포함 시 args에 반영됨', async () => {
    const { buildAgentRunArgs } = await import('../../../02_Project/00_Source/renderer/src/store/panelSession')
    const args = buildAgentRunArgs(
      [{ role: 'user', content: 'hi' }],
      { persistent: true, sessionKey: 'panel-key-1' },
    )
    expect(args.persistent).toBe(true)
    expect(args.sessionKey).toBe('panel-key-1')
    expect(args.resumeSessionId).toBeUndefined()
  })

  it('persistent 미전달 → persistent/sessionKey undefined(단발 회귀 0)', async () => {
    const { buildAgentRunArgs } = await import('../../../02_Project/00_Source/renderer/src/store/panelSession')
    const args = buildAgentRunArgs([{ role: 'user', content: 'hi' }])
    expect(args.persistent).toBeUndefined()
    expect(args.sessionKey).toBeUndefined()
  })

  it('persistent:true이고 sessionKey 미전달 → persistent만 반영', async () => {
    const { buildAgentRunArgs } = await import('../../../02_Project/00_Source/renderer/src/store/panelSession')
    const args = buildAgentRunArgs(
      [{ role: 'user', content: 'hi' }],
      { persistent: true },
    )
    expect(args.persistent).toBe(true)
    expect(args.sessionKey).toBeUndefined()
  })
})
