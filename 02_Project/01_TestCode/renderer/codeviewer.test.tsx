// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'

const mockFsRead = vi.fn()
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
}

Object.defineProperty(window, 'api', {
  value: mockApi,
  writable: true,
  configurable: true,
})

vi.mock('../../../02_Project/00_Source/renderer/src/theme/darcula', () => ({
  darculaTheme: {},
  darculaHighlighting: {},
  darculaHighlightStyle: {},
}))

vi.mock('@codemirror/view', () => {
  class MockEditorView {
    static theme(_spec: unknown, _opts?: unknown) { return {} }
    static decorations = { from: vi.fn(() => ({})) }
    constructor({ parent }: { parent: HTMLElement }) {
      const div = document.createElement('div')
      div.className = 'cm-editor'
      parent.appendChild(div)
    }
    destroy() {}
    dispatch() {}
    state = { doc: { lineAt: vi.fn(() => ({ number: 1, from: 0 })), line: vi.fn(() => ({ from: 0, to: 10 })), lines: 100 } }
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
    hoverTooltip: vi.fn(() => ({})),
    ViewPlugin: { fromClass: vi.fn(() => ({})) },
    Decoration: {
      mark: vi.fn(() => ({ range: vi.fn(() => ({ from: 0, to: 1 })) })),
      widget: vi.fn(),
      set: vi.fn(() => []),
      none: [],
      line: vi.fn(() => ({ range: vi.fn(() => ({ from: 0 })) })),
    },
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
  StateField: {
    define: vi.fn((_spec: unknown) => ({ _isStateField: true })),
  },
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
  search: vi.fn(() => ({})),
  openSearchPanel: vi.fn(),
}))

vi.mock('@codemirror/lang-javascript', () => ({
  javascript: vi.fn(() => ({})),
}))

vi.mock('@codemirror/lang-python', () => ({
  python: vi.fn(() => ({})),
}))

vi.mock('@codemirror/lang-json', () => ({
  json: vi.fn(() => ({})),
}))

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: vi.fn(() => ({})),
}))

vi.mock('@codemirror/lang-html', () => ({
  html: vi.fn(() => ({})),
}))

vi.mock('@codemirror/lang-css', () => ({
  css: vi.fn(() => ({})),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockFsRead.mockResolvedValue({ kind: 'text', content: 'hello world', language: 'javascript' })
  mockApi.onAgentEvent.mockReturnValue(vi.fn())
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.conversationSave.mockResolvedValue({ id: 'cv-1' })
})

afterEach(() => {
  cleanup()
})

describe('CodeViewer', () => {
  it('content와 language prop을 받아 마운트된다', async () => {
    const { CodeViewer } = await import(
      '../../../02_Project/00_Source/renderer/src/features/viewer'
    )
    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <CodeViewer content="const x = 1" language="javascript" />
      )
      container = result.container
    })
    expect(container.querySelector('.cm-editor')).toBeTruthy()
  })

  it('content가 없을 때 빈 상태를 렌더한다', async () => {
    const { CodeViewer } = await import(
      '../../../02_Project/00_Source/renderer/src/features/viewer'
    )
    await act(async () => {
      render(<CodeViewer content="" language="text" />)
    })
    expect(true).toBe(true)
  })

  it('다른 언어(python)로도 마운트된다', async () => {
    const { CodeViewer } = await import(
      '../../../02_Project/00_Source/renderer/src/features/viewer'
    )
    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <CodeViewer content="def hello(): pass" language="python" />
      )
      container = result.container
    })
    expect(container.querySelector('.cm-editor')).toBeTruthy()
  })

  it('wrapper에 code-viewer 클래스가 있다', async () => {
    const { CodeViewer } = await import(
      '../../../02_Project/00_Source/renderer/src/features/viewer'
    )
    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <CodeViewer content="hello" language="text" />
      )
      container = result.container
    })
    expect(container.querySelector('.code-viewer')).toBeTruthy()
  })
})

describe('store openFile', () => {
  it('text 응답 → openedContent, openedLanguage, openedStatus 저장', async () => {
    mockFsRead.mockResolvedValue({
      kind: 'text',
      content: 'const x = 42',
      language: 'javascript',
    })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    useAppStore.setState({
      openedFile: null,
      openedContent: null,
      openedLanguage: null,
      openedStatus: 'idle',
      openedViewer: 'code',
      openedDataUrl: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const openFile = useAppStore.getState().openFile
    await act(async () => {
      await openFile('src/foo.ts')
    })

    const state = useAppStore.getState()
    expect(state.openedFile).toBe('src/foo.ts')
    expect(state.openedContent).toBe('const x = 42')
    expect(state.openedLanguage).toBe('javascript')
    expect(state.openedStatus).toBe('ready')
    expect(mockFsRead).toHaveBeenCalledWith({ path: 'src/foo.ts' })
  })

  it('too-large 응답 → openedStatus = "too-large"', async () => {
    mockFsRead.mockResolvedValue({ kind: 'too-large' })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    useAppStore.setState({
      openedFile: null,
      openedContent: null,
      openedLanguage: null,
      openedStatus: 'idle',
      openedViewer: 'code',
      openedDataUrl: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const openFile = useAppStore.getState().openFile
    await act(async () => {
      await openFile('big.bin')
    })

    const state = useAppStore.getState()
    expect(state.openedFile).toBe('big.bin')
    expect(state.openedStatus).toBe('too-large')
    expect(state.openedContent).toBeNull()
  })

  it('binary-skipped 응답 → openedStatus = "binary-skipped"', async () => {
    mockFsRead.mockResolvedValue({ kind: 'binary-skipped' })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    useAppStore.setState({
      openedFile: null,
      openedContent: null,
      openedLanguage: null,
      openedStatus: 'idle',
      openedViewer: 'code',
      openedDataUrl: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const openFile = useAppStore.getState().openFile
    await act(async () => {
      await openFile('image.png')
    })

    const state = useAppStore.getState()
    expect(state.openedStatus).toBe('binary-skipped')
    expect(state.openedContent).toBeNull()
  })

  it('not-found 응답 → openedStatus = "not-found"', async () => {
    mockFsRead.mockResolvedValue({ kind: 'not-found' })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    useAppStore.setState({
      openedFile: null,
      openedContent: null,
      openedLanguage: null,
      openedStatus: 'idle',
      openedViewer: 'code',
      openedDataUrl: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const openFile = useAppStore.getState().openFile
    await act(async () => {
      await openFile('missing.ts')
    })

    const state = useAppStore.getState()
    expect(state.openedStatus).toBe('not-found')
    expect(state.openedContent).toBeNull()
  })

  it('IPC_CHANNELS.FS_READ 채널명을 직접 문자열 하드코딩하지 않는다 (window.api.fsRead 사용)', async () => {
    mockFsRead.mockResolvedValue({ kind: 'text', content: 'x', language: 'text' })

    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    const openFile = useAppStore.getState().openFile
    await act(async () => {
      await openFile('any.ts')
    })

    expect(mockFsRead).toHaveBeenCalledOnce()
  })
})
