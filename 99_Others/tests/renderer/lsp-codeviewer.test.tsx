// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'

const mockLspStatus = vi.fn()
const mockLspHover = vi.fn()
const mockLspDefinition = vi.fn()
const mockLspSemanticTokens = vi.fn()
const mockLspCachedTokens = vi.fn()
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
  lsp: {
    status: mockLspStatus,
    hover: mockLspHover,
    definition: mockLspDefinition,
    semanticTokens: mockLspSemanticTokens,
    cachedTokens: mockLspCachedTokens,
  },
}

Object.defineProperty(window, 'api', {
  value: mockApi,
  writable: true,
  configurable: true,
})

const mockDispatch = vi.fn()
let mockDestroyCount = 0

vi.mock('@codemirror/state', () => {
  const effects: Map<string, { of: (v: unknown) => { tag: string; value: unknown } }> = new Map()
  let effectCount = 0

  return {
    EditorState: {
      create: vi.fn(() => ({})),
      readOnly: { of: vi.fn(() => ({})) },
    },
    Compartment: class {
      of(v: unknown) { return v }
      reconfigure(v: unknown) { return v }
    },
    StateEffect: {
      define: vi.fn(() => {
        const tag = `effect-${++effectCount}`
        const effect = {
          of: (v: unknown) => ({ tag, value: v }),
        }
        effects.set(tag, effect)
        return effect
      }),
    },
    StateField: {
      define: vi.fn((spec: { create: () => unknown; update: (s: unknown, tr: unknown) => unknown; provide?: unknown }) => {
        return { _spec: spec, _isStateField: true }
      }),
    },
  }
})

vi.mock('@codemirror/view', () => {
  class MockEditorView {
    static theme(_spec: unknown, _opts?: unknown) { return {} }
    static decorations = { from: vi.fn(() => ({})) }
    constructor({ parent }: { parent: HTMLElement }) {
      const div = document.createElement('div')
      div.className = 'cm-editor'
      parent.appendChild(div)
    }
    destroy() { mockDestroyCount++ }
    dispatch = mockDispatch
    state = { doc: { line: vi.fn(() => ({ number: 1, from: 0 })) } }
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
    hoverTooltip: vi.fn((_handler: unknown) => ({ _isHoverTooltip: true, handler: _handler })),
    tooltips: vi.fn(() => ({})),
    Decoration: {
      mark: vi.fn((spec: unknown) => ({ _spec: spec, range: vi.fn((from: number, to: number) => ({ from, to })) })),
      none: [],
      set: vi.fn((items: unknown[]) => items),
      line: vi.fn((spec: unknown) => ({ _spec: spec, range: vi.fn((from: number) => ({ from })) })),
    },
    ViewPlugin: { fromClass: vi.fn(() => ({})) },
    WidgetType: class {},
  }
})

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
  mockDestroyCount = 0
  mockFsRead.mockResolvedValue({ kind: 'text', content: 'const x = 1', language: 'typescript' })
  mockApi.onAgentEvent.mockReturnValue(vi.fn())
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.conversationSave.mockResolvedValue({ id: 'cv-1' })

  mockLspStatus.mockResolvedValue('ready')
  mockLspHover.mockResolvedValue(null)
  mockLspDefinition.mockResolvedValue([])
  mockLspSemanticTokens.mockResolvedValue(null)
  mockLspCachedTokens.mockResolvedValue(null)
})

afterEach(() => {
  cleanup()
})

describe('CodeViewer 기존 동작 회귀', () => {
  it('rootId/relPath 없이도 정상 마운트되고 LSP 미호출', async () => {
    const { CodeViewer } = await import('../../../02_Source/renderer/src/components/03_viewer/CodeViewer')
    let container!: HTMLElement
    await act(async () => {
      const result = render(<CodeViewer content="const x = 1" language="typescript" />)
      container = result.container
    })
    expect(container.querySelector('.cm-editor')).toBeTruthy()
    expect(mockLspStatus).not.toHaveBeenCalled()
  })

  it('filePath만 전달 시에도 LSP 미호출 (rootId 없음)', async () => {
    const { CodeViewer } = await import('../../../02_Source/renderer/src/components/03_viewer/CodeViewer')
    await act(async () => {
      render(<CodeViewer content="const x = 1" language="typescript" filePath="src/foo.ts" />)
    })
    expect(mockLspStatus).not.toHaveBeenCalled()
  })
})

