import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../../../02_Source/renderer/src/store/appStore'
import {
  __resetSessionLoopDisplayForTests,
  __getSessionLoopDisplaySizeForTests,
  __getSessionRunRoutingSizeForTests,
  sessionLoopDisplayRegistry,
  applyLoopDisplayEventFallback,
} from '../../../02_Source/renderer/src/store/slices/loopDisplay'
import type { ConversationRecord, AgentEventPayload } from '../../../02_Source/shared/ipcContract'
import { installWindowApi } from './helpers/windowApiMock'

function makeRecord(id: string): ConversationRecord {
  return {
    id,
    title: id,
    messages: [],
    backendId: 'claude-code',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

let capturedHandler: ((payload: AgentEventPayload) => void) | null = null

const { api: mockApi } = installWindowApi({
  conversationLoad: async (req: { id?: string; limit?: number }) => {
    if (req.id) return { conversations: [makeRecord(req.id)] }
    return { conversations: [] }
  },
  conversationSave: async () => ({ id: 'cv-x' }),
  onAgentEvent: (cb: (payload: AgentEventPayload) => void) => {
    capturedHandler = cb
    return () => {
      capturedHandler = null
    }
  },
  agentRun: async () => ({ runId: 'run-x' }),
  workspaceOpen: async (req: { folderPath?: string }) => ({ rootPath: req.folderPath ?? null, tree: null }),
})

const LOOP = [{ id: 'cc1', summary: '매분 상태 점검', interval: 'Every minute' }]

beforeEach(() => {
  capturedHandler = null
  __resetSessionLoopDisplayForTests()
  useAppStore.setState({
    conversationId: null,
    currentRunId: null,
    bgRuns: {},
    activeLoops: [],
    loopsStoppedNotice: false,
    pendingCommand: null,
  } as Parameters<typeof useAppStore.setState>[0])
})

async function leaveTo(next: string, simulateRunning = true): Promise<void> {
  if (simulateRunning) {
    useAppStore.setState({ currentRunId: `run-${next}-prev` } as Parameters<typeof useAppStore.setState>[0])
  }
  await useAppStore.getState().selectConversation(next)
}

describe('BF3 Phase 07 경계 ⓐ — bgRuns cap(8) 초과 축출 후 복귀 시 activeLoops 소실 봉합', () => {
  it('A(활성 루프)에서 8개 대화를 더 거쳐 A가 bgRuns에서 evict된 뒤 복귀해도 activeLoops가 보존된다', async () => {
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: 'run-a',
      activeLoops: LOOP,
    } as Parameters<typeof useAppStore.setState>[0])

    await leaveTo('conv-0')
    for (let i = 0; i < 7; i++) {
      await leaveTo(`conv-${i + 1}`)
    }
    expect('A' in useAppStore.getState().bgRuns).toBe(true)

    await leaveTo('conv-8')
    expect('A' in useAppStore.getState().bgRuns).toBe(false)

    await useAppStore.getState().selectConversation('A')

    const after = useAppStore.getState()
    expect(after.conversationId).toBe('A')
    expect(after.activeLoops).toEqual(LOOP)
  })

  it('loopsStoppedNotice·pendingCommand도 동일 경계에서 함께 보존된다', async () => {
    useAppStore.setState({
      conversationId: 'B',
      currentRunId: 'run-b',
      activeLoops: [],
      loopsStoppedNotice: true,
      pendingCommand: { name: 'goal', cardId: 'cmd-1', beforeMsgs: 0, turns: 3 },
    } as Parameters<typeof useAppStore.setState>[0])

    await leaveTo('conv-0')
    for (let i = 0; i < 7; i++) {
      await leaveTo(`conv-${i + 1}`)
    }
    await leaveTo('conv-8')
    expect('B' in useAppStore.getState().bgRuns).toBe(false)

    await useAppStore.getState().selectConversation('B')
    const after = useAppStore.getState()
    expect(after.loopsStoppedNotice).toBe(true)
    expect(after.pendingCommand).toEqual({ name: 'goal', cardId: 'cmd-1', beforeMsgs: 0, turns: 3 })
  })

  it('불변조건: 앱 재시작 시뮬레이션(레지스트리 리셋) 후에는 배너가 복원되지 않는다(stale 방지)', async () => {
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: 'run-a',
      activeLoops: LOOP,
    } as Parameters<typeof useAppStore.setState>[0])

    await leaveTo('conv-0')
    for (let i = 0; i < 7; i++) {
      await leaveTo(`conv-${i + 1}`)
    }
    await leaveTo('conv-8')
    expect('A' in useAppStore.getState().bgRuns).toBe(false)

    __resetSessionLoopDisplayForTests()

    await useAppStore.getState().selectConversation('A')
    expect(useAppStore.getState().activeLoops).toEqual([])
  })

  it('레지스트리 잔존 0: 백그라운드 중 루프가 자연 종료(loops:[] 이벤트)되면 레지스트리 엔트리가 스스로 지워진다', async () => {
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: 'run-a',
      activeLoops: LOOP,
    } as Parameters<typeof useAppStore.setState>[0])

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    await useAppStore.getState().selectConversation('B')
    expect(__getSessionLoopDisplaySizeForTests()).toBeGreaterThan(0)

    expect(capturedHandler).toBeTruthy()
    capturedHandler!({ runId: 'run-a', event: { type: 'loops', loops: [] } })

    expect(__getSessionLoopDisplaySizeForTests()).toBe(0)
    unsubscribe()
  })

  it('축출-후-종료(reviewer 🔴 봉합): A 축출 뒤 도착한 loops:[]가 반영된 후 복귀하면 배너가 미복원된다(stale 방지)', async () => {
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: 'run-a',
      activeLoops: LOOP,
    } as Parameters<typeof useAppStore.setState>[0])

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().selectConversation('conv-0')
    for (let i = 0; i < 7; i++) {
      await leaveTo(`conv-${i + 1}`)
    }
    expect('A' in useAppStore.getState().bgRuns).toBe(true)
    await leaveTo('conv-8')
    expect('A' in useAppStore.getState().bgRuns).toBe(false)

    expect(capturedHandler).toBeTruthy()
    capturedHandler!({ runId: 'run-a', event: { type: 'loops', loops: [] } })

    await useAppStore.getState().selectConversation('A')
    expect(useAppStore.getState().activeLoops).toEqual([])

    unsubscribe()
  })

  it('내구 라우팅 맵 잔존 0: 축출 후 loops:[]가 반영돼 표시 트리오가 완전히 비면 라우팅 엔트리도 함께 정리된다', async () => {
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: 'run-a',
      activeLoops: LOOP,
    } as Parameters<typeof useAppStore.setState>[0])
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().selectConversation('conv-0')
    expect(__getSessionRunRoutingSizeForTests()).toBeGreaterThan(0)
    for (let i = 0; i < 7; i++) {
      await leaveTo(`conv-${i + 1}`)
    }
    await leaveTo('conv-8')
    expect('A' in useAppStore.getState().bgRuns).toBe(false)

    capturedHandler!({ runId: 'run-a', event: { type: 'loops', loops: [] } })

    expect(__getSessionLoopDisplaySizeForTests()).toBe(0)
    expect(__getSessionRunRoutingSizeForTests()).toBe(0)

    unsubscribe()
  })

  it('내구 라우팅 맵 잔존 0: 전경 복귀(bg-restore)로 흡수되면 라우팅 엔트리가 정리된다', async () => {
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: 'run-a',
      activeLoops: LOOP,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().selectConversation('B')
    expect(__getSessionRunRoutingSizeForTests()).toBeGreaterThan(0)

    await useAppStore.getState().selectConversation('A')
    expect(useAppStore.getState().conversationId).toBe('A')
    expect(__getSessionRunRoutingSizeForTests()).toBe(0)
  })

  it('레지스트리 잔존 0: 대화 영구 삭제 시 레지스트리 엔트리가 명시적으로 정리된다', async () => {
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: 'run-a',
      activeLoops: LOOP,
    } as Parameters<typeof useAppStore.setState>[0])
    await leaveTo('B')
    expect(__getSessionLoopDisplaySizeForTests()).toBeGreaterThan(0)
    expect(__getSessionRunRoutingSizeForTests()).toBeGreaterThan(0)

    await useAppStore.getState().deleteConversation('A')
    expect(__getSessionRunRoutingSizeForTests()).toBe(0)
    expect(__getSessionLoopDisplaySizeForTests()).toBe(0)
  })
})

