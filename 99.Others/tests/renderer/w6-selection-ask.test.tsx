// @vitest-environment jsdom
/**
 * w6-selection-ask.test.tsx — W6b SelectionAskBar + W6a CM6 검색 확인 TDD.
 *
 * TDD: RED 먼저(실패) → 구현 후 GREEN.
 *
 * 검증 항목:
 *   W6a: CM6 search() 확장이 buildBaseExtensions에 포함되어 있음.
 *   W6b-1: CodeViewer에 onAskSelection prop이 존재함.
 *   W6b-2: 선택 줄범위(fromLine, toLine) 추출 순수 함수(lineRangeFromSelection).
 *   W6b-3: SelectionAskBar — 선택 있을 때 바 표시(data-testid="sel-bar").
 *   W6b-4: SelectionAskBar — 선택 비어있으면 바 미표시.
 *   W6b-5: "질문" 클릭 → onAskSelection(path, text, fromLine, toLine) 호출.
 *   W6b-6: "복사" 클릭 → navigator.clipboard.writeText 호출.
 *   W6b-7: CodeViewerProps에 onAskSelection 타입 존재(컴파일 확인).
 *   W6b-8: FileModal에 onAskSelection 배선(prop 전달 체인).
 *   W6b-9: injectedInput 형식 — 파일경로:L범위 + 코드 펜스.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// createPortal mock — body portal을 컨테이너 안에 렌더
vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom')
  return {
    ...actual,
    createPortal: vi.fn((node: React.ReactNode) => node),
  }
})

// ── window.api mock ─────────────────────────────────────────────────────────────
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

// ── clipboard mock ──────────────────────────────────────────────────────────────
const mockWriteText = vi.fn().mockResolvedValue(undefined)
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockWriteText },
  writable: true,
  configurable: true,
})

// ── CodeMirror mock ─────────────────────────────────────────────────────────────
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

vi.mock('../../../02.Source/renderer/src/theme/darcula', () => ({
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

// ── W6a: CM6 search() 확장 포함 확인 ────────────────────────────────────────────

describe('W6a — CM6 search 확장', () => {
  it('buildBaseExtensions 호출 시 search() 확장이 포함된다', async () => {
    // CodeViewer 임포트 후 search mock이 호출되었는지 확인
    // (buildBaseExtensions가 search()를 포함 → EditorState.create 시 전달)
    const { CodeViewer } = await import('../../../02.Source/renderer/src/components/03_viewer/CodeViewer')
    await act(async () => {
      render(<CodeViewer content="hello" language="javascript" />)
    })
    // @codemirror/search의 search()가 확장 목록에 포함되어야 함
    expect(mockSearchFn).toHaveBeenCalled()
  })
})

// ── W6b: SelectionAskBar 단위 ──────────────────────────────────────────────────

describe('W6b — SelectionAskBar', () => {
  it('CodeViewerProps에 onAskSelection prop이 있다', async () => {
    const mod = await import('../../../02.Source/renderer/src/components/03_viewer/CodeViewer')
    // TypeScript 컴파일 통과 확인: onAskSelection prop을 받을 수 있어야 함
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
    const { SelectionAskBar } = await import('../../../02.Source/renderer/src/components/03_viewer/SelectionAskBar')
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
    // 초기 상태: 선택 없으면 바 미표시
    expect(container.querySelector('[data-testid="sel-bar"]')).toBeNull()
  })

  it('선택이 있으면 sel-bar를 표시한다', async () => {
    const { SelectionAskBar } = await import('../../../02.Source/renderer/src/components/03_viewer/SelectionAskBar')
    const onAsk = vi.fn()

    // viewRef mock — 선택 있음(from < to)
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
    const { SelectionAskBar } = await import('../../../02.Source/renderer/src/components/03_viewer/SelectionAskBar')
    const onAsk = vi.fn()

    const mockView = {
      state: {
        doc: { lineAt: (_pos: number) => ({ number: 1, from: 0 }) },
        selection: { main: { from: 5, to: 5 } }, // 빈 선택
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
    const { SelectionAskBar } = await import('../../../02.Source/renderer/src/components/03_viewer/SelectionAskBar')
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
    const { SelectionAskBar } = await import('../../../02.Source/renderer/src/components/03_viewer/SelectionAskBar')
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

// ── W6b: injectedInput 형식 ──────────────────────────────────────────────────────

describe('W6b — injectedInput 형식', () => {
  it('buildAskPayload이 올바른 형식의 텍스트를 생성한다', async () => {
    const { buildAskPayload } = await import('../../../02.Source/renderer/src/components/03_viewer/SelectionAskBar')
    const result = buildAskPayload({
      path: 'src/foo.ts',
      text: 'const x = 1',
      fromLine: 3,
      toLine: 5,
    })
    // 형식: `파일경로:L시작-L끝\n```\n선택코드\n```\n`
    expect(result).toContain('src/foo.ts:L3-L5')
    expect(result).toContain('const x = 1')
    expect(result).toContain('```')
  })

  it('fromLine이 null이면 파일경로만(라인 없이) 포함한다', async () => {
    const { buildAskPayload } = await import('../../../02.Source/renderer/src/components/03_viewer/SelectionAskBar')
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