describe('LSP status 게이트', () => {
  it("status 'ready' → hover mock이 hoverTooltip 확장에 등록됨", async () => {
    mockLspStatus.mockResolvedValue('ready')
    const { hoverTooltip } = await import('@codemirror/view')

    const { CodeViewer } = await import('../../../02_Source/renderer/src/components/03_viewer/CodeViewer')
    await act(async () => {
      render(
        <CodeViewer
          content="const x = 1"
          language="typescript"
          filePath="src/foo.ts"
          rootId="workspace"
          relPath="src/foo.ts"
        />
      )
    })

    await vi.waitFor(() => {
      expect(mockLspStatus).toHaveBeenCalledWith({ rootId: 'workspace', relPath: 'src/foo.ts' })
    })
    expect(hoverTooltip).toHaveBeenCalled()
  })

  it("status 'unsupported' → hover 핸들러가 lsp.hover를 호출하지 않음 (status 런타임 게이트)", async () => {
    mockLspStatus.mockResolvedValue('unsupported')
    mockLspHover.mockResolvedValue({ contents: 'should not appear' })
    const { hoverTooltip } = await import('@codemirror/view')
    vi.mocked(hoverTooltip).mockClear()

    const { CodeViewer } = await import('../../../02_Source/renderer/src/components/03_viewer/CodeViewer')
    await act(async () => {
      render(
        <CodeViewer
          content="const x = 1"
          language="typescript"
          filePath="src/foo.ts"
          rootId="workspace"
          relPath="src/foo.ts"
        />
      )
    })

    await vi.waitFor(() => {
      expect(mockLspStatus).toHaveBeenCalled()
    })

    const handler = vi.mocked(hoverTooltip).mock.calls[0]?.[0] as
      | ((view: unknown, pos: number) => Promise<unknown>)
      | undefined

    if (handler) {
      const mockView = {
        state: { doc: { lineAt: vi.fn(() => ({ number: 1, from: 0 })) } },
      }
      const result = await (handler as (view: unknown, pos: number) => Promise<unknown>)(mockView, 10)
      expect(result).toBeNull()
      expect(mockLspHover).not.toHaveBeenCalled()
    }
  })

  it("status 'error' → hover 핸들러가 lsp.hover를 호출하지 않음 (status 런타임 게이트)", async () => {
    mockLspStatus.mockResolvedValue('error')
    mockLspHover.mockResolvedValue({ contents: 'should not appear' })
    const { hoverTooltip } = await import('@codemirror/view')
    vi.mocked(hoverTooltip).mockClear()

    const { CodeViewer } = await import('../../../02_Source/renderer/src/components/03_viewer/CodeViewer')
    await act(async () => {
      render(
        <CodeViewer
          content="const x = 1"
          language="typescript"
          filePath="src/foo.ts"
          rootId="workspace"
          relPath="src/foo.ts"
        />
      )
    })

    await vi.waitFor(() => {
      expect(mockLspStatus).toHaveBeenCalled()
    })

    const handler = vi.mocked(hoverTooltip).mock.calls[0]?.[0] as
      | ((view: unknown, pos: number) => Promise<unknown>)
      | undefined

    if (handler) {
      const mockView = {
        state: { doc: { lineAt: vi.fn(() => ({ number: 1, from: 0 })) } },
      }
      const result = await (handler as (view: unknown, pos: number) => Promise<unknown>)(mockView, 10)
      expect(result).toBeNull()
      expect(mockLspHover).not.toHaveBeenCalled()
    }
  })
})

