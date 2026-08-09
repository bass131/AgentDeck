// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentEventPayload } from '../../../02_Project/00_Source/shared/ipcContract'
import type { AgentEvent } from '../../../02_Project/00_Source/shared/agentEvents'
import type { FileTreeNode } from '../../../02_Project/00_Source/shared/ipcContract'
import type { AppState } from '../../../02_Project/00_Source/renderer/src/store/reducer'
import type { ThreadItem } from '../../../02_Project/00_Source/renderer/src/store/threadTypes'
import {
  applyAgentEvent,
  makeInitialState,
} from '../../../02_Project/00_Source/renderer/src/store/reducer'

function allThreadToolCards(state: AppState) {
  return state.thread
    .filter((item): item is Extract<ThreadItem, { kind: 'toolgroup' }> => item.kind === 'toolgroup')
    .flatMap((group) => group.tools)
}

function threadMsgs(state: AppState): Extract<ThreadItem, { kind: 'msg' }>[] {
  return state.thread.filter(
    (item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg'
  )
}

function lastAssistantText(state: AppState): string {
  const msgs = state.thread
    .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> =>
      item.kind === 'msg' && item.role === 'assistant'
    )
  return msgs[msgs.length - 1]?.text ?? ''
}

type OnAgentEventCallback = (payload: AgentEventPayload) => void

function buildMockApi() {
  let capturedCallback: OnAgentEventCallback | null = null

  const mockUnsubscribe = vi.fn()

  const api = {
    workspaceOpen: vi.fn(),
    workspaceTree: vi.fn().mockResolvedValue({ tree: null }),
    agentRun: vi.fn(),
    agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
    onAgentEvent: vi.fn((cb: OnAgentEventCallback) => {
      capturedCallback = cb
      return mockUnsubscribe
    }),
    fsDiff: vi.fn(),
    conversationLoad: vi.fn(),
    conversationSave: vi.fn(),
  }

  function emitEvents(runId: string, events: AgentEvent[]) {
    if (!capturedCallback) throw new Error('onAgentEvent 콜백이 아직 등록되지 않음')
    for (const event of events) {
      capturedCallback({ runId, event })
    }
  }

  return { api, emitEvents, mockUnsubscribe }
}

const FAKE_TREE: FileTreeNode = {
  name: 'workspace',
  path: '',
  kind: 'directory',
  children: [
    { name: 'src', path: 'src', kind: 'directory', children: [
      { name: 'index.ts', path: 'src/index.ts', kind: 'file' },
      { name: 'utils.ts', path: 'src/utils.ts', kind: 'file' },
    ]},
    { name: 'README.md', path: 'README.md', kind: 'file' },
  ],
}

const FAKE_ROOT = '/workspace/project'
const FAKE_RUN_ID = 'run-integration-001'

const CORE_LOOP_EVENTS: AgentEvent[] = [
  { type: 'text', delta: 'Hello, ' },
  { type: 'text', delta: 'I will help you.' },
  {
    type: 'tool_call',
    id: 'tc-bash-001',
    name: 'bash',
    input: { command: 'ls src/' },
  },
  {
    type: 'tool_result',
    id: 'tc-bash-001',
    ok: true,
    output: 'index.ts\nutils.ts',
  },
  { type: 'file_changed', path: 'src/utils.ts', change: 'modify' },
  { type: 'file_changed', path: 'src/new-file.ts', change: 'add' },
  {
    type: 'done',
    usage: { inputTokens: 150, outputTokens: 80 },
  },
]

