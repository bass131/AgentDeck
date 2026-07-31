// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup, screen, fireEvent } from '@testing-library/react'
import React from 'react'

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  const createPortal = vi.fn((node: React.ReactNode) => node)
  return {
    createPortal,
    flushSync: actual.flushSync,
    version: actual.version,
    default: { ...(actual as unknown as { default?: object }).default, createPortal },
  }
})

const mockApi = {
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
  workspaceTree: vi.fn().mockResolvedValue({ tree: null }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'run-test' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(vi.fn()),
  fsDiff: vi.fn().mockResolvedValue({ filePath: '', lines: [] }),
  fsRead: vi.fn().mockResolvedValue({ kind: 'text', content: '', language: 'text' }),
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
  lsp: {
    status: vi.fn().mockResolvedValue('unsupported'),
    hover: vi.fn().mockResolvedValue(null),
    definition: vi.fn().mockResolvedValue([]),
    semanticTokens: vi.fn().mockResolvedValue(null),
    cachedTokens: vi.fn().mockResolvedValue(null),
  },
}

Object.defineProperty(window, 'api', {
  value: mockApi,
  writable: true,
  configurable: true,
})

const mockWriteText = vi.fn().mockResolvedValue(undefined)
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockWriteText },
  writable: true,
  configurable: true,
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- mock에서 캡처한 CM6 updateListener 콜백. 선택 이벤트 시뮬레이션 테스트 확장 시 사용 예정(테스트 인프라 보존)
let selectionUpdateCallback: ((update: { selectionSet: boolean; state: { selection: { main: { from: number; to: number } } } }) => void) | null = null

