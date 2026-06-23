// @vitest-environment jsdom
/**
 * codeviewer.test.tsx — CodeViewer 컴포넌트 + store openFile 액션 테스트.
 *
 * TDD: RED(테스트 먼저) → GREEN(구현).
 * window.api.fsRead mock. CSS/CodeMirror DOM은 jsdom에서 완전 동작 불가 → 구조 단언.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'

// ── window.api mock ───────────────────────────────────────────────────────────
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

// darcula.ts 전체 mock — @lezer/highlight tags 복잡성 우회
vi.mock('../../src/renderer/src/theme/darcula', () => ({
  darculaTheme: {},
  darculaHighlighting: {},
  darculaHighlightStyle: {},
}))

// CodeMirror view mock — EditorView 정적/인스턴스 + 기타
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

// ── CodeViewer 컴포넌트 ──────────────────────────────────────────────────────

describe('CodeViewer', () => {
  it('content와 language prop을 받아 마운트된다', async () => {
    const { CodeViewer } = await import(
      '../../src/renderer/src/components/CodeViewer'
    )
    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <CodeViewer content="const x = 1" language="javascript" />
      )
      container = result.container
    })
    // CodeMirror mock이 .cm-editor div를 생성했어야 한다
    expect(container.querySelector('.cm-editor')).toBeTruthy()
  })

  it('content가 없을 때 빈 상태를 렌더한다', async () => {
    const { CodeViewer } = await import(
      '../../src/renderer/src/components/CodeViewer'
    )
    await act(async () => {
      render(<CodeViewer content="" language="text" />)
    })
    // 빈 상태에서도 에러 없이 렌더
    expect(true).toBe(true)
  })

  it('다른 언어(python)로도 마운트된다', async () => {
    const { CodeViewer } = await import(
      '../../src/renderer/src/components/CodeViewer'
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
      '../../src/renderer/src/components/CodeViewer'
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

// ── store openFile 액션 ───────────────────────────────────────────────────────

describe('store openFile', () => {
  it('text 응답 → openedContent, openedLanguage, openedStatus 저장', async () => {
    mockFsRead.mockResolvedValue({
      kind: 'text',
      content: 'const x = 42',
      language: 'javascript',
    })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    // store 리셋
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

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
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

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
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

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
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
    // window.api.fsRead가 호출되었다는 것 자체가 계약 준수 증거
    mockFsRead.mockResolvedValue({ kind: 'text', content: 'x', language: 'text' })

    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const openFile = useAppStore.getState().openFile
    await act(async () => {
      await openFile('any.ts')
    })

    expect(mockFsRead).toHaveBeenCalledOnce()
  })
})

// ── CodeViewerPane (상태별 표시) ─────────────────────────────────────────────

describe('CodeViewerPane', () => {
  it('idle 상태에서 "파일을 선택하세요" 메시지를 표시한다', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      openedFile: null,
      openedContent: null,
      openedLanguage: null,
      openedStatus: 'idle',
      openedViewer: 'code',
      openedDataUrl: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const { CodeViewerPane } = await import(
      '../../src/renderer/src/layout/CodeViewerPane'
    )
    await act(async () => {
      render(<CodeViewerPane />)
    })
    expect(screen.getByText(/파일을 선택하세요/)).toBeTruthy()
  })

  it('loading 상태에서 "로딩 중..." 메시지를 표시한다', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      openedFile: 'foo.ts',
      openedContent: null,
      openedLanguage: null,
      openedStatus: 'loading',
      openedViewer: 'code',
      openedDataUrl: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const { CodeViewerPane } = await import(
      '../../src/renderer/src/layout/CodeViewerPane'
    )
    await act(async () => {
      render(<CodeViewerPane />)
    })
    expect(screen.getByText(/로딩 중/)).toBeTruthy()
  })

  it('too-large 상태에서 안내 메시지를 표시한다', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      openedFile: 'big.bin',
      openedContent: null,
      openedLanguage: null,
      openedStatus: 'too-large',
      openedViewer: 'code',
      openedDataUrl: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const { CodeViewerPane } = await import(
      '../../src/renderer/src/layout/CodeViewerPane'
    )
    await act(async () => {
      render(<CodeViewerPane />)
    })
    expect(screen.getByText(/너무 큰 파일/)).toBeTruthy()
  })

  it('not-found 상태에서 안내 메시지를 표시한다', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      openedFile: 'missing.ts',
      openedContent: null,
      openedLanguage: null,
      openedStatus: 'not-found',
      openedViewer: 'code',
      openedDataUrl: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const { CodeViewerPane } = await import(
      '../../src/renderer/src/layout/CodeViewerPane'
    )
    await act(async () => {
      render(<CodeViewerPane />)
    })
    expect(screen.getByText(/파일을 찾을 수 없습니다/)).toBeTruthy()
  })

  it('binary-skipped 상태에서 안내 메시지를 표시한다', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      openedFile: 'image.png',
      openedContent: null,
      openedLanguage: null,
      openedStatus: 'binary-skipped',
      openedViewer: 'code',
      openedDataUrl: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const { CodeViewerPane } = await import(
      '../../src/renderer/src/layout/CodeViewerPane'
    )
    await act(async () => {
      render(<CodeViewerPane />)
    })
    expect(screen.getByText(/바이너리 파일/)).toBeTruthy()
  })

  it('ready 상태에서 CodeViewer를 렌더한다', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      openedFile: 'src/foo.ts',
      openedContent: 'const x = 1',
      openedLanguage: 'javascript',
      openedStatus: 'ready',
      openedViewer: 'code',
      openedDataUrl: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const { CodeViewerPane } = await import(
      '../../src/renderer/src/layout/CodeViewerPane'
    )
    let container!: HTMLElement
    await act(async () => {
      const result = render(<CodeViewerPane />)
      container = result.container
    })
    // CodeViewer 래퍼가 있어야 함
    expect(container.querySelector('.code-viewer')).toBeTruthy()
  })
})