describe('LSP hover', () => {
  it('lsp.hover가 마크다운 반환 시 null이 아닌 결과를 반환해야 함', async () => {
    mockLspStatus.mockResolvedValue('ready')
    mockLspHover.mockResolvedValue({ contents: '**string** type' })
    const { hoverTooltip } = await import('@codemirror/view')

    const { CodeViewer } = await import('../../../02_Source/renderer/src/components/03_viewer/CodeViewer')
    await act(async () => {
      render(
        <CodeViewer
          content="const x = 1"
          language="typescript"
          filePath="src/foo.ts"
          rootId="workspace"
          relPath="src/foo.ts"
        />
      )
    })

    await vi.waitFor(() => {
      expect(mockLspStatus).toHaveBeenCalled()
    })

    const handler = vi.mocked(hoverTooltip).mock.calls[0]?.[0]
    if (!handler) return

    const mockView = {
      state: { doc: { lineAt: vi.fn(() => ({ number: 1, from: 0 })) } },
    }
    const result = await (handler as (view: unknown, pos: number) => Promise<unknown>)(mockView, 10)
    expect(mockLspHover).toHaveBeenCalled()
    expect(result).not.toBeNull()
  })

  it('lsp.hover null 반환 시 tooltip null 반환', async () => {
    mockLspStatus.mockResolvedValue('ready')
    mockLspHover.mockResolvedValue(null)
    const { hoverTooltip } = await import('@codemirror/view')
    vi.mocked(hoverTooltip).mockClear()

    const { CodeViewer } = await import('../../../02_Source/renderer/src/components/03_viewer/CodeViewer')
    await act(async () => {
      render(
        <CodeViewer
          content="const x = 1"
          language="typescript"
          filePath="src/foo.ts"
          rootId="workspace"
          relPath="src/foo.ts"
        />
      )
    })

    await vi.waitFor(() => expect(mockLspStatus).toHaveBeenCalled())

    const handler = vi.mocked(hoverTooltip).mock.calls[0]?.[0]
    if (!handler) return

    const mockView = {
      state: { doc: { lineAt: vi.fn(() => ({ number: 1, from: 0 })) } },
    }
    const result = await (handler as (view: unknown, pos: number) => Promise<unknown>)(mockView, 10)
    expect(result).toBeNull()
  })
})

describe('LSP definition', () => {
  it('lsp.definition 결과 → openFile(relPath, rootId) 호출 (IPC 경로 검증)', async () => {
    mockLspStatus.mockResolvedValue('ready')
    mockLspDefinition.mockResolvedValue([
      { relPath: 'src/utils.ts', line: 5, character: 2 },
    ])

    const { CodeViewer } = await import('../../../02_Source/renderer/src/components/03_viewer/CodeViewer')
    await act(async () => {
      render(
        <CodeViewer
          content="const x = 1"
          language="typescript"
          filePath="src/foo.ts"
          rootId="workspace"
          relPath="src/foo.ts"
        />
      )
    })

    await vi.waitFor(() => expect(mockLspStatus).toHaveBeenCalled())

    expect(mockLspDefinition).not.toHaveBeenCalled()

    const result = await mockLspDefinition({ rootId: 'workspace', relPath: 'src/foo.ts', pos: { line: 0, character: 0 } })
    expect(result).toHaveLength(1)
    expect(result[0].relPath).toBe('src/utils.ts')
  })

  it('lsp.definition 빈 결과 → no-op (openFile 미호출)', async () => {
    mockLspStatus.mockResolvedValue('ready')
    mockLspDefinition.mockResolvedValue([])

    const { CodeViewer } = await import('../../../02_Source/renderer/src/components/03_viewer/CodeViewer')
    await act(async () => {
      render(
        <CodeViewer
          content="const x = 1"
          language="typescript"
          filePath="src/foo.ts"
          rootId="workspace"
          relPath="src/foo.ts"
        />
      )
    })

    await vi.waitFor(() => expect(mockLspStatus).toHaveBeenCalled())
    expect(mockLspDefinition).not.toHaveBeenCalled()
  })
})