describe('BF3 Phase 07 — reviewer 🟡-2: 활성 대화 재선택(same-id) no-op 가드', () => {
  it('selectConversation(현재 activeId)는 완전 no-op — conversationLoad IPC 미호출 + 라이브 상태(pendingCommand 포함) 불변', async () => {
    let loadCalls = 0
    const mockConversationLoad = mockApi.conversationLoad
    mockApi.conversationLoad = (async (req: { id?: string; limit?: number }) => {
      if (req.id) loadCalls++
      return mockConversationLoad(req)
    }) as typeof mockApi.conversationLoad

    useAppStore.setState({
      conversationId: 'A',
      currentRunId: 'run-a',
      isRunning: true,
      thread: [{ kind: 'msg', id: 'm1', role: 'user', text: '진행 중 메시지(미저장)' }],
      pendingCommand: { name: 'goal', cardId: 'cmd-1', beforeMsgs: 0, turns: 3 },
      activeLoops: LOOP,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().selectConversation('A')

    expect(loadCalls).toBe(0)
    const after = useAppStore.getState()
    expect(after.conversationId).toBe('A')
    expect(after.isRunning).toBe(true)
    expect(after.thread).toEqual([{ kind: 'msg', id: 'm1', role: 'user', text: '진행 중 메시지(미저장)' }])
    expect(after.pendingCommand).toEqual({ name: 'goal', cardId: 'cmd-1', beforeMsgs: 0, turns: 3 })
    expect(after.activeLoops).toEqual(LOOP)

    mockApi.conversationLoad = mockConversationLoad
  })
})

describe('BF3 Phase 07 — 2차 봉합: background-started 순수 크론(leave 시 트리오 빈 상태)', () => {
  it('경로2(routing-aware sync) 단독 봉합: 빈 트리오로 leave → bg에서 loops:[LOOP] 시작(라우팅 그 시점에 등록) → 축출 → loops:[] → 복귀 시 미복원', async () => {
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: 'run-a',
      activeLoops: [],
      loopsStoppedNotice: false,
      pendingCommand: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().selectConversation('conv-0')
    expect(__getSessionRunRoutingSizeForTests()).toBe(0)

    expect(capturedHandler).toBeTruthy()
    capturedHandler!({ runId: 'run-a', event: { type: 'loops', loops: LOOP } })
    expect(__getSessionRunRoutingSizeForTests()).toBeGreaterThan(0)
    expect(useAppStore.getState().bgRuns['A']?.activeLoops).toEqual(LOOP)

    for (let i = 0; i < 7; i++) {
      await leaveTo(`conv-${i + 1}`)
    }
    expect('A' in useAppStore.getState().bgRuns).toBe(true)
    await leaveTo('conv-8')
    expect('A' in useAppStore.getState().bgRuns).toBe(false)

    capturedHandler!({ runId: 'run-a', event: { type: 'loops', loops: [] } })

    await useAppStore.getState().selectConversation('A')
    expect(useAppStore.getState().activeLoops).toEqual([])

    unsubscribe()
  })

  it('run 생성 시점 등록(경로1 봉합): sendMessage 직후(트리오가 여전히 빈 상태여도) 라우팅이 즉시 등록된다 — 패널 SET_RUN_ID와 동형', async () => {
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: null,
      isRunning: false,
      thread: [],
      activeLoops: [],
      loopsStoppedNotice: false,
      pendingCommand: null,
    } as Parameters<typeof useAppStore.setState>[0])

    expect(__getSessionRunRoutingSizeForTests()).toBe(0)

    await useAppStore.getState().sendMessage('안녕')

    expect(useAppStore.getState().activeLoops).toEqual([])
    expect(__getSessionRunRoutingSizeForTests()).toBe(1)
  })

  it('정리 대칭: 루프 없이 끝나는 평범한 run은 done 시점(경로1)에 라우팅이 정리된다', async () => {
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: null,
      isRunning: false,
      thread: [],
      activeLoops: [],
    } as Parameters<typeof useAppStore.setState>[0])

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    await useAppStore.getState().sendMessage('안녕')
    expect(__getSessionRunRoutingSizeForTests()).toBe(1)

    const runId = useAppStore.getState().currentRunId as string
    capturedHandler!({ runId, event: { type: 'done' } })

    expect(__getSessionRunRoutingSizeForTests()).toBe(0)
    unsubscribe()
  })
})

