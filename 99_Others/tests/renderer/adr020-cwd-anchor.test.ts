/**
 * adr020-cwd-anchor.test.ts — ADR-020 대화별 cwd 앵커링 TDD 테스트 (실패 먼저)
 *
 * 검증 범위:
 *   - saveConversation: workspaceRoot 있을 때 conversation.cwd 포함하여 IPC 호출
 *   - saveConversation: workspaceRoot null 이면 cwd 미포함(undefined)
 *   - selectConversation: conv.cwd 있고 현재와 다르면 workspaceOpen({folderPath}) 호출
 *   - selectConversation: workspaceOpen rootPath 성공 시 workspaceRoot/fileTree 갱신 + loadProjectFiles 호출
 *   - selectConversation: workspaceOpen rootPath null(검증 실패) → workspaceRoot 미변경(graceful)
 *   - selectConversation: conv.cwd 없으면 workspaceOpen 미호출
 *   - selectConversation: conv.cwd === 현재 workspaceRoot → 불필요 재오픈 안 함
 *
 * 아키텍처 준수:
 *   - window.api mock → store 액션 → 상태 갱신 (단방향)
 *   - 신뢰경계: workspaceOpen({folderPath}) 경유(main 재검증), 임의 set 금지
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import type { ConversationRecord, FileTreeNode } from '../../../02.Source/shared/ipc-contract'

// ── 샘플 레코드 ────────────────────────────────────────────────────────────────
const MOCK_TREE: FileTreeNode = {
  name: 'project',
  path: '/y',
  kind: 'directory',
  children: [],
}

const RECORD_WITH_CWD: ConversationRecord = {
  id: 'cwd-conv-1',
  title: 'cwd 있는 대화',
  messages: [{ role: 'user', content: '안녕' }],
  backendId: 'claude-code',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:01:00Z',
  cwd: '/y',
}

const RECORD_NO_CWD: ConversationRecord = {
  id: 'cwd-conv-2',
  title: 'cwd 없는 대화',
  messages: [{ role: 'user', content: '코드' }],
  backendId: 'claude-code',
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-01-02T00:01:00Z',
}

const RECORD_SAME_CWD: ConversationRecord = {
  id: 'cwd-conv-3',
  title: '동일 cwd 대화',
  messages: [{ role: 'user', content: '동일 폴더' }],
  backendId: 'claude-code',
  createdAt: '2026-01-03T00:00:00Z',
  updatedAt: '2026-01-03T00:01:00Z',
  cwd: '/x',  // 현재 workspaceRoot와 동일
}

// ── window.api mock ────────────────────────────────────────────────────────────
const workspaceOpenMock = vi.fn()
const conversationSaveMock = vi.fn()

const mockApi = {
  conversationLoad: async (req: { id?: string; limit?: number }) => {
    if (req.id === 'cwd-conv-1') return { conversations: [RECORD_WITH_CWD] }
    if (req.id === 'cwd-conv-2') return { conversations: [RECORD_NO_CWD] }
    if (req.id === 'cwd-conv-3') return { conversations: [RECORD_SAME_CWD] }
    return { conversations: [] }
  },
  conversationSave: conversationSaveMock,
  conversationDelete: async () => ({ ok: true }),
  conversationRename: async () => ({ ok: true }),
  agentRun: async () => ({ runId: 'r1' }),
  agentAbort: async () => ({ accepted: true }),
  onAgentEvent: () => () => {},
  listFiles: async () => ({ files: [] }),
  pathForFile: () => '',
  saveImageData: async () => ({ path: '' }),
  workspaceOpen: workspaceOpenMock,
  referenceList: async () => ({ references: [] }),
  referenceTree: async () => ({ tree: null }),
  referenceAdd: async () => ({ reference: null }),
  fsRead: async () => ({ kind: 'not-found' }),
  // prefs IPC — setPref 가 호출할 수 있으므로 stub 필요 (실패 무시, 검증 불필요)
  setUiPref: async (_req: { key: string; value: unknown }) => ({ ok: true }),
}

Object.defineProperty(globalThis, 'window', {
  value: { api: mockApi },
  writable: true,
  configurable: true,
})

// ── 상태 리셋 헬퍼 ─────────────────────────────────────────────────────────────
function resetStore(overrides: Record<string, unknown> = {}) {
  useAppStore.setState({
    conversations: [],
    messages: [],
    // Phase A-2: thread 리셋
    thread: [],
    openGroupId: null,
    openMsgId: null,
    seq: 0,
    conversationId: null,
    streamingText: '',
    toolCards: [],
    isRunning: false,
    errorMessage: undefined,
    attachedImages: [],
    queue: [],
    workspaceRoot: null,
    fileTree: null,
    projectFiles: [],
    ...overrides,
  } as Parameters<typeof useAppStore.setState>[0])
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('ADR-020 saveConversation — cwd 기록', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    conversationSaveMock.mockResolvedValue({ id: 'cv-new' })
    workspaceOpenMock.mockResolvedValue({ rootPath: null, tree: null })
    resetStore()
  })

  it('workspaceRoot="/x" 상태에서 saveConversation 시 IPC 인자에 cwd:"/x" 포함', async () => {
    resetStore({ workspaceRoot: '/x' })
    // Phase A-2: thread에 msg 세팅 (saveConversation은 thread 기반)
    useAppStore.setState({
      thread: [{ kind: 'msg', id: 'm-1', role: 'user', text: '테스트 메시지' }],
      messages: [{ id: 'm-1', role: 'user', content: '테스트 메시지' }],
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().saveConversation()

    expect(conversationSaveMock).toHaveBeenCalledTimes(1)
    const callArg = conversationSaveMock.mock.calls[0][0]
    expect(callArg.conversation.cwd).toBe('/x')
  })

  it('workspaceRoot=null 상태에서 saveConversation 시 IPC 인자에 cwd 미포함(undefined)', async () => {
    resetStore({ workspaceRoot: null })
    // Phase A-2: thread에 msg 세팅
    useAppStore.setState({
      thread: [{ kind: 'msg', id: 'm-1', role: 'user', text: '테스트 메시지' }],
      messages: [{ id: 'm-1', role: 'user', content: '테스트 메시지' }],
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().saveConversation()

    expect(conversationSaveMock).toHaveBeenCalledTimes(1)
    const callArg = conversationSaveMock.mock.calls[0][0]
    expect(callArg.conversation.cwd).toBeUndefined()
  })

  it('messages가 빈 배열이면 saveConversation은 IPC를 호출하지 않는다', async () => {
    resetStore({ workspaceRoot: '/x', messages: [] })
    await useAppStore.getState().saveConversation()
    expect(conversationSaveMock).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('ADR-020 selectConversation — cwd 복원', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    workspaceOpenMock.mockResolvedValue({ rootPath: '/y', tree: MOCK_TREE })
    resetStore({ workspaceRoot: '/x' })
  })

  it('conv.cwd="/y"(현재 "/x"와 다름) → workspaceOpen({folderPath:"/y"}) 호출', async () => {
    await useAppStore.getState().selectConversation('cwd-conv-1')

    expect(workspaceOpenMock).toHaveBeenCalledTimes(1)
    expect(workspaceOpenMock).toHaveBeenCalledWith({ folderPath: '/y' })
  })

  it('workspaceOpen 성공(rootPath="/y") → workspaceRoot="/y"로 갱신', async () => {
    await useAppStore.getState().selectConversation('cwd-conv-1')

    expect(useAppStore.getState().workspaceRoot).toBe('/y')
  })

  it('workspaceOpen 성공(rootPath="/y") → fileTree 갱신', async () => {
    await useAppStore.getState().selectConversation('cwd-conv-1')

    expect(useAppStore.getState().fileTree).toBe(MOCK_TREE)
  })

  it('workspaceOpen 성공 → loadProjectFiles 호출됨', async () => {
    // loadProjectFiles를 spy
    const spyLoadProjectFiles = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({
      loadProjectFiles: spyLoadProjectFiles,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().selectConversation('cwd-conv-1')
    // 비동기 void 호출이므로 약간 대기
    await new Promise((r) => setTimeout(r, 20))

    expect(spyLoadProjectFiles).toHaveBeenCalled()
  })

  it('workspaceOpen rootPath:null(검증 실패) → workspaceRoot 미변경(graceful)', async () => {
    workspaceOpenMock.mockResolvedValue({ rootPath: null, tree: null })
    resetStore({ workspaceRoot: '/x' })

    await useAppStore.getState().selectConversation('cwd-conv-1')

    // workspaceRoot는 '/x'로 유지됨
    expect(useAppStore.getState().workspaceRoot).toBe('/x')
  })

  it('workspaceOpen rootPath:null → fileTree 미변경', async () => {
    const originalTree: FileTreeNode = { name: 'original', path: '/x', kind: 'directory', children: [] }
    workspaceOpenMock.mockResolvedValue({ rootPath: null, tree: null })
    resetStore({ workspaceRoot: '/x', fileTree: originalTree })

    await useAppStore.getState().selectConversation('cwd-conv-1')

    expect(useAppStore.getState().fileTree).toBe(originalTree)
  })

  it('conv.cwd 없음 → workspaceOpen 미호출', async () => {
    await useAppStore.getState().selectConversation('cwd-conv-2')

    expect(workspaceOpenMock).not.toHaveBeenCalled()
  })

  it('conv.cwd === 현재 workspaceRoot("/x") → 불필요 재오픈 안 함', async () => {
    resetStore({ workspaceRoot: '/x' })

    await useAppStore.getState().selectConversation('cwd-conv-3')

    // conv.cwd("/x") === workspaceRoot("/x") → 재오픈 불필요
    expect(workspaceOpenMock).not.toHaveBeenCalled()
  })

  it('cwd 복원 후에도 conversationId, messages 등 대화 상태는 올바르게 설정됨', async () => {
    await useAppStore.getState().selectConversation('cwd-conv-1')

    expect(useAppStore.getState().conversationId).toBe('cwd-conv-1')
    expect(useAppStore.getState().messages).toHaveLength(1)
    expect(useAppStore.getState().messages[0].content).toBe('안녕')
  })

  it('workspaceOpen IPC 예외 발생 시 workspaceRoot 미변경(graceful)', async () => {
    workspaceOpenMock.mockRejectedValue(new Error('IPC 실패'))
    resetStore({ workspaceRoot: '/x' })

    // 예외가 전파되지 않아야 함
    await expect(
      useAppStore.getState().selectConversation('cwd-conv-1')
    ).resolves.toBeUndefined()

    expect(useAppStore.getState().workspaceRoot).toBe('/x')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('ADR-020 openWorkspace — restoreWorkspaceFromCwd 헬퍼 재사용', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    workspaceOpenMock.mockResolvedValue({ rootPath: '/new', tree: MOCK_TREE })
    resetStore()
  })

  it('openWorkspace 호출 시 workspaceOpen({}) IPC를 경유한다', async () => {
    await useAppStore.getState().openWorkspace()

    expect(workspaceOpenMock).toHaveBeenCalledWith({})
  })

  it('openWorkspace 성공 시 workspaceRoot 갱신됨', async () => {
    await useAppStore.getState().openWorkspace()

    expect(useAppStore.getState().workspaceRoot).toBe('/new')
  })

  it('openWorkspace 성공 시 fileTree 갱신됨', async () => {
    await useAppStore.getState().openWorkspace()

    expect(useAppStore.getState().fileTree).toBe(MOCK_TREE)
  })
})