describe('Phase 06 핵심 루프 — store 통합', () => {
  beforeEach(async () => {
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    const { makeInitialState } = await import('../../../02_Project/00_Source/renderer/src/store/reducer')
    useAppStore.setState({
      ...makeInitialState(),
      workspaceRoot: null,
      fileTree: null,
      diffFilePath: null,
      conversationId: null,
      backendLabel: 'Claude Code',
    })
    vi.clearAllMocks()
  })

  it('openWorkspace → fileTree 와 workspaceRoot가 store에 반영된다', async () => {
    const { api } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.workspaceOpen.mockResolvedValue({ rootPath: FAKE_ROOT, tree: FAKE_TREE })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    await useAppStore.getState().openWorkspace()

    const state = useAppStore.getState()
    expect(state.workspaceRoot).toBe(FAKE_ROOT)
    expect(state.fileTree).toEqual(FAKE_TREE)
    expect(api.workspaceOpen).toHaveBeenCalledOnce()
  })

  it('openWorkspace에서 null을 반환하면 store 상태가 변하지 않는다', async () => {
    const { api } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.workspaceOpen.mockResolvedValue({ rootPath: null, tree: null })
    api.conversationLoad.mockResolvedValue({ conversations: [] })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    await useAppStore.getState().openWorkspace()

    const state = useAppStore.getState()
    expect(state.workspaceRoot).toBeNull()
    expect(state.fileTree).toBeNull()
  })

  it('sendMessage → 스트리밍 이벤트 시퀀스 → assistant 메시지 확정 + done 후 isRunning=false', async () => {
    const { api, emitEvents } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.agentRun.mockResolvedValue({ runId: FAKE_RUN_ID })
    api.conversationSave.mockResolvedValue({ id: 'conv-001' })
    api.conversationLoad.mockResolvedValue({ conversations: [] })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().sendMessage('테스트 메시지')

    emitEvents(FAKE_RUN_ID, CORE_LOOP_EVENTS)

    const state = useAppStore.getState()

    expect(state.isRunning).toBe(false)

    const assistantMessages = threadMsgs(state).filter((m) => m.role === 'assistant')
    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0].text).toBe('Hello, I will help you.')

    expect(lastAssistantText(state)).toBe('Hello, I will help you.')

    expect(state.lastUsage).toEqual({ inputTokens: 150, outputTokens: 80 })

    unsubscribe()
  })

  it('tool_call / tool_result가 매칭된 도구 카드로 반영된다', async () => {
    const { api, emitEvents } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.agentRun.mockResolvedValue({ runId: FAKE_RUN_ID })
    api.conversationSave.mockResolvedValue({ id: 'conv-001' })
    api.conversationLoad.mockResolvedValue({ conversations: [] })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().sendMessage('도구 테스트')
    emitEvents(FAKE_RUN_ID, CORE_LOOP_EVENTS)

    const state = useAppStore.getState()
    const cards = allThreadToolCards(state)
    expect(cards).toHaveLength(1)

    const card = cards[0]
    expect(card.id).toBe('tc-bash-001')
    expect(card.name).toBe('bash')
    expect(card.status).toBe('done')
    expect(card.result).toBe('index.ts\nutils.ts')

    unsubscribe()
  })

  it('file_changed 이벤트가 changedFiles에 반영된다', async () => {
    const { api, emitEvents } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.agentRun.mockResolvedValue({ runId: FAKE_RUN_ID })
    api.conversationSave.mockResolvedValue({ id: 'conv-001' })
    api.conversationLoad.mockResolvedValue({ conversations: [] })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().sendMessage('파일변경 테스트')
    emitEvents(FAKE_RUN_ID, CORE_LOOP_EVENTS)

    const state = useAppStore.getState()
    expect(state.changedFiles.has('src/utils.ts')).toBe(true)
    expect(state.changedFiles.has('src/new-file.ts')).toBe(true)
    expect(state.changedFiles.size).toBe(2)

    unsubscribe()
  })

  it('done 이벤트 후 conversationSave가 호출된다', async () => {
    const { api, emitEvents } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.agentRun.mockResolvedValue({ runId: FAKE_RUN_ID })
    api.conversationSave.mockResolvedValue({ id: 'conv-save-001' })
    api.conversationLoad.mockResolvedValue({ conversations: [] })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().sendMessage('저장 테스트')
    emitEvents(FAKE_RUN_ID, CORE_LOOP_EVENTS)

    await Promise.resolve()
    await Promise.resolve()

    expect(api.conversationSave).toHaveBeenCalled()

    unsubscribe()
  })

  it('user 메시지가 thread의 msg 목록에 추가된다', async () => {
    const { api, emitEvents } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.agentRun.mockResolvedValue({ runId: FAKE_RUN_ID })
    api.conversationSave.mockResolvedValue({ id: 'conv-001' })
    api.conversationLoad.mockResolvedValue({ conversations: [] })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().sendMessage('안녕하세요')

    const state = useAppStore.getState()
    const userMessages = threadMsgs(state).filter((m) => m.role === 'user')
    expect(userMessages).toHaveLength(1)
    expect(userMessages[0].text).toBe('안녕하세요')

    emitEvents(FAKE_RUN_ID, [{ type: 'done' }])
    unsubscribe()
  })
})