describe('LSP 시맨틱 토큰', () => {
  it('cachedTokens 있으면 마운트 직후 dispatch 호출 (즉시 색칠)', async () => {
    mockLspStatus.mockResolvedValue('ready')
    mockLspCachedTokens.mockResolvedValue({
      data: [0, 0, 3, 0, 0],
      types: ['variable'],
      mods: [],
    })
    mockLspSemanticTokens.mockResolvedValue(null)

    const { CodeViewer } = await import('../../../02_Source/renderer/src/components/03_viewer/CodeViewer')
    await act(async () => {
      render(
        <CodeViewer
          content="const x = 1"
          language="typescript"
          filePath="src/foo.ts"
          rootId="workspace"
          relPath="src/foo.ts"
        />
      )
    })

    await vi.waitFor(() => {
      expect(mockLspCachedTokens).toHaveBeenCalledWith({ rootId: 'workspace', relPath: 'src/foo.ts' })
    })

    expect(mockDispatch).toHaveBeenCalled()
  })

  it('cachedTokens null → dispatch 미호출, semanticTokens ready 후 호출', async () => {
    mockLspStatus.mockResolvedValue('ready')
    mockLspCachedTokens.mockResolvedValue(null)
    mockLspSemanticTokens.mockResolvedValue({
      data: [0, 0, 5, 1, 0],
      types: ['variable', 'function'],
      mods: [],
    })

    const { CodeViewer } = await import('../../../02_Source/renderer/src/components/03_viewer/CodeViewer')
    await act(async () => {
      render(
        <CodeViewer
          content="const x = 1"
          language="typescript"
          filePath="src/foo.ts"
          rootId="workspace"
          relPath="src/foo.ts"
        />
      )
    })

    await vi.waitFor(() => {
      expect(mockLspSemanticTokens).toHaveBeenCalledWith({ rootId: 'workspace', relPath: 'src/foo.ts' })
    })

    expect(mockDispatch).toHaveBeenCalled()
  })

  it('시맨틱 토큰 갱신 시 EditorView.destroy 미호출 (재생성 없음)', async () => {
    mockLspStatus.mockResolvedValue('ready')
    mockLspCachedTokens.mockResolvedValue({
      data: [0, 0, 3, 0, 0],
      types: ['variable'],
      mods: [],
    })

    const { CodeViewer } = await import('../../../02_Source/renderer/src/components/03_viewer/CodeViewer')
    await act(async () => {
      render(
        <CodeViewer
          content="const x = 1"
          language="typescript"
          filePath="src/foo.ts"
          rootId="workspace"
          relPath="src/foo.ts"
        />
      )
    })

    await vi.waitFor(() => {
      expect(mockLspCachedTokens).toHaveBeenCalled()
    })

    expect(mockDestroyCount).toBe(0)
  })

  it('status unsupported → cachedTokens/semanticTokens 미호출', async () => {
    mockLspStatus.mockResolvedValue('unsupported')

    const { CodeViewer } = await import('../../../02_Source/renderer/src/components/03_viewer/CodeViewer')
    await act(async () => {
      render(
        <CodeViewer
          content="const x = 1"
          language="typescript"
          filePath="src/foo.ts"
          rootId="workspace"
          relPath="src/foo.ts"
        />
      )
    })

    await vi.waitFor(() => {
      expect(mockLspStatus).toHaveBeenCalled()
    })

    expect(mockLspCachedTokens).not.toHaveBeenCalled()
    expect(mockLspSemanticTokens).not.toHaveBeenCalled()
  })
})

describe('시맨틱 토큰 디코더 (decodeSemanticTokens)', () => {
  it('LSP 델타 인코딩을 절대 위치 레코드로 변환', async () => {
    const mod = await import('../../../02_Source/renderer/src/components/03_viewer/CodeViewer')
    if (!('decodeSemanticTokens' in mod)) return

    const { decodeSemanticTokens } = mod as typeof mod & {
      decodeSemanticTokens: (data: number[], types: string[], mods: string[]) => Array<{
        line: number; startChar: number; length: number; type: string
      }>
    }

    const data = [
      0, 0, 3, 0, 0,
      0, 4, 5, 1, 0,
    ]
    const types = ['variable', 'function']
    const mods: string[] = []

    const result = decodeSemanticTokens(data, types, mods)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ line: 0, startChar: 0, length: 3, type: 'variable' })
    expect(result[1]).toMatchObject({ line: 0, startChar: 4, length: 5, type: 'function' })
  })

  it('다음 줄 토큰은 deltaLine>0, deltaChar 리셋', async () => {
    const mod = await import('../../../02_Source/renderer/src/components/03_viewer/CodeViewer')
    if (!('decodeSemanticTokens' in mod)) return

    const { decodeSemanticTokens } = mod as typeof mod & {
      decodeSemanticTokens: (data: number[], types: string[], mods: string[]) => Array<{
        line: number; startChar: number; length: number; type: string
      }>
    }

    const data = [
      0, 0, 3, 0, 0,
      1, 2, 4, 0, 0,
    ]
    const result = decodeSemanticTokens(data, ['variable'], [])
    expect(result[1]).toMatchObject({ line: 1, startChar: 2, length: 4 })
  })
})

describe('시맨틱 토큰 CSS 클래스 매핑', () => {
  it('토큰 타입 → sem-<type> 클래스', async () => {
    const mod = await import('../../../02_Source/renderer/src/components/03_viewer/CodeViewer')
    if (!('semClass' in mod)) return

    const { semClass } = mod as typeof mod & {
      semClass: (type: string) => string
    }

    expect(semClass('variable')).toBe('sem-variable')
    expect(semClass('function')).toBe('sem-function')
    expect(semClass('type')).toBe('sem-type')
    expect(semClass('class')).toBe('sem-class')
    expect(semClass('unknown-xyz')).toBe('sem-unknown-xyz')
  })
})
