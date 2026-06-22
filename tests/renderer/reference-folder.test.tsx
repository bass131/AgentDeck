// @vitest-environment jsdom
/**
 * reference-folder.test.tsx — M2-03 레퍼런스 폴더 renderer 테스트 (TDD RED→GREEN).
 *
 * 검증 범위:
 *   1. store addReference / loadReferences 액션
 *   2. store openFile rootId 확장 (기존 단언 회귀 0)
 *   3. FileExplorer 레퍼런스 섹션 렌더 + 클릭 동작
 *   4. CodeViewerPane 읽기전용 태그 표시
 *
 * 신뢰경계: window.api mock 경유만. fs/Node 직접 호출 0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

// ── window.api mock ───────────────────────────────────────────────────────────
const mockFsRead = vi.fn()
const mockReferenceAdd = vi.fn()
const mockReferenceList = vi.fn()
const mockReferenceTree = vi.fn()

const mockApi = {
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
  workspaceTree: vi.fn().mockResolvedValue({ tree: null }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'run-test' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(vi.fn()),
  fsDiff: vi.fn().mockResolvedValue({ filePath: '', lines: [] }),
  fsRead: mockFsRead,
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
  referenceAdd: mockReferenceAdd,
  referenceList: mockReferenceList,
  referenceTree: mockReferenceTree,
}

Object.defineProperty(window, 'api', {
  value: mockApi,
  writable: true,
  configurable: true,
})

// ── CodeMirror mock (CodeViewerPane 경로에서 필요) ────────────────────────────
vi.mock('../../src/renderer/src/theme/darcula', () => ({
  darculaTheme: {},
  darculaHighlighting: {},
  darculaHighlightStyle: {},
}))

vi.mock('@codemirror/view', () => {
  class MockEditorView {
    static theme(_spec: unknown, _opts?: unknown) { return {} }
    constructor({ parent }: { parent: HTMLElement }) {
      const div = document.createElement('div')
      div.className = 'cm-editor'
      parent.appendChild(div)
    }
    destroy() {}
    dispatch() {}
  }
  return {
    EditorView: MockEditorView,
    lineNumbers: vi.fn(() => ({})),
    highlightActiveLine: vi.fn(() => ({})),
    keymap: { of: vi.fn(() => ({})) },
    drawSelection: vi.fn(() => ({})),
    dropCursor: vi.fn(() => ({})),
    rectangularSelection: vi.fn(() => ({})),
    crosshairCursor: vi.fn(() => ({})),
    highlightActiveLineGutter: vi.fn(() => ({})),
    highlightSpecialChars: vi.fn(() => ({})),
    ViewPlugin: { fromClass: vi.fn(() => ({})) },
    Decoration: { mark: vi.fn(), widget: vi.fn(), set: vi.fn(() => []) },
    WidgetType: class {},
  }
})

vi.mock('@codemirror/state', () => ({
  EditorState: {
    create: vi.fn(() => ({})),
    readOnly: { of: vi.fn(() => ({})) },
  },
  Compartment: class {
    of(v: unknown) { return v }
    reconfigure(v: unknown) { return v }
  },
  StateEffect: { define: vi.fn(() => ({ of: vi.fn(() => ({})) })) },
}))

vi.mock('@codemirror/language', () => ({
  syntaxHighlighting: vi.fn(() => ({})),
  defaultHighlightStyle: {},
  indentOnInput: vi.fn(() => ({})),
  foldGutter: vi.fn(() => ({})),
  bracketMatching: vi.fn(() => ({})),
  LanguageSupport: class {},
  HighlightStyle: { define: vi.fn(() => ({})) },
}))

vi.mock('@codemirror/commands', () => ({
  defaultKeymap: [],
  historyKeymap: [],
  history: vi.fn(() => ({})),
}))

vi.mock('@codemirror/search', () => ({
  searchKeymap: [],
  highlightSelectionMatches: vi.fn(() => ({})),
}))

vi.mock('@codemirror/lang-javascript', () => ({ javascript: vi.fn(() => ({})) }))
vi.mock('@codemirror/lang-python', () => ({ python: vi.fn(() => ({})) }))
vi.mock('@codemirror/lang-json', () => ({ json: vi.fn(() => ({})) }))
vi.mock('@codemirror/lang-markdown', () => ({ markdown: vi.fn(() => ({})) }))
vi.mock('@codemirror/lang-html', () => ({ html: vi.fn(() => ({})) }))
vi.mock('@codemirror/lang-css', () => ({ css: vi.fn(() => ({})) }))

// ── 공통 fixtures ─────────────────────────────────────────────────────────────

const REF_FOLDER = {
  id: 'ref-1',
  name: 'my-lib',
  rootPath: '/projects/my-lib',
  readOnly: true as const,
}

const REF_TREE = {
  name: 'my-lib',
  path: '',
  kind: 'directory' as const,
  children: [
    { name: 'index.ts', path: 'index.ts', kind: 'file' as const },
    { name: 'util.ts', path: 'util.ts', kind: 'file' as const },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFsRead.mockResolvedValue({ kind: 'text', content: '', language: 'text' })
  mockReferenceAdd.mockResolvedValue({ reference: REF_FOLDER })
  mockReferenceList.mockResolvedValue({ references: [REF_FOLDER] })
  mockReferenceTree.mockResolvedValue({ tree: REF_TREE })
  mockApi.onAgentEvent.mockReturnValue(vi.fn())
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.conversationSave.mockResolvedValue({ id: 'cv-1' })
})

afterEach(() => {
  cleanup()
})

// ═══════════════════════════════════════════════════════════════════════════════
// 1. store — addReference
// ═══════════════════════════════════════════════════════════════════════════════

describe('store addReference', () => {
  it('referenceAdd → referenceTree 순으로 IPC 호출', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({ references: [], openedRootId: null } as Parameters<typeof useAppStore.setState>[0])

    const addReference = useAppStore.getState().addReference
    await act(async () => {
      await addReference()
    })

    expect(mockReferenceAdd).toHaveBeenCalledWith({})
    expect(mockReferenceTree).toHaveBeenCalledWith({ id: 'ref-1' })
  })

  it('addReference 후 references 배열에 {id, name, tree} 추가', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({ references: [], openedRootId: null } as Parameters<typeof useAppStore.setState>[0])

    const addReference = useAppStore.getState().addReference
    await act(async () => {
      await addReference()
    })

    const state = useAppStore.getState()
    expect(state.references).toHaveLength(1)
    expect(state.references[0]).toMatchObject({ id: 'ref-1', name: 'my-lib', tree: REF_TREE })
  })

  it('referenceAdd가 null 반환 시(사용자 취소) references 변경 없음', async () => {
    mockReferenceAdd.mockResolvedValue({ reference: null })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({ references: [], openedRootId: null } as Parameters<typeof useAppStore.setState>[0])

    const addReference = useAppStore.getState().addReference
    await act(async () => {
      await addReference()
    })

    const state = useAppStore.getState()
    expect(state.references).toHaveLength(0)
    expect(mockReferenceTree).not.toHaveBeenCalled()
  })

  it('중복 id 재등록 시 references 배열에 추가되지 않음', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      references: [{ id: 'ref-1', name: 'my-lib', tree: REF_TREE }],
      openedRootId: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const addReference = useAppStore.getState().addReference
    await act(async () => {
      await addReference()
    })

    const state = useAppStore.getState()
    expect(state.references).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. store — loadReferences
// ═══════════════════════════════════════════════════════════════════════════════

describe('store loadReferences', () => {
  it('referenceList 호출 후 각 ref의 tree를 채워 references 세팅', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({ references: [], openedRootId: null } as Parameters<typeof useAppStore.setState>[0])

    const loadReferences = useAppStore.getState().loadReferences
    await act(async () => {
      await loadReferences()
    })

    expect(mockReferenceList).toHaveBeenCalledWith({})
    expect(mockReferenceTree).toHaveBeenCalledWith({ id: 'ref-1' })

    const state = useAppStore.getState()
    expect(state.references).toHaveLength(1)
    expect(state.references[0]).toMatchObject({ id: 'ref-1', name: 'my-lib', tree: REF_TREE })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. store — openFile rootId 확장 (기존 단언 회귀 없음)
// ═══════════════════════════════════════════════════════════════════════════════

describe('store openFile rootId 확장', () => {
  it('openFile(path, rootId) → fsRead가 {path, root: rootId}로 호출 + openedRootId 세팅', async () => {
    mockFsRead.mockResolvedValue({ kind: 'text', content: 'hello', language: 'typescript' })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      openedFile: null, openedContent: null, openedLanguage: null,
      openedStatus: 'idle', openedViewer: 'code', openedDataUrl: null,
      openedRootId: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const openFile = useAppStore.getState().openFile
    await act(async () => {
      await openFile('index.ts', 'ref-1')
    })

    expect(mockFsRead).toHaveBeenCalledWith({ path: 'index.ts', root: 'ref-1' })
    const state = useAppStore.getState()
    expect(state.openedRootId).toBe('ref-1')
    expect(state.openedStatus).toBe('ready')
  })

  it('openFile(path) rootId 없음 → fsRead가 {path}만으로 호출 (기존 회귀 방지)', async () => {
    mockFsRead.mockResolvedValue({ kind: 'text', content: 'x', language: 'typescript' })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      openedFile: null, openedContent: null, openedLanguage: null,
      openedStatus: 'idle', openedViewer: 'code', openedDataUrl: null,
      openedRootId: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const openFile = useAppStore.getState().openFile
    await act(async () => {
      await openFile('b.ts')
    })

    // root 필드 없음 — 기존 단언과 동일
    expect(mockFsRead).toHaveBeenCalledWith({ path: 'b.ts' })
    const state = useAppStore.getState()
    expect(state.openedRootId).toBeNull()
  })

  it('이미지 파일에 rootId 지정 시 {path, asBinary:true, root} 조합', async () => {
    mockFsRead.mockResolvedValue({
      kind: 'binary',
      dataUrl: 'data:image/png;base64,AAA',
      mime: 'image/png',
    })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      openedFile: null, openedContent: null, openedLanguage: null,
      openedStatus: 'idle', openedViewer: 'code', openedDataUrl: null,
      openedRootId: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const openFile = useAppStore.getState().openFile
    await act(async () => {
      await openFile('logo.png', 'ref-1')
    })

    expect(mockFsRead).toHaveBeenCalledWith({ path: 'logo.png', asBinary: true, root: 'ref-1' })
    expect(useAppStore.getState().openedRootId).toBe('ref-1')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. 셀렉터
// ═══════════════════════════════════════════════════════════════════════════════

describe('셀렉터 selectReferences / selectOpenedRootId', () => {
  it('selectReferences: references 배열 반환', async () => {
    const { useAppStore, selectReferences } = await import('../../src/renderer/src/store/appStore')
    const entry = { id: 'ref-1', name: 'my-lib', tree: null }
    useAppStore.setState({ references: [entry] } as Parameters<typeof useAppStore.setState>[0])
    expect(selectReferences(useAppStore.getState())).toEqual([entry])
  })

  it('selectOpenedRootId: openedRootId 반환', async () => {
    const { useAppStore, selectOpenedRootId } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({ openedRootId: 'ref-2' } as Parameters<typeof useAppStore.setState>[0])
    expect(selectOpenedRootId(useAppStore.getState())).toBe('ref-2')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 5. FileExplorer — 레퍼런스 섹션
// ═══════════════════════════════════════════════════════════════════════════════

describe('FileExplorer 레퍼런스 섹션', () => {
  it('레퍼런스 섹션 헤더가 렌더된다', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      fileTree: null,
      workspaceRoot: null,
      references: [],
      openedFile: null,
      changedFiles: new Set(),
      openedRootId: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const { FileExplorer } = await import('../../src/renderer/src/components/FileExplorer')
    await act(async () => {
      render(<FileExplorer />)
    })
    // 레퍼런스 섹션 헤더 존재 확인
    expect(screen.getByText(/레퍼런스/i)).toBeTruthy()
  })

  it('"+ 레퍼런스 폴더 추가" 버튼이 있고 클릭 시 addReference 호출', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      fileTree: null,
      workspaceRoot: null,
      references: [],
      openedFile: null,
      changedFiles: new Set(),
      openedRootId: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const { FileExplorer } = await import('../../src/renderer/src/components/FileExplorer')
    await act(async () => {
      render(<FileExplorer />)
    })

    const addBtn = screen.getByRole('button', { name: /레퍼런스 폴더 추가/i })
    expect(addBtn).toBeTruthy()

    await act(async () => {
      fireEvent.click(addBtn)
    })

    expect(mockReferenceAdd).toHaveBeenCalledWith({})
  })

  it('레퍼런스 항목에 이름과 읽기전용 배지가 표시된다', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      fileTree: null,
      workspaceRoot: null,
      references: [{ id: 'ref-1', name: 'my-lib', tree: null }],
      openedFile: null,
      changedFiles: new Set(),
      openedRootId: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const { FileExplorer } = await import('../../src/renderer/src/components/FileExplorer')
    let container!: HTMLElement
    await act(async () => {
      const result = render(<FileExplorer />)
      container = result.container
    })

    // 레퍼런스 이름
    expect(screen.getByText('my-lib')).toBeTruthy()
    // 읽기전용 배지
    expect(container.querySelector('.fe-ref-badge')).toBeTruthy()
  })

  it('레퍼런스 파일 클릭 시 openFile이 rootId와 함께 호출됨', async () => {
    mockFsRead.mockResolvedValue({ kind: 'text', content: 'x', language: 'typescript' })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      fileTree: null,
      workspaceRoot: null,
      references: [{ id: 'ref-1', name: 'my-lib', tree: REF_TREE }],
      openedFile: null,
      changedFiles: new Set(),
      openedRootId: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const { FileExplorer } = await import('../../src/renderer/src/components/FileExplorer')
    await act(async () => {
      render(<FileExplorer />)
    })

    // index.ts 클릭
    const fileBtn = screen.getByTitle('index.ts')
    await act(async () => {
      fireEvent.click(fileBtn)
    })

    // openFile이 rootId와 함께 호출 → fsRead에 root 포함
    expect(mockFsRead).toHaveBeenCalledWith({ path: 'index.ts', root: 'ref-1' })
  })

  it('레퍼런스 파일 클릭 시 selectDiffFile 미호출 (diff 미연동)', async () => {
    mockFsRead.mockResolvedValue({ kind: 'text', content: 'x', language: 'typescript' })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    // selectDiffFile 호출 여부 감지를 위해 diffFilePath 초기값 확인
    useAppStore.setState({
      fileTree: null,
      workspaceRoot: null,
      references: [{ id: 'ref-1', name: 'my-lib', tree: REF_TREE }],
      openedFile: null,
      changedFiles: new Set(),
      openedRootId: null,
      diffFilePath: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const { FileExplorer } = await import('../../src/renderer/src/components/FileExplorer')
    await act(async () => {
      render(<FileExplorer />)
    })

    const fileBtn = screen.getByTitle('index.ts')
    await act(async () => {
      fireEvent.click(fileBtn)
    })

    // diffFilePath는 변경되지 않아야 함
    expect(useAppStore.getState().diffFilePath).toBeNull()
  })

  it('워크스페이스 파일 클릭 동작은 기존 유지 (openFile + selectDiffFile)', async () => {
    mockFsRead.mockResolvedValue({ kind: 'text', content: 'x', language: 'typescript' })

    const WS_TREE = {
      name: 'project',
      path: '',
      kind: 'directory' as const,
      children: [
        { name: 'app.ts', path: 'app.ts', kind: 'file' as const },
      ],
    }

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      fileTree: WS_TREE,
      workspaceRoot: '/projects/project',
      references: [],
      openedFile: null,
      changedFiles: new Set(),
      openedRootId: null,
      diffFilePath: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const { FileExplorer } = await import('../../src/renderer/src/components/FileExplorer')
    await act(async () => {
      render(<FileExplorer />)
    })

    const fileBtn = screen.getByTitle('app.ts')
    await act(async () => {
      fireEvent.click(fileBtn)
    })

    // fsRead에 root 없이 호출 (기존 동작)
    expect(mockFsRead).toHaveBeenCalledWith({ path: 'app.ts' })
    // diffFilePath도 세팅됨 (기존 동작)
    expect(useAppStore.getState().diffFilePath).toBe('app.ts')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 6. CodeViewerPane — 읽기전용 태그
// ═══════════════════════════════════════════════════════════════════════════════

describe('CodeViewerPane 읽기전용 태그', () => {
  it('openedRootId가 ref-1이면 "읽기전용" 태그가 표시된다', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      openedFile: 'index.ts',
      openedContent: 'const x = 1',
      openedLanguage: 'typescript',
      openedStatus: 'ready',
      openedViewer: 'code',
      openedDataUrl: null,
      openedRootId: 'ref-1',
    } as Parameters<typeof useAppStore.setState>[0])

    const { CodeViewerPane } = await import('../../src/renderer/src/layout/CodeViewerPane')
    let container!: HTMLElement
    await act(async () => {
      const result = render(<CodeViewerPane />)
      container = result.container
    })

    expect(container.querySelector('.cvp-readonly-badge')).toBeTruthy()
  })

  it('openedRootId가 null이면 읽기전용 태그 없음', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      openedFile: 'app.ts',
      openedContent: 'const x = 1',
      openedLanguage: 'typescript',
      openedStatus: 'ready',
      openedViewer: 'code',
      openedDataUrl: null,
      openedRootId: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const { CodeViewerPane } = await import('../../src/renderer/src/layout/CodeViewerPane')
    let container!: HTMLElement
    await act(async () => {
      const result = render(<CodeViewerPane />)
      container = result.container
    })

    expect(container.querySelector('.cvp-readonly-badge')).toBeNull()
  })
})