describe('대화 복구 — conversationSave / conversationLoad', () => {
  beforeEach(async () => {
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    const { makeInitialState } = await import('../../../02_Project/00_Source/renderer/src/store/reducer')
    useAppStore.setState({
      ...makeInitialState(),
      workspaceRoot: null,
      fileTree: null,
      diffFilePath: null,
      conversationId: null,
      backendLabel: 'Claude Code',
    })
    vi.clearAllMocks()
  })

  it('loadConversation이 최근 대화를 store에 복원한다', async () => {
    const savedConversation = {
      id: 'conv-restore-001',
      title: '이전 대화',
      messages: [
        { role: 'user' as const, content: '이전 질문' },
        { role: 'assistant' as const, content: '이전 답변' },
      ],
      backendId: 'claude-code' as const,
      createdAt: '2026-06-22T00:00:00.000Z',
      updatedAt: '2026-06-22T00:00:01.000Z',
    }

    const { api } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.conversationLoad.mockResolvedValue({ conversations: [savedConversation] })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    await useAppStore.getState().loadConversation()

    const state = useAppStore.getState()
    expect(state.conversationId).toBe('conv-restore-001')
    const restored = threadMsgs(state)
    expect(restored).toHaveLength(2)
    expect(restored[0].role).toBe('user')
    expect(restored[0].text).toBe('이전 질문')
    expect(restored[1].role).toBe('assistant')
    expect(restored[1].text).toBe('이전 답변')
  })

  it('loadConversation에 대화가 없으면 store가 변경되지 않는다', async () => {
    const { api } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.conversationLoad.mockResolvedValue({ conversations: [] })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    await useAppStore.getState().loadConversation()

    const state = useAppStore.getState()
    expect(state.conversationId).toBeNull()
    expect(threadMsgs(state)).toHaveLength(0)
  })

  it('saveConversation이 올바른 페이로드로 conversationSave를 호출한다', async () => {
    const { api } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.conversationSave.mockResolvedValue({ id: 'conv-new-001' })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    useAppStore.setState({
      thread: [
        { kind: 'msg', id: 'msg-1', role: 'user', text: '안녕' },
        { kind: 'msg', id: 'msg-2', role: 'assistant', text: '반갑습니다' },
      ],
      conversationId: null,
    })

    await useAppStore.getState().saveConversation()

    expect(api.conversationSave).toHaveBeenCalledOnce()
    const callArg = api.conversationSave.mock.calls[0][0]
    expect(callArg.conversation.title).toBe('안녕')
    expect(callArg.conversation.messages).toHaveLength(2)
    expect(callArg.conversation.backendId).toBe('claude-code')

    expect(useAppStore.getState().conversationId).toBe('conv-new-001')
  })

  it('thread에 msg가 없으면 saveConversation이 호출되지 않는다', async () => {
    const { api } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    useAppStore.setState({ thread: [] })

    await useAppStore.getState().saveConversation()

    expect(api.conversationSave).not.toHaveBeenCalled()
  })

  it('save → load 전체 왕복: 저장한 대화가 로드 후 복원된다', async () => {
    let stored: Record<string, unknown> | null = null

    const { api } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.conversationSave.mockImplementation(async (req: { conversation: Record<string, unknown> }) => {
      stored = { ...req.conversation, id: 'conv-roundtrip-001',
        createdAt: '2026-06-22T00:00:00.000Z',
        updatedAt: '2026-06-22T00:00:01.000Z' }
      return { id: 'conv-roundtrip-001' }
    })

    api.conversationLoad.mockImplementation(async () => {
      if (!stored) return { conversations: [] }
      return { conversations: [stored] }
    })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')

    useAppStore.setState({
      thread: [
        { kind: 'msg', id: 'msg-1', role: 'user', text: '저장 테스트 메시지' },
        { kind: 'msg', id: 'msg-2', role: 'assistant', text: '저장 테스트 응답' },
      ],
      conversationId: null,
    })
    await useAppStore.getState().saveConversation()

    const { makeInitialState: makeInit } = await import('../../../02_Project/00_Source/renderer/src/store/reducer')
    useAppStore.setState({ ...makeInit(), conversationId: null })

    await useAppStore.getState().loadConversation()

    const state = useAppStore.getState()
    expect(state.conversationId).toBe('conv-roundtrip-001')
    const roundtripped = threadMsgs(state)
    expect(roundtripped).toHaveLength(2)
    expect(roundtripped[0].text).toBe('저장 테스트 메시지')
    expect(roundtripped[1].text).toBe('저장 테스트 응답')
  })
})

