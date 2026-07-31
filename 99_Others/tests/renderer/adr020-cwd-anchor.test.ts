import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from '../../../02_Source/renderer/src/store/appStore'
import type { ConversationRecord, FileTreeNode } from '../../../02_Source/shared/ipcContract'
import type { ThreadItem } from '../../../02_Source/renderer/src/store/threadTypes'
import { installWindowApi } from './helpers/windowApiMock'

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
  cwd: '/x',
}

const workspaceOpenMock = vi.fn()
const conversationSaveMock = vi.fn()

installWindowApi({
  conversationLoad: async (req: { id?: string; limit?: number }) => {
    if (req.id === 'cwd-conv-1') return { conversations: [RECORD_WITH_CWD] }
    if (req.id === 'cwd-conv-2') return { conversations: [RECORD_NO_CWD] }
    if (req.id === 'cwd-conv-3') return { conversations: [RECORD_SAME_CWD] }
    return { conversations: [] }
  },
  conversationSave: conversationSaveMock,
  agentRun: async () => ({ runId: 'r1' }),
  workspaceOpen: workspaceOpenMock,
})

function resetStore(overrides: Record<string, unknown> = {}) {
  useAppStore.setState({
    conversations: [],
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

describe('ADR-020 saveConversation — cwd 기록', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    conversationSaveMock.mockResolvedValue({ id: 'cv-new' })
    workspaceOpenMock.mockResolvedValue({ rootPath: null, tree: null })
    resetStore()
  })

  it('workspaceRoot="/x" 상태에서 saveConversation 시 IPC 인자에 cwd:"/x" 포함', async () => {
    resetStore({ workspaceRoot: '/x' })
    useAppStore.setState({
      thread: [{ kind: 'msg', id: 'm-1', role: 'user', text: '테스트 메시지' }],
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().saveConversation()

    expect(conversationSaveMock).toHaveBeenCalledTimes(1)
    const callArg = conversationSaveMock.mock.calls[0][0]
    expect(callArg.conversation.cwd).toBe('/x')
  })

  it('workspaceRoot=null 상태에서 saveConversation 시 IPC 인자에 cwd 미포함(undefined)', async () => {
    resetStore({ workspaceRoot: null })
    useAppStore.setState({
      thread: [{ kind: 'msg', id: 'm-1', role: 'user', text: '테스트 메시지' }],
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().saveConversation()

    expect(conversationSaveMock).toHaveBeenCalledTimes(1)
    const callArg = conversationSaveMock.mock.calls[0][0]
    expect(callArg.conversation.cwd).toBeUndefined()
  })

  it('thread에 msg가 없으면 saveConversation은 IPC를 호출하지 않는다', async () => {
    resetStore({ workspaceRoot: '/x', thread: [] })
    await useAppStore.getState().saveConversation()
    expect(conversationSaveMock).not.toHaveBeenCalled()
  })
})

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
    const spyLoadProjectFiles = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({
      loadProjectFiles: spyLoadProjectFiles,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().selectConversation('cwd-conv-1')
    await new Promise((r) => setTimeout(r, 20))

    expect(spyLoadProjectFiles).toHaveBeenCalled()
  })

  it('workspaceOpen rootPath:null(검증 실패) → workspaceRoot 미변경(graceful)', async () => {
    workspaceOpenMock.mockResolvedValue({ rootPath: null, tree: null })
    resetStore({ workspaceRoot: '/x' })

    await useAppStore.getState().selectConversation('cwd-conv-1')

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

    expect(workspaceOpenMock).not.toHaveBeenCalled()
  })

  it('cwd 복원 후에도 conversationId, thread 등 대화 상태는 올바르게 설정됨', async () => {
    await useAppStore.getState().selectConversation('cwd-conv-1')

    expect(useAppStore.getState().conversationId).toBe('cwd-conv-1')
    const msgs = useAppStore.getState().thread
      .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
    expect(msgs).toHaveLength(1)
    expect(msgs[0].text).toBe('안녕')
  })

  it('workspaceOpen IPC 예외 발생 시 workspaceRoot 미변경(graceful)', async () => {
    workspaceOpenMock.mockRejectedValue(new Error('IPC 실패'))
    resetStore({ workspaceRoot: '/x' })

    await expect(
      useAppStore.getState().selectConversation('cwd-conv-1')
    ).resolves.toBeUndefined()

    expect(useAppStore.getState().workspaceRoot).toBe('/x')
  })
})

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