vi.mock('@codemirror/view', () => {
  class MockEditorView {
    static theme(_spec: unknown, _opts?: unknown) { return {} }
    static decorations = { from: vi.fn(() => ({})) }
    static updateListener = {
      of: vi.fn((fn: (update: unknown) => void) => {
        selectionUpdateCallback = fn as typeof selectionUpdateCallback
        return { _isMockListener: true }
      })
    }
    constructor({ parent }: { parent: HTMLElement }) {
      const div = document.createElement('div')
      div.className = 'cm-editor'
      parent.appendChild(div)
    }
    destroy() {}
    dispatch() {}
    state = { doc: { lineAt: vi.fn(() => ({ number: 1, from: 0 })), line: vi.fn(() => ({ from: 0, to: 10 })), lines: 100 }, selection: { main: { from: 0, to: 0 } } }
    coordsAtPos(_pos: number) { return { top: 100, left: 200, right: 250, bottom: 116 } }
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

const mockSearchFn = vi.fn(() => ({ _isSearch: true }))
vi.mock('@codemirror/search', () => ({
  searchKeymap: [],
  highlightSelectionMatches: vi.fn(() => ({})),
  search: mockSearchFn,
  openSearchPanel: vi.fn(),
}))

vi.mock('@codemirror/lang-javascript', () => ({ javascript: vi.fn(() => ({})) }))
vi.mock('@codemirror/lang-python', () => ({ python: vi.fn(() => ({})) }))
vi.mock('@codemirror/lang-json', () => ({ json: vi.fn(() => ({})) }))
vi.mock('@codemirror/lang-markdown', () => ({ markdown: vi.fn(() => ({})) }))
vi.mock('@codemirror/lang-html', () => ({ html: vi.fn(() => ({})) }))
vi.mock('@codemirror/lang-css', () => ({ css: vi.fn(() => ({})) }))

vi.mock('../../../02_Source/renderer/src/theme/darcula', () => ({
  darculaTheme: {},
  darculaHighlighting: {},
  darculaHighlightStyle: {},
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.onAgentEvent.mockReturnValue(vi.fn())
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.conversationSave.mockResolvedValue({ id: 'cv-1' })
  selectionUpdateCallback = null
})

afterEach(() => {
  cleanup()
})

describe('W6a — CM6 search 확장', () => {
  it('buildBaseExtensions 호출 시 search() 확장이 포함된다', async () => {
    const { CodeViewer } = await import('../../../02_Source/renderer/src/components/03_viewer/CodeViewer')
    await act(async () => {
      render(<CodeViewer content="hello" language="javascript" />)
    })
    expect(mockSearchFn).toHaveBeenCalled()
  })
})

describe('W6b — SelectionAskBar', () => {
  it('CodeViewerProps에 onAskSelection prop이 있다', async () => {
    const mod = await import('../../../02_Source/renderer/src/components/03_viewer/CodeViewer')
    const onAskSelection = vi.fn()
    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <mod.CodeViewer
          content="const x = 1"
          language="javascript"
          filePath="src/foo.ts"
          onAskSelection={onAskSelection}
        />
      )
      container = result.container
    })
    expect(container.querySelector('.code-viewer')).toBeTruthy()
  })

  it('선택 텍스트가 있을 때 sel-bar가 표시된다', async () => {
    const { SelectionAskBar } = await import('../../../02_Source/renderer/src/components/03_viewer/SelectionAskBar')
    const onAsk = vi.fn()
    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <div id="root-el">
          <SelectionAskBar
            viewRef={{ current: null }}
            filePath="src/foo.ts"
            onAskSelection={onAsk}
          />
        </div>
      )
      container = result.container
    })
    expect(container.querySelector('[data-testid="sel-bar"]')).toBeNull()
  })

  it('선택이 있으면 sel-bar를 표시한다', async () => {
    const { SelectionAskBar } = await import('../../../02_Source/renderer/src/components/03_viewer/SelectionAskBar')
    const onAsk = vi.fn()

    const mockView = {
      state: {
        doc: {
          lineAt: (pos: number) => ({ number: pos === 10 ? 3 : 5, from: 0 }),
        },
        selection: { main: { from: 10, to: 50 } },
      },
      coordsAtPos: (_pos: number) => ({ top: 100, left: 200, right: 250, bottom: 116 }),
    }

    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <SelectionAskBar
          viewRef={{ current: mockView as unknown as import('@codemirror/view').EditorView }}
          filePath="src/foo.ts"
          onAskSelection={onAsk}
          _testSelection={{ from: 10, to: 50, text: 'const x = 1' }}
        />
      )
      container = result.container
    })
    expect(container.querySelector('[data-testid="sel-bar"]')).toBeTruthy()
  })

  it('선택이 비어있으면 sel-bar를 미표시한다', async () => {
    const { SelectionAskBar } = await import('../../../02_Source/renderer/src/components/03_viewer/SelectionAskBar')
    const onAsk = vi.fn()

    const mockView = {
      state: {
        doc: { lineAt: (_pos: number) => ({ number: 1, from: 0 }) },
        selection: { main: { from: 5, to: 5 } },
      },
      coordsAtPos: (_pos: number) => ({ top: 100, left: 200, right: 250, bottom: 116 }),
    }

    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <SelectionAskBar
          viewRef={{ current: mockView as unknown as import('@codemirror/view').EditorView }}
          filePath="src/foo.ts"
          onAskSelection={onAsk}
          _testSelection={null}
        />
      )
      container = result.container
    })
    expect(container.querySelector('[data-testid="sel-bar"]')).toBeNull()
  })

  it('"질문" 클릭 → onAskSelection이 path/text/fromLine/toLine과 함께 호출된다', async () => {
    const { SelectionAskBar } = await import('../../../02_Source/renderer/src/components/03_viewer/SelectionAskBar')
    const onAsk = vi.fn()

    const mockView = {
      state: {
        doc: {
          lineAt: (pos: number) => ({ number: pos === 10 ? 3 : 5, from: 0 }),
        },
        selection: { main: { from: 10, to: 50 } },
      },
      coordsAtPos: (_pos: number) => ({ top: 100, left: 200, right: 250, bottom: 116 }),
    }

    await act(async () => {
      render(
        <SelectionAskBar
          viewRef={{ current: mockView as unknown as import('@codemirror/view').EditorView }}
          filePath="src/foo.ts"
          onAskSelection={onAsk}
          _testSelection={{ from: 10, to: 50, text: 'const x = 1' }}
        />
      )
    })

    const btn = screen.getByText('Claude에게 질문')
    await act(async () => {
      fireEvent.click(btn)
    })

    expect(onAsk).toHaveBeenCalledOnce()
    const args = onAsk.mock.calls[0][0]
    expect(args).toMatchObject({
      path: 'src/foo.ts',
      text: 'const x = 1',
      fromLine: 3,
      toLine: 5,
    })
  })

  it('"복사" 클릭 → clipboard.writeText가 선택 텍스트로 호출된다', async () => {
    const { SelectionAskBar } = await import('../../../02_Source/renderer/src/components/03_viewer/SelectionAskBar')
    const onAsk = vi.fn()

    const mockView = {
      state: {
        doc: {
          lineAt: (_pos: number) => ({ number: 1, from: 0 }),
        },
        selection: { main: { from: 10, to: 50 } },
      },
      coordsAtPos: (_pos: number) => ({ top: 100, left: 200, right: 250, bottom: 116 }),
    }

    await act(async () => {
      render(
        <SelectionAskBar
          viewRef={{ current: mockView as unknown as import('@codemirror/view').EditorView }}
          filePath="src/foo.ts"
          onAskSelection={onAsk}
          _testSelection={{ from: 10, to: 50, text: 'selected code' }}
        />
      )
    })

    const btn = screen.getByText('복사')
    await act(async () => {
      fireEvent.click(btn)
    })

    expect(mockWriteText).toHaveBeenCalledWith('selected code')
  })
})

describe('W6b — injectedInput 형식', () => {
  it('buildAskPayload이 올바른 형식의 텍스트를 생성한다', async () => {
    const { buildAskPayload } = await import('../../../02_Source/renderer/src/components/03_viewer/SelectionAskBar')
    const result = buildAskPayload({
      path: 'src/foo.ts',
      text: 'const x = 1',
      fromLine: 3,
      toLine: 5,
    })
    expect(result).toContain('src/foo.ts:L3-L5')
    expect(result).toContain('const x = 1')
    expect(result).toContain('```')
  })

  it('fromLine이 null이면 파일경로만(라인 없이) 포함한다', async () => {
    const { buildAskPayload } = await import('../../../02_Source/renderer/src/components/03_viewer/SelectionAskBar')
    const result = buildAskPayload({
      path: 'src/bar.ts',
      text: 'hello',
      fromLine: null,
      toLine: null,
    })
    expect(result).toContain('src/bar.ts')
    expect(result).toContain('hello')
  })
})