describe('abort 경로', () => {
  beforeEach(async () => {
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    const { makeInitialState } = await import('../../../02_Project/00_Source/renderer/src/store/reducer')
    useAppStore.setState({
      ...makeInitialState(),
      workspaceRoot: null,
      fileTree: null,
      diffFilePath: null,
      conversationId: null,
      backendLabel: 'Claude Code',
    })
    vi.clearAllMocks()
  })

  it('abortRun이 currentRunId로 agentAbort를 호출한다', async () => {
    const { api } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.agentAbort.mockResolvedValue({ accepted: true })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    useAppStore.setState({ currentRunId: 'run-to-abort', isRunning: true })

    await useAppStore.getState().abortRun()

    expect(api.agentAbort).toHaveBeenCalledOnce()
    expect(api.agentAbort).toHaveBeenCalledWith({ runId: 'run-to-abort' })
  })

  it('currentRunId가 null이면 abortRun이 agentAbort를 호출하지 않는다', async () => {
    const { api } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    useAppStore.setState({ currentRunId: null, isRunning: false })

    await useAppStore.getState().abortRun()

    expect(api.agentAbort).not.toHaveBeenCalled()
  })

  it('실행 중 error 이벤트 수신 → isRunning=false + errorMessage 설정', async () => {
    const { api, emitEvents } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.agentRun.mockResolvedValue({ runId: 'run-error-001' })
    api.conversationSave.mockResolvedValue({ id: 'conv-001' })
    api.conversationLoad.mockResolvedValue({ conversations: [] })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().sendMessage('에러 테스트')
    emitEvents('run-error-001', [
      { type: 'text', delta: '처리 중...' },
      { type: 'error', message: '백엔드 오류 발생' },
    ])

    const state = useAppStore.getState()
    expect(state.isRunning).toBe(false)
    expect(state.errorMessage).toBe('백엔드 오류 발생')

    unsubscribe()
  })

  it('isRunning=true 상태에서 sendMessage를 재호출하면 무시된다', async () => {
    const { api } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.agentRun.mockResolvedValue({ runId: FAKE_RUN_ID })
    api.conversationSave.mockResolvedValue({ id: 'conv-001' })
    api.conversationLoad.mockResolvedValue({ conversations: [] })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().sendMessage('첫 번째')
    await useAppStore.getState().sendMessage('두 번째 — 무시되어야 함')

    expect(api.agentRun).toHaveBeenCalledOnce()

    emitEventsHelper(api, FAKE_RUN_ID, [{ type: 'done' }])
    unsubscribe()

  })
})