describe('BF3 Phase 07 — applyLoopDisplayEventFallback 단위 검증(reviewer 🟡)', () => {
  beforeEach(() => {
    __resetSessionLoopDisplayForTests()
  })

  it('done: pendingCommand를 무조건 null화하고 activeLoops/loopsStoppedNotice는 불변', () => {
    sessionLoopDisplayRegistry.sync('conv-x', {
      activeLoops: LOOP,
      loopsStoppedNotice: false,
      pendingCommand: { name: 'goal', cardId: 'cmd-1', beforeMsgs: 0, turns: 2 },
    })

    applyLoopDisplayEventFallback('conv-x', { type: 'done' })

    const after = sessionLoopDisplayRegistry.read('conv-x')
    expect(after?.pendingCommand).toBeNull()
    expect(after?.activeLoops).toEqual(LOOP)
  })

  it('error: done과 동형 — pendingCommand만 null화', () => {
    sessionLoopDisplayRegistry.sync('conv-y', {
      activeLoops: [],
      loopsStoppedNotice: true,
      pendingCommand: { name: 'goal', cardId: 'cmd-2', beforeMsgs: 0, turns: 1 },
    })

    applyLoopDisplayEventFallback('conv-y', { type: 'error', message: '실패' })

    const after = sessionLoopDisplayRegistry.read('conv-y')
    expect(after?.pendingCommand).toBeNull()
    expect(after?.loopsStoppedNotice).toBe(true)
  })

  it('done/error: 등록된 적 없는 conversationId(base 없음)에도 안전하게 no-op에 가깝게 동작(pendingCommand null 유지, 신규 엔트리 생성 안 함)', () => {
    applyLoopDisplayEventFallback('conv-never-seen', { type: 'done' })
    expect(sessionLoopDisplayRegistry.read('conv-never-seen')).toBeUndefined()
  })

  it('text/tool_call 등 트리오 무관 이벤트는 no-op(레지스트리 불변)', () => {
    sessionLoopDisplayRegistry.sync('conv-z', {
      activeLoops: LOOP,
      loopsStoppedNotice: false,
      pendingCommand: null,
    })
    const before = sessionLoopDisplayRegistry.read('conv-z')

    applyLoopDisplayEventFallback('conv-z', { type: 'text', delta: '안녕' })

    expect(sessionLoopDisplayRegistry.read('conv-z')).toEqual(before)
  })

  it('loops: activeLoops 덮어쓰기 + 비어있지 않으면 loopsStoppedNotice 자동 해제(handleLoops와 동형)', () => {
    sessionLoopDisplayRegistry.sync('conv-w', {
      activeLoops: [],
      loopsStoppedNotice: true,
      pendingCommand: null,
    })

    applyLoopDisplayEventFallback('conv-w', { type: 'loops', loops: LOOP })

    const after = sessionLoopDisplayRegistry.read('conv-w')
    expect(after?.activeLoops).toEqual(LOOP)
    expect(after?.loopsStoppedNotice).toBe(false)
  })
})
