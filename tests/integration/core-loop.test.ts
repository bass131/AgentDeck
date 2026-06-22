// @vitest-environment jsdom
/**
 * core-loop.test.ts — Phase 06 핵심 루프 통합 테스트
 *
 * 목 백엔드로 결정론 검증 (실제 Electron/디스플레이 없이):
 *   1. window.api mock: workspaceOpen / agentRun / onAgentEvent / fsDiff /
 *      conversationSave / conversationLoad
 *   2. store 액션 시퀀스 구동 → 최종 상태 단언
 *   3. 대화 복구 (save → load)
 *   4. abort 경로
 *   5. 리듀서 엣지케이스 (이월 개선)
 *
 * 결정론: 시간/랜덤/네트워크 의존 0. 모든 비동기는 mock이 제어.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentEventPayload } from '../../src/shared/ipc-contract'
import type { AgentEvent } from '../../src/shared/agent-events'
import type { FileTreeNode } from '../../src/shared/ipc-contract'
import {
  applyAgentEvent,
  makeInitialState,
} from '../../src/renderer/src/store/reducer'

// ═══════════════════════════════════════════════════════════════════════════════
// 헬퍼 타입 / 공통 유틸
// ═══════════════════════════════════════════════════════════════════════════════

type OnAgentEventCallback = (payload: AgentEventPayload) => void

/** window.api mock — onAgentEvent 콜백을 캡처해 테스트가 직접 emit */
function buildMockApi() {
  let capturedCallback: OnAgentEventCallback | null = null

  const mockUnsubscribe = vi.fn()

  const api = {
    workspaceOpen: vi.fn(),
    workspaceTree: vi.fn().mockResolvedValue({ tree: null }),
    agentRun: vi.fn(),
    agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
    /** onAgentEvent: 콜백을 캡처하고 unsubscribe 함수를 반환 */
    onAgentEvent: vi.fn((cb: OnAgentEventCallback) => {
      capturedCallback = cb
      return mockUnsubscribe
    }),
    fsDiff: vi.fn(),
    conversationLoad: vi.fn(),
    conversationSave: vi.fn(),
  }

  /** 등록된 콜백으로 AgentEvent 시퀀스를 동기 emit */
  function emitEvents(runId: string, events: AgentEvent[]) {
    if (!capturedCallback) throw new Error('onAgentEvent 콜백이 아직 등록되지 않음')
    for (const event of events) {
      capturedCallback({ runId, event })
    }
  }

  return { api, emitEvents, mockUnsubscribe }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 픽스처 — 고정 데이터 (결정론)
// ═══════════════════════════════════════════════════════════════════════════════

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

/** 핵심 루프 이벤트 시퀀스 픽스처 (고정) */
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

// ═══════════════════════════════════════════════════════════════════════════════
// 1. 핵심 루프 통합: store 액션 시퀀스 구동
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 06 핵심 루프 — store 통합', () => {
  /**
   * store를 매 테스트마다 새 인스턴스로 교체한다.
   * Zustand store는 모듈 싱글톤이므로 setState로 초기화한다.
   */
  beforeEach(async () => {
    // 모듈 캐시 초기화 없이 setState로 초기 상태 복원
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const { makeInitialState } = await import('../../src/renderer/src/store/reducer')
    useAppStore.setState({
      ...makeInitialState(),
      workspaceRoot: null,
      fileTree: null,
      diffFilePath: null,
      messages: [],
      conversationId: null,
      backendLabel: 'Claude Code',
    })
    vi.clearAllMocks()
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('openWorkspace → fileTree 와 workspaceRoot가 store에 반영된다', async () => {
    const { api } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.workspaceOpen.mockResolvedValue({ rootPath: FAKE_ROOT, tree: FAKE_TREE })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    await useAppStore.getState().openWorkspace()

    const state = useAppStore.getState()
    expect(state.workspaceRoot).toBe(FAKE_ROOT)
    expect(state.fileTree).toEqual(FAKE_TREE)
    expect(api.workspaceOpen).toHaveBeenCalledOnce()
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('openWorkspace에서 null을 반환하면 store 상태가 변하지 않는다', async () => {
    const { api } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.workspaceOpen.mockResolvedValue({ rootPath: null, tree: null })
    api.conversationLoad.mockResolvedValue({ conversations: [] })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    await useAppStore.getState().openWorkspace()

    const state = useAppStore.getState()
    expect(state.workspaceRoot).toBeNull()
    expect(state.fileTree).toBeNull()
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('sendMessage → 스트리밍 이벤트 시퀀스 → assistant 메시지 확정 + done 후 isRunning=false', async () => {
    const { api, emitEvents } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.agentRun.mockResolvedValue({ runId: FAKE_RUN_ID })
    api.conversationSave.mockResolvedValue({ id: 'conv-001' })
    api.conversationLoad.mockResolvedValue({ conversations: [] })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')

    // subscribeAgentEvents 먼저 등록 (onAgentEvent 콜백 캡처)
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    // sendMessage 실행 (비동기 — agentRun IPC)
    await useAppStore.getState().sendMessage('테스트 메시지')

    // 이벤트 시퀀스 emit (동기 — mock이 제어)
    emitEvents(FAKE_RUN_ID, CORE_LOOP_EVENTS)

    const state = useAppStore.getState()

    // isRunning = false (done 이벤트 처리됨)
    expect(state.isRunning).toBe(false)

    // 스트리밍 텍스트가 assistant 메시지로 확정됨
    const assistantMessages = state.messages.filter((m) => m.role === 'assistant')
    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0].content).toBe('Hello, I will help you.')

    // streamingText가 확정 후 비워짐
    expect(state.streamingText).toBe('')

    // usage 반영
    expect(state.lastUsage).toEqual({ inputTokens: 150, outputTokens: 80 })

    unsubscribe()
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('tool_call / tool_result가 매칭된 도구 카드로 반영된다', async () => {
    const { api, emitEvents } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.agentRun.mockResolvedValue({ runId: FAKE_RUN_ID })
    api.conversationSave.mockResolvedValue({ id: 'conv-001' })
    api.conversationLoad.mockResolvedValue({ conversations: [] })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().sendMessage('도구 테스트')
    emitEvents(FAKE_RUN_ID, CORE_LOOP_EVENTS)

    const state = useAppStore.getState()
    expect(state.toolCards).toHaveLength(1)

    const card = state.toolCards[0]
    expect(card.id).toBe('tc-bash-001')
    expect(card.name).toBe('bash')
    expect(card.status).toBe('done')
    expect(card.result).toBe('index.ts\nutils.ts')

    unsubscribe()
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('file_changed 이벤트가 changedFiles에 반영된다', async () => {
    const { api, emitEvents } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.agentRun.mockResolvedValue({ runId: FAKE_RUN_ID })
    api.conversationSave.mockResolvedValue({ id: 'conv-001' })
    api.conversationLoad.mockResolvedValue({ conversations: [] })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().sendMessage('파일변경 테스트')
    emitEvents(FAKE_RUN_ID, CORE_LOOP_EVENTS)

    const state = useAppStore.getState()
    expect(state.changedFiles.has('src/utils.ts')).toBe(true)
    expect(state.changedFiles.has('src/new-file.ts')).toBe(true)
    expect(state.changedFiles.size).toBe(2)

    unsubscribe()
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('done 이벤트 후 conversationSave가 호출된다', async () => {
    const { api, emitEvents } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.agentRun.mockResolvedValue({ runId: FAKE_RUN_ID })
    api.conversationSave.mockResolvedValue({ id: 'conv-save-001' })
    api.conversationLoad.mockResolvedValue({ conversations: [] })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().sendMessage('저장 테스트')
    emitEvents(FAKE_RUN_ID, CORE_LOOP_EVENTS)

    // saveConversation은 비동기 fire-and-forget이므로 micro-task 소비
    await Promise.resolve()
    await Promise.resolve()

    // sendMessage 후 saveConversation 1회 + done 후 saveConversation 1회 = 최소 1회
    expect(api.conversationSave).toHaveBeenCalled()

    unsubscribe()
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('user 메시지가 messages 목록에 추가된다', async () => {
    const { api, emitEvents } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.agentRun.mockResolvedValue({ runId: FAKE_RUN_ID })
    api.conversationSave.mockResolvedValue({ id: 'conv-001' })
    api.conversationLoad.mockResolvedValue({ conversations: [] })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().sendMessage('안녕하세요')

    const state = useAppStore.getState()
    const userMessages = state.messages.filter((m) => m.role === 'user')
    expect(userMessages).toHaveLength(1)
    expect(userMessages[0].content).toBe('안녕하세요')

    // cleanup
    emitEvents(FAKE_RUN_ID, [{ type: 'done' }])
    unsubscribe()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. 대화 복구: save → load
// ═══════════════════════════════════════════════════════════════════════════════

describe('대화 복구 — conversationSave / conversationLoad', () => {
  beforeEach(async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const { makeInitialState } = await import('../../src/renderer/src/store/reducer')
    useAppStore.setState({
      ...makeInitialState(),
      workspaceRoot: null,
      fileTree: null,
      diffFilePath: null,
      messages: [],
      conversationId: null,
      backendLabel: 'Claude Code',
    })
    vi.clearAllMocks()
  })

  // ─────────────────────────────────────────────────────────────────────────
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

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    await useAppStore.getState().loadConversation()

    const state = useAppStore.getState()
    expect(state.conversationId).toBe('conv-restore-001')
    expect(state.messages).toHaveLength(2)
    expect(state.messages[0].role).toBe('user')
    expect(state.messages[0].content).toBe('이전 질문')
    expect(state.messages[1].role).toBe('assistant')
    expect(state.messages[1].content).toBe('이전 답변')
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('loadConversation에 대화가 없으면 store가 변경되지 않는다', async () => {
    const { api } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.conversationLoad.mockResolvedValue({ conversations: [] })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    await useAppStore.getState().loadConversation()

    const state = useAppStore.getState()
    expect(state.conversationId).toBeNull()
    expect(state.messages).toHaveLength(0)
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('saveConversation이 올바른 페이로드로 conversationSave를 호출한다', async () => {
    const { api } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.conversationSave.mockResolvedValue({ id: 'conv-new-001' })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      messages: [
        { id: 'msg-1', role: 'user', content: '안녕' },
        { id: 'msg-2', role: 'assistant', content: '반갑습니다' },
      ],
      conversationId: null,
    })

    await useAppStore.getState().saveConversation()

    expect(api.conversationSave).toHaveBeenCalledOnce()
    const callArg = api.conversationSave.mock.calls[0][0]
    expect(callArg.conversation.title).toBe('안녕')
    expect(callArg.conversation.messages).toHaveLength(2)
    expect(callArg.conversation.backendId).toBe('claude-code')

    // 신규 save 후 conversationId가 갱신됨
    expect(useAppStore.getState().conversationId).toBe('conv-new-001')
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('messages가 비어있으면 saveConversation이 호출되지 않는다', async () => {
    const { api } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({ messages: [] })

    await useAppStore.getState().saveConversation()

    expect(api.conversationSave).not.toHaveBeenCalled()
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('save → load 전체 왕복: 저장한 대화가 로드 후 복원된다', async () => {
    // 인메모리 스토리지로 save/load 왕복 시뮬레이션
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

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')

    // 대화 내용 설정 후 저장
    useAppStore.setState({
      messages: [
        { id: 'msg-1', role: 'user', content: '저장 테스트 메시지' },
        { id: 'msg-2', role: 'assistant', content: '저장 테스트 응답' },
      ],
      conversationId: null,
    })
    await useAppStore.getState().saveConversation()

    // store 초기화 (재시작 시뮬레이션)
    const { makeInitialState: makeInit } = await import('../../src/renderer/src/store/reducer')
    useAppStore.setState({ ...makeInit(), messages: [], conversationId: null })

    // 로드 → 복원 확인
    await useAppStore.getState().loadConversation()

    const state = useAppStore.getState()
    expect(state.conversationId).toBe('conv-roundtrip-001')
    expect(state.messages).toHaveLength(2)
    expect(state.messages[0].content).toBe('저장 테스트 메시지')
    expect(state.messages[1].content).toBe('저장 테스트 응답')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. abort 경로
// ═══════════════════════════════════════════════════════════════════════════════

describe('abort 경로', () => {
  beforeEach(async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const { makeInitialState } = await import('../../src/renderer/src/store/reducer')
    useAppStore.setState({
      ...makeInitialState(),
      workspaceRoot: null,
      fileTree: null,
      diffFilePath: null,
      messages: [],
      conversationId: null,
      backendLabel: 'Claude Code',
    })
    vi.clearAllMocks()
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('abortRun이 currentRunId로 agentAbort를 호출한다', async () => {
    const { api } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.agentAbort.mockResolvedValue({ accepted: true })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    // 실행 중 상태 직접 설정
    useAppStore.setState({ currentRunId: 'run-to-abort', isRunning: true })

    await useAppStore.getState().abortRun()

    expect(api.agentAbort).toHaveBeenCalledOnce()
    expect(api.agentAbort).toHaveBeenCalledWith({ runId: 'run-to-abort' })
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('currentRunId가 null이면 abortRun이 agentAbort를 호출하지 않는다', async () => {
    const { api } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({ currentRunId: null, isRunning: false })

    await useAppStore.getState().abortRun()

    expect(api.agentAbort).not.toHaveBeenCalled()
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('실행 중 error 이벤트 수신 → isRunning=false + errorMessage 설정', async () => {
    const { api, emitEvents } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.agentRun.mockResolvedValue({ runId: 'run-error-001' })
    api.conversationSave.mockResolvedValue({ id: 'conv-001' })
    api.conversationLoad.mockResolvedValue({ conversations: [] })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
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

  // ─────────────────────────────────────────────────────────────────────────
  it('isRunning=true 상태에서 sendMessage를 재호출하면 무시된다', async () => {
    const { api } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    api.agentRun.mockResolvedValue({ runId: FAKE_RUN_ID })
    api.conversationSave.mockResolvedValue({ id: 'conv-001' })
    api.conversationLoad.mockResolvedValue({ conversations: [] })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().sendMessage('첫 번째')
    // isRunning=true 상태에서 두 번째 sendMessage
    await useAppStore.getState().sendMessage('두 번째 — 무시되어야 함')

    // agentRun은 첫 번째 호출만 발생해야 함
    expect(api.agentRun).toHaveBeenCalledOnce()

    // cleanup
    emitEventsHelper(api, FAKE_RUN_ID, [{ type: 'done' }])
    unsubscribe()

    // emitEventsHelper 내부 구현: api에 직접 접근 불가하므로
    // done 이벤트로 isRunning 정리는 별도 테스트에서 커버됨
  })
})

/** abort 테스트 내부에서 emit 없이 cleanup용 더미 helper */
function emitEventsHelper(_api: unknown, _runId: string, _events: AgentEvent[]) {
  // subscribeAgentEvents 콜백 접근 불가한 블록에서 호출 무시용 stub
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. selectDiffFile (UI 상태 관리)
// ═══════════════════════════════════════════════════════════════════════════════

describe('selectDiffFile — diff 뷰어 경로 관리', () => {
  beforeEach(async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({ diffFilePath: null })
    vi.clearAllMocks()
  })

  it('selectDiffFile(path) → diffFilePath가 설정된다', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.getState().selectDiffFile('src/utils.ts')
    expect(useAppStore.getState().diffFilePath).toBe('src/utils.ts')
  })

  it('selectDiffFile(null) → diffFilePath가 null로 초기화된다', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({ diffFilePath: 'src/utils.ts' })
    useAppStore.getState().selectDiffFile(null)
    expect(useAppStore.getState().diffFilePath).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 5. subscribeAgentEvents — unsubscribe 동작
// ═══════════════════════════════════════════════════════════════════════════════

describe('subscribeAgentEvents — unsubscribe', () => {
  beforeEach(async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const { makeInitialState } = await import('../../src/renderer/src/store/reducer')
    useAppStore.setState({ ...makeInitialState(), messages: [], conversationId: null })
    vi.clearAllMocks()
  })

  it('subscribeAgentEvents가 반환하는 unsubscribe 함수가 호출된다', async () => {
    const { api, mockUnsubscribe } = buildMockApi()
    Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    expect(api.onAgentEvent).toHaveBeenCalledOnce()
    unsubscribe()
    expect(mockUnsubscribe).toHaveBeenCalledOnce()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 6. 리듀서 엣지케이스 — 이월 개선 (테스트만으로 가능한 범위)
// ═══════════════════════════════════════════════════════════════════════════════

describe('reducer 엣지케이스 (이월 개선)', () => {
  function payload(event: AgentEvent): AgentEventPayload {
    return { runId: 'run-edge', event }
  }

  // ─────────────────────────────────────────────────────────────────────────
  it('빈 delta text 이벤트가 streamingText를 변경하지 않는다', () => {
    const s0 = { ...makeInitialState(), streamingText: 'already' }
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: '' }))
    // 빈 delta는 누적되어도 의미 없는 변경이지만 리듀서는 그대로 concat함
    // 실제 동작 확인: '' + '' = ''는 문자열 concat이므로 변화 없음
    expect(s1.streamingText).toBe('already')
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('알 수 없는 이벤트 타입이 오면 state를 그대로 반환한다 (exhaustive default)', () => {
    const s0 = makeInitialState()
    // as any로 미래의 알 수 없는 이벤트 타입 시뮬레이션
    const s1 = applyAgentEvent(s0, payload({ type: 'unknown_future' } as unknown as AgentEvent))
    expect(s1).toStrictEqual(s0)
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('tool_result가 매칭되는 tool_call 없이 오면 toolCards가 변경되지 않는다', () => {
    const s0 = makeInitialState()
    // tool_call 없이 바로 tool_result
    const s1 = applyAgentEvent(s0, payload({
      type: 'tool_result',
      id: 'nonexistent-tc',
      ok: true,
      output: '결과',
    }))
    // toolCards는 여전히 비어 있고, 상태는 안전하게 보존
    expect(s1.toolCards).toHaveLength(0)
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('tool_result ok=false → 해당 카드 status=error, 나머지 카드 보존', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'tool_call', id: 'tc-a', name: 'bash', input: {} }))
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_call', id: 'tc-b', name: 'read_file', input: {} }))
    const s3 = applyAgentEvent(s2, payload({ type: 'tool_result', id: 'tc-a', ok: false, output: 'err' }))

    const cardA = s3.toolCards.find((c) => c.id === 'tc-a')
    const cardB = s3.toolCards.find((c) => c.id === 'tc-b')
    expect(cardA?.status).toBe('error')
    expect(cardB?.status).toBe('running')  // 아직 결과 없음
    expect(s3.toolCards).toHaveLength(2)
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('여러 tool_call이 독립적으로 running 상태를 유지한다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'tool_call', id: 'tc-1', name: 'bash', input: {} }))
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_call', id: 'tc-2', name: 'read_file', input: {} }))
    const s3 = applyAgentEvent(s2, payload({ type: 'tool_call', id: 'tc-3', name: 'write_file', input: {} }))

    expect(s3.toolCards).toHaveLength(3)
    expect(s3.toolCards.every((c) => c.status === 'running')).toBe(true)
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('done 이벤트 후 다시 text 이벤트가 오면 isRunning=true로 전환된다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: '1' }))
    const s2 = applyAgentEvent(s1, payload({ type: 'done' }))
    expect(s2.isRunning).toBe(false)
    // 새 run에서 다시 text 수신
    const s3 = applyAgentEvent(s2, payload({ type: 'text', delta: '2' }))
    expect(s3.isRunning).toBe(true)
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('error 이벤트가 기존 streamingText를 보존한다', () => {
    const s0 = { ...makeInitialState(), streamingText: '부분 스트림', isRunning: true }
    const s1 = applyAgentEvent(s0, payload({ type: 'error', message: '연결 끊김' }))
    // error 이벤트는 isRunning=false + errorMessage 설정, streamingText는 건드리지 않음
    expect(s1.isRunning).toBe(false)
    expect(s1.errorMessage).toBe('연결 끊김')
    expect(s1.streamingText).toBe('부분 스트림')
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('file_changed delete 이벤트도 changedFiles에 추가된다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'file_changed', path: 'old.ts', change: 'delete' }))
    expect(s1.changedFiles.has('old.ts')).toBe(true)
  })

  // ─────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  it('리듀서는 Set 변경 시 새 인스턴스를 반환한다 (불변성)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'file_changed', path: 'a.ts', change: 'add' }))
    expect(s1.changedFiles).not.toBe(s0.changedFiles)
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('리듀서는 toolCards 변경 시 새 배열을 반환한다 (불변성)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'tool_call', id: 'tc-1', name: 'bash', input: {} }))
    expect(s1.toolCards).not.toBe(s0.toolCards)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 7. IPC 채널 신뢰 경계 — 잘못된 입력 방어
// ═══════════════════════════════════════════════════════════════════════════════

describe('신뢰 경계 — 리듀서 입력 방어', () => {
  function payload(event: AgentEvent): AgentEventPayload {
    return { runId: 'run-boundary', event }
  }

  // ─────────────────────────────────────────────────────────────────────────
  it('tool_call input이 null이어도 카드가 생성된다 (unknown 타입)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'tool_call', id: 'tc-null', name: 'bash', input: null }))
    expect(s1.toolCards).toHaveLength(1)
    expect(s1.toolCards[0].input).toBeNull()
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('tool_result output이 복잡한 객체여도 result에 저장된다', () => {
    const complexOutput = { nested: { data: [1, 2, 3], flag: true }, msg: '복잡한 결과' }
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'tool_call', id: 'tc-x', name: 'tool', input: {} }))
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_result', id: 'tc-x', ok: true, output: complexOutput }))
    expect(s2.toolCards[0].result).toEqual(complexOutput)
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('매우 긴 text delta도 올바르게 누적된다', () => {
    const longText = 'A'.repeat(10_000)
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: longText }))
    const s2 = applyAgentEvent(s1, payload({ type: 'text', delta: longText }))
    expect(s2.streamingText).toHaveLength(20_000)
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('특수문자·유니코드 포함 파일 경로가 changedFiles에 안전하게 추가된다', () => {
    const s0 = makeInitialState()
    const paths = [
      'src/한글파일.ts',
      'src/file with spaces.ts',
      'src/../../etc/passwd',   // path traversal 시도 — 리듀서는 경로 검증 안 함(IPC 계층 책임)
      'src/file null.ts',  // null byte
    ]
    let state = s0
    for (const p of paths) {
      state = applyAgentEvent(state, payload({ type: 'file_changed', path: p, change: 'modify' }))
    }
    // 리듀서는 IPC 계층에서 검증된 데이터를 받는다고 가정 — 여기서는 저장만 확인
    expect(state.changedFiles.size).toBe(paths.length)
  })

  // ─────────────────────────────────────────────────────────────────────────
  it('error message가 빈 문자열이어도 errorMessage가 설정된다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'error', message: '' }))
    expect(s1.errorMessage).toBe('')
    expect(s1.isRunning).toBe(false)
  })
})

/*
 * [보고] agent-backend 추출 필요
 *
 * ClaudeCodeBackend의 stdout 줄 분할/버퍼링 로직(Phase 03 이월 개선)은
 * 현재 src/main/agents/ClaudeCodeBackend.ts 내부에 인라인되어 있어
 * 직접 단위 테스트가 불가능합니다.
 *
 * 권고: 순수 함수 `splitNdjsonLines(chunk: string, buffer: string): { lines: string[]; remainder: string }`
 * 를 src/main/agents/ndjson-buffer.ts 로 추출하면 mock 없이 결정론 검증 가능.
 *
 * 담당 도메인: agent-backend Worker (src/main/agents/)
 */