function emitEventsHelper(_api: unknown, _runId: string, _events: AgentEvent[]) {
}

describe('selectDiffFile — diff 뷰어 경로 관리', () => {
  beforeEach(async () => {
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    useAppStore.setState({ diffFilePath: null })
    vi.clearAllMocks()
  })

  it('selectDiffFile(path) → diffFilePath가 설정된다', async () => {
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    useAppStore.getState().selectDiffFile('src/utils.ts')
    expect(useAppStore.getState().diffFilePath).toBe('src/utils.ts')
  })

  it('selectDiffFile(null) → diffFilePath가 null로 초기화된다', async () => {
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    useAppStore.setState({ diffFilePath: 'src/utils.ts' })
    useAppStore.getState().selectDiffFile(null)
    expect(useAppStore.getState().diffFilePath).toBeNull()
  })
})

describe('subscribeAgentEvents — unsubscribe', () => {
  beforeEach(async () => {
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    const { makeInitialState } = await import('../../../02_Project/00_Source/renderer/src/store/reducer')
    useAppStore.setState({ ...makeInitialState(), conversationId: null })
    vi.clearAllMocks()
  })

  it('subscribeAgentEvents가 반환하는 unsubscribe 함수가 호출된다', async () => {
    const { api, mockUnsubscribe } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    expect(api.onAgentEvent).toHaveBeenCalledOnce()
    unsubscribe()
    expect(mockUnsubscribe).toHaveBeenCalledOnce()
  })
})

describe('reducer 엣지케이스 (이월 개선)', () => {
  function payload(event: AgentEvent): AgentEventPayload {
    return { runId: 'run-edge', event }
  }

  it('빈 delta text 이벤트도 thread에 assistant msg를 생성한다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: 'already' }))
    const s2 = applyAgentEvent(s1, payload({ type: 'text', delta: '' }))
    expect(lastAssistantText(s2)).toBe('already')
  })

  it('알 수 없는 이벤트 타입이 오면 state를 그대로 반환한다 (exhaustive default)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'unknown_future' } as unknown as AgentEvent))
    expect(s1).toStrictEqual(s0)
  })

  it('tool_result가 매칭되는 tool_call 없이 오면 thread toolgroup이 변경되지 않는다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({
      type: 'tool_result',
      id: 'nonexistent-tc',
      ok: true,
      output: '결과',
    }))
    expect(allThreadToolCards(s1)).toHaveLength(0)
  })

  it('tool_result ok=false → 해당 카드 status=error, 나머지 카드 보존', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'tool_call', id: 'tc-a', name: 'bash', input: {} }))
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_call', id: 'tc-b', name: 'read_file', input: {} }))
    const s3 = applyAgentEvent(s2, payload({ type: 'tool_result', id: 'tc-a', ok: false, output: 'err' }))

    const cards = allThreadToolCards(s3)
    const cardA = cards.find((c) => c.id === 'tc-a')
    const cardB = cards.find((c) => c.id === 'tc-b')
    expect(cardA?.status).toBe('error')
    expect(cardB?.status).toBe('running')
    expect(cards).toHaveLength(2)
  })

  it('여러 tool_call이 독립적으로 running 상태를 유지한다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'tool_call', id: 'tc-1', name: 'bash', input: {} }))
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_call', id: 'tc-2', name: 'read_file', input: {} }))
    const s3 = applyAgentEvent(s2, payload({ type: 'tool_call', id: 'tc-3', name: 'write_file', input: {} }))

    const cards = allThreadToolCards(s3)
    expect(cards).toHaveLength(3)
    expect(cards.every((c) => c.status === 'running')).toBe(true)
  })

  it('done 이벤트 후 다시 text 이벤트가 오면 isRunning=true로 전환된다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: '1' }))
    const s2 = applyAgentEvent(s1, payload({ type: 'done' }))
    expect(s2.isRunning).toBe(false)
    const s3 = applyAgentEvent(s2, payload({ type: 'text', delta: '2' }))
    expect(s3.isRunning).toBe(true)
  })

  it('error 이벤트가 thread의 기존 assistant msg를 보존한다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, { runId: 'run-edge', event: { type: 'text', delta: '부분 스트림' } })
    const s2 = applyAgentEvent(s1, payload({ type: 'error', message: '연결 끊김' }))
    expect(s2.isRunning).toBe(false)
    expect(s2.errorMessage).toBe('연결 끊김')
    expect(lastAssistantText(s2)).toBe('부분 스트림')
  })

  it('file_changed delete 이벤트도 changedFiles에 추가된다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'file_changed', path: 'old.ts', change: 'delete' }))
    expect(s1.changedFiles.has('old.ts')).toBe(true)
  })

  it('done 이벤트에 usage.cacheCreationTokens/cacheReadTokens 포함 시 lastUsage에 저장된다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({
      type: 'done',
      usage: {
        inputTokens: 500,
        outputTokens: 200,
        cacheCreationTokens: 50,
        cacheReadTokens: 30,
      },
    }))
    expect(s1.lastUsage?.cacheCreationTokens).toBe(50)
    expect(s1.lastUsage?.cacheReadTokens).toBe(30)
  })

  it('리듀서는 Set 변경 시 새 인스턴스를 반환한다 (불변성)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'file_changed', path: 'a.ts', change: 'add' }))
    expect(s1.changedFiles).not.toBe(s0.changedFiles)
  })

  it('리듀서는 thread 변경 시 새 배열을 반환한다 (불변성)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'tool_call', id: 'tc-1', name: 'bash', input: {} }))
    expect(s1.thread).not.toBe(s0.thread)
  })
})

