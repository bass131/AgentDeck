/**
 * p13-file-tree-refresh.test.ts — P13 탐색기 갱신 타이밍 TDD
 *
 * 검증 범위:
 *   (a) refreshFileTree() 액션:
 *       - workspaceRoot 있을 때 workspaceTree 호출 → fileTree 갱신
 *       - workspaceRoot 없을 때 no-op (workspaceTree 미호출)
 *       - IPC 실패 시 기존 트리 유지 (graceful)
 *       - tree: null 응답 시 기존 트리 유지
 *   (b) 에이전트 턴 종료(done 이벤트) 시 refreshFileTree 1회 호출
 *       - subscribeAgentEvents → done 이벤트 처리 시 workspaceTree 호출 확인
 *   (c) 스트리밍 중(text 이벤트)에는 workspaceTree 미호출 (과빈도 방지)
 *   (d) error 이벤트 시에도 refreshFileTree 1회 호출
 *   (e) selectFileTree 셀렉터 회귀 — 기존 동작 유지
 *
 * 아키텍처 준수:
 *   - window.api.workspaceTree(화이트리스트·기존 reviewed)만 호출
 *   - fs/Node 직접 0
 *   - 채널명 하드코딩 0 (IPC는 store 액션 경유)
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── 타입 ─────────────────────────────────────────────────────────────────────
import type { FileTreeNode } from '../../src/shared/ipc-contract'
import type { AgentEventPayload } from '../../src/shared/ipc-contract'

// ── 샘플 트리 ─────────────────────────────────────────────────────────────────
const SAMPLE_TREE: FileTreeNode = {
  name: 'my-project',
  path: '.',
  kind: 'directory',
  children: [
    { name: 'src', path: 'src', kind: 'directory', children: [] },
    { name: 'README.md', path: 'README.md', kind: 'file' },
  ],
}

const REFRESHED_TREE: FileTreeNode = {
  name: 'my-project',
  path: '.',
  kind: 'directory',
  children: [
    { name: 'src', path: 'src', kind: 'directory', children: [] },
    { name: 'README.md', path: 'README.md', kind: 'file' },
    { name: 'new-file.ts', path: 'new-file.ts', kind: 'file' },
  ],
}

// ── (a) refreshFileTree() 액션 ────────────────────────────────────────────────

describe('(a) refreshFileTree() 액션', () => {
  const mockWorkspaceTree = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockWorkspaceTree.mockResolvedValue({ tree: REFRESHED_TREE })
    Object.defineProperty(globalThis, 'window', {
      value: {
        api: {
          workspaceTree: mockWorkspaceTree,
          workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
          conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
          conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
          agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
          agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
          onAgentEvent: vi.fn().mockReturnValue(vi.fn()),
          listFiles: vi.fn().mockResolvedValue({ files: [] }),
        },
      },
      writable: true,
      configurable: true,
    })
  })

  it('workspaceRoot 있을 때 workspaceTree 호출 → fileTree 갱신', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    // 워크스페이스 오픈 상태 시뮬레이션
    useAppStore.setState({
      workspaceRoot: '/home/user/my-project',
      fileTree: SAMPLE_TREE,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().refreshFileTree()

    expect(mockWorkspaceTree).toHaveBeenCalledTimes(1)
    const state = useAppStore.getState()
    expect(state.fileTree).toEqual(REFRESHED_TREE)
  })

  it('workspaceRoot 없을 때 no-op (workspaceTree 미호출)', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      workspaceRoot: null,
      fileTree: null,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().refreshFileTree()

    expect(mockWorkspaceTree).not.toHaveBeenCalled()
    expect(useAppStore.getState().fileTree).toBeNull()
  })

  it('IPC 실패 시 기존 트리 유지 (graceful)', async () => {
    mockWorkspaceTree.mockRejectedValueOnce(new Error('IPC error'))
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      workspaceRoot: '/home/user/my-project',
      fileTree: SAMPLE_TREE,
    } as Parameters<typeof useAppStore.setState>[0])

    // 에러를 throw하지 않아야 함
    await expect(useAppStore.getState().refreshFileTree()).resolves.toBeUndefined()
    // 기존 트리 유지
    expect(useAppStore.getState().fileTree).toEqual(SAMPLE_TREE)
  })

  it('tree: null 응답 시 기존 트리 유지', async () => {
    mockWorkspaceTree.mockResolvedValueOnce({ tree: null })
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      workspaceRoot: '/home/user/my-project',
      fileTree: SAMPLE_TREE,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().refreshFileTree()

    // tree: null → 기존 트리 그대로
    expect(useAppStore.getState().fileTree).toEqual(SAMPLE_TREE)
  })
})

// ── (b) done 이벤트 시 refreshFileTree 호출 ───────────────────────────────────

describe('(b) done 이벤트 시 refreshFileTree 1회 호출', () => {
  const mockWorkspaceTree = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockWorkspaceTree.mockResolvedValue({ tree: REFRESHED_TREE })
    Object.defineProperty(globalThis, 'window', {
      value: {
        api: {
          workspaceTree: mockWorkspaceTree,
          workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
          conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
          conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
          agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
          agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
          onAgentEvent: vi.fn().mockReturnValue(vi.fn()),
          listFiles: vi.fn().mockResolvedValue({ files: [] }),
        },
      },
      writable: true,
      configurable: true,
    })
  })

  it('done 이벤트 처리 시 workspaceTree 1회 호출 (워크스페이스 오픈)', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    // 워크스페이스 오픈 + 실행 중 상태 시뮬레이션
    useAppStore.setState({
      workspaceRoot: '/home/user/my-project',
      fileTree: SAMPLE_TREE,
      isRunning: true,
      streamingText: '에이전트 응답',
    } as Parameters<typeof useAppStore.setState>[0])

    // onAgentEvent 콜백 캡처를 위해 mock 교체
    let capturedCallback: ((payload: AgentEventPayload) => void) | null = null
    ;(window.api as Record<string, unknown>).onAgentEvent = (
      cb: (payload: AgentEventPayload) => void
    ) => {
      capturedCallback = cb
      return () => {}
    }

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    // done 이벤트 전송
    const donePayload: AgentEventPayload = {
      runId: 'r1',
      event: { type: 'done' },
    }
    capturedCallback!(donePayload)

    // 비동기 side-effect 완료 대기
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(mockWorkspaceTree).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('done 이벤트 처리 시 fileTree가 REFRESHED_TREE로 갱신됨', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      workspaceRoot: '/home/user/my-project',
      fileTree: SAMPLE_TREE,
      isRunning: true,
      streamingText: '',
    } as Parameters<typeof useAppStore.setState>[0])

    let capturedCallback: ((payload: AgentEventPayload) => void) | null = null
    ;(window.api as Record<string, unknown>).onAgentEvent = (
      cb: (payload: AgentEventPayload) => void
    ) => {
      capturedCallback = cb
      return () => {}
    }

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    capturedCallback!({ runId: 'r1', event: { type: 'done' } })

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(useAppStore.getState().fileTree).toEqual(REFRESHED_TREE)
    unsubscribe()
  })
})

// ── (c) 스트리밍 중(text 이벤트)에는 workspaceTree 미호출 ──────────────────────

describe('(c) text 이벤트(스트리밍 중)에는 workspaceTree 미호출', () => {
  const mockWorkspaceTree = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockWorkspaceTree.mockResolvedValue({ tree: REFRESHED_TREE })
    Object.defineProperty(globalThis, 'window', {
      value: {
        api: {
          workspaceTree: mockWorkspaceTree,
          workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
          conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
          conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
          agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
          agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
          onAgentEvent: vi.fn().mockReturnValue(vi.fn()),
          listFiles: vi.fn().mockResolvedValue({ files: [] }),
        },
      },
      writable: true,
      configurable: true,
    })
  })

  it('text 이벤트 처리 시 workspaceTree 호출되지 않음', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      workspaceRoot: '/home/user/my-project',
      fileTree: SAMPLE_TREE,
    } as Parameters<typeof useAppStore.setState>[0])

    let capturedCallback: ((payload: AgentEventPayload) => void) | null = null
    ;(window.api as Record<string, unknown>).onAgentEvent = (
      cb: (payload: AgentEventPayload) => void
    ) => {
      capturedCallback = cb
      return () => {}
    }

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    // 여러 text 이벤트 전송 (스트리밍 시뮬레이션)
    capturedCallback!({ runId: 'r1', event: { type: 'text', delta: '안녕' } })
    capturedCallback!({ runId: 'r1', event: { type: 'text', delta: '하세요' } })
    capturedCallback!({ runId: 'r1', event: { type: 'text', delta: '!' } })

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(mockWorkspaceTree).not.toHaveBeenCalled()
    unsubscribe()
  })
})

// ── (d) error 이벤트 시에도 refreshFileTree 호출 ─────────────────────────────

describe('(d) error 이벤트 시에도 refreshFileTree 1회 호출', () => {
  const mockWorkspaceTree = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockWorkspaceTree.mockResolvedValue({ tree: REFRESHED_TREE })
    Object.defineProperty(globalThis, 'window', {
      value: {
        api: {
          workspaceTree: mockWorkspaceTree,
          workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
          conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
          conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
          agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
          agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
          onAgentEvent: vi.fn().mockReturnValue(vi.fn()),
          listFiles: vi.fn().mockResolvedValue({ files: [] }),
        },
      },
      writable: true,
      configurable: true,
    })
  })

  it('error 이벤트 처리 시 workspaceTree 1회 호출 (워크스페이스 오픈)', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      workspaceRoot: '/home/user/my-project',
      fileTree: SAMPLE_TREE,
      isRunning: true,
    } as Parameters<typeof useAppStore.setState>[0])

    let capturedCallback: ((payload: AgentEventPayload) => void) | null = null
    ;(window.api as Record<string, unknown>).onAgentEvent = (
      cb: (payload: AgentEventPayload) => void
    ) => {
      capturedCallback = cb
      return () => {}
    }

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    capturedCallback!({ runId: 'r1', event: { type: 'error', message: '엔진 오류' } })

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(mockWorkspaceTree).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})

// ── (e) selectFileTree 셀렉터 회귀 ───────────────────────────────────────────

describe('(e) selectFileTree 셀렉터 회귀', () => {
  beforeEach(() => {
    vi.resetModules()
    Object.defineProperty(globalThis, 'window', {
      value: {
        api: {
          workspaceTree: vi.fn().mockResolvedValue({ tree: REFRESHED_TREE }),
          workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
          conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
          conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
          agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
          agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
          onAgentEvent: vi.fn().mockReturnValue(vi.fn()),
          listFiles: vi.fn().mockResolvedValue({ files: [] }),
        },
      },
      writable: true,
      configurable: true,
    })
  })

  it('selectFileTree 셀렉터는 fileTree 상태를 반환한다', async () => {
    const { useAppStore, selectFileTree } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      fileTree: SAMPLE_TREE,
    } as Parameters<typeof useAppStore.setState>[0])
    const tree = selectFileTree(useAppStore.getState())
    expect(tree).toEqual(SAMPLE_TREE)
  })

  it('fileTree가 null이면 selectFileTree는 null 반환', async () => {
    const { useAppStore, selectFileTree } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      fileTree: null,
    } as Parameters<typeof useAppStore.setState>[0])
    const tree = selectFileTree(useAppStore.getState())
    expect(tree).toBeNull()
  })
})