describe('신뢰 경계 — 리듀서 입력 방어', () => {
  function payload(event: AgentEvent): AgentEventPayload {
    return { runId: 'run-boundary', event }
  }

  it('tool_call input이 null이어도 thread toolgroup에 카드가 생성된다 (unknown 타입)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'tool_call', id: 'tc-null', name: 'bash', input: null }))
    const cards = allThreadToolCards(s1)
    expect(cards).toHaveLength(1)
    expect(cards[0].input).toBeNull()
  })

  it('tool_result output이 복잡한 객체여도 thread toolgroup 카드에 저장된다', () => {
    const complexOutput = { nested: { data: [1, 2, 3], flag: true }, msg: '복잡한 결과' }
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'tool_call', id: 'tc-x', name: 'tool', input: {} }))
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_result', id: 'tc-x', ok: true, output: complexOutput }))
    const card = allThreadToolCards(s2).find((c) => c.id === 'tc-x')
    expect(card?.result).toEqual(complexOutput)
  })

  it('매우 긴 text delta도 thread의 assistant msg에 올바르게 누적된다', () => {
    const longText = 'A'.repeat(10_000)
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: longText }))
    const s2 = applyAgentEvent(s1, payload({ type: 'text', delta: longText }))
    expect(lastAssistantText(s2)).toHaveLength(20_000)
  })

  it('특수문자·유니코드 포함 파일 경로가 changedFiles에 안전하게 추가된다', () => {
    const s0 = makeInitialState()
    const paths = [
      'src/한글파일.ts',
      'src/file with spaces.ts',
      'src/../../etc/passwd',
      'src/file\u0000null.ts',
    ]
    let state = s0
    for (const p of paths) {
      state = applyAgentEvent(state, payload({ type: 'file_changed', path: p, change: 'modify' }))
    }
    expect(state.changedFiles.size).toBe(paths.length)
  })

  it('error message가 빈 문자열이어도 errorMessage가 설정된다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'error', message: '' }))
    expect(s1.errorMessage).toBe('')
    expect(s1.isRunning).toBe(false)
  })
})
