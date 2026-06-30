// @vitest-environment jsdom
/**
 * lsp-gap-fix.test.tsx — Phase 27 reviewer 갭 2건 TDD 테스트.
 *
 * 갭 1: hoverTooltip 확장이 EditorView extensions에 실제 포함되어야 함
 *   - buildHoverExtension 반환값이 버려지면 안 됨
 *   - EditorState.create 호출 시 extensions 배열에 hoverTooltip 반환 객체가 포함
 *   - status 'ready'일 때 핸들러가 lsp.hover 호출
 *   - status !== 'ready'일 때 핸들러가 lsp.hover 미호출
 *
 * 갭 2: F12가 document 전역 리스너가 아닌 EditorView 스코프 keymap/domEventHandlers로 등록
 *   - document.addEventListener 'keydown' 전역 등록 0
 *   - keymap.of 또는 EditorView.domEventHandlers 경유 등록
 *   - 정의 점프 openFile 호출 검증
 *   - 빈 결과 no-op
 *
 * TDD: RED(실패) 먼저 → GREEN(구현) 순서.
 * 신뢰경계: window.api.lsp.* mock만. fs/Node 직접 0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'

// ── EditorState.create 호출 추적용 ────────────────────────────────────────────

const capturedExtensions: unknown[][] = []
const mockDispatch = vi.fn()
let mockDestroyCount = 0

// EditorView.domEventHandlers 및 keymap 추적
const mockDomEventHandlers = vi.fn((handlers: unknown) => ({ _isDomEventHandlers: true, handlers }))
const mockKeymapOf = vi.fn((bindings: unknown[]) => ({ _isKeymap: true, bindings }))

// ── window.api mock ────────────────────────────────────────────────────────────

const mockLspStatus = vi.fn()
const mockLspHover = vi.fn()
const mockLspDefinition = vi.fn()
const mockLspSemanticTokens = vi.fn()
const mockLspCachedTokens = vi.fn()
const mockOpenFile = vi.fn()

const mockApi = {
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
  workspaceTree: vi.fn().mockResolvedValue({ tree: null }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'run-test' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(vi.fn()),
  fsDiff: vi.fn().mockResolvedValue({ filePath: '', lines: [] }),
  fsRead: vi.fn().mockResolvedValue({ kind: 'text', content: 'const x = 1', language: 'typescript' }),
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

// ── CodeMirror mock ────────────────────────────────────────────────────────────

vi.mock('@codemirror/state', () => {
  return {
    EditorState: {
      create: vi.fn((opts: { doc: string; extensions: unknown[] }) => {
        // extensions 캡처 — 갭1 검증용
        capturedExtensions.push([...(opts.extensions ?? [])])
        return {}
      }),
      readOnly: { of: vi.fn(() => ({ _readOnly: true })) },
    },
    Compartment: class {
      of(v: unknown) { return { _compartmentOf: v } }
      reconfigure(v: unknown) { return { _compartmentReconf: v } }
    },
    StateEffect: {
      define: vi.fn(() => ({
        of: vi.fn((v: unknown) => ({ _effect: true, value: v })),
      })),
    },
    StateField: {
      define: vi.fn((spec: unknown) => ({ _isStateField: true, spec })),
    },
  }
})

vi.mock('@codemirror/view', () => {
  class MockEditorView {
    static theme(_spec: unknown, _opts?: unknown) { return {} }
    static decorations = { from: vi.fn(() => ({})) }
    static domEventHandlers = mockDomEventHandlers
    constructor({ parent }: { parent: HTMLElement }) {
      const div = document.createElement('div')
      div.className = 'cm-editor'
      parent.appendChild(div)
    }
    destroy() { mockDestroyCount++ }
    dispatch = mockDispatch
    state = {
      doc: {
        line: vi.fn(() => ({ number: 1, from: 0, to: 10 })),
        lineAt: vi.fn(() => ({ number: 1, from: 0, to: 10 })),
        lines: 100,
      },
      selection: { main: { head: 5 } },
    }
  }
  return {
    EditorView: MockEditorView,
    lineNumbers: vi.fn(() => ({ _lineNumbers: true })),
    highlightActiveLine: vi.fn(() => ({})),
    keymap: { of: mockKeymapOf },
    drawSelection: vi.fn(() => ({})),
    dropCursor: vi.fn(() => ({})),
    rectangularSelection: vi.fn(() => ({})),
    crosshairCursor: vi.fn(() => ({})),
    highlightActiveLineGutter: vi.fn(() => ({})),
    highlightSpecialChars: vi.fn(() => ({})),
    hoverTooltip: vi.fn((_handler: unknown, _opts?: unknown) => ({
      _isHoverTooltip: true,
      handler: _handler,
    })),
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

vi.mock('../../../02.Source/renderer/src/theme/darcula', () => ({
  darculaTheme: {},
  darculaHighlighting: {},
  darculaHighlightStyle: {},
}))

// appStore mock — openFile store 액션 추적
vi.mock('../../../02.Source/renderer/src/store/appStore', () => ({
  useAppStore: vi.fn((selector: (s: { openFile: typeof mockOpenFile }) => unknown) =>
    selector({ openFile: mockOpenFile })
  ),
}))

// ── Setup/Teardown ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  capturedExtensions.length = 0
  mockDestroyCount = 0

  mockLspStatus.mockResolvedValue('ready')
  mockLspHover.mockResolvedValue(null)
  mockLspDefinition.mockResolvedValue([])
  mockLspSemanticTokens.mockResolvedValue(null)
  mockLspCachedTokens.mockResolvedValue(null)
  mockOpenFile.mockResolvedValue(undefined)

  mockApi.onAgentEvent.mockReturnValue(vi.fn())
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.conversationSave.mockResolvedValue({ id: 'cv-1' })
})

afterEach(() => {
  cleanup()
})

// ── 갭 1: hoverTooltip이 EditorView extensions에 실제 포함 ────────────────────

describe('갭 1: hoverTooltip 실장착 — EditorState.create extensions에 포함', () => {
  it('hoverTooltip 반환 객체가 EditorState.create extensions 배열에 포함된다', async () => {
    /**
     * RED: 현재 구현은 buildHoverExtension() 반환값을 버림 →
     *   EditorState.create extensions에 _isHoverTooltip 객체가 없음 → 실패.
     * GREEN: hoverTooltip 확장을 buildBaseExtensions에 포함하거나
     *   Compartment.reconfigure로 EditorView에 추가해야 통과.
     *
     * 검증: EditorState.create가 받은 extensions 중 _isHoverTooltip=true 항목이 1개 이상.
     */
    const { hoverTooltip } = await import('@codemirror/view')
    const { CodeViewer } = await import('../../../02.Source/renderer/src/components/03_viewer/CodeViewer')

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

    // status 'ready' 게이트 통과 대기
    await vi.waitFor(() => {
      expect(mockLspStatus).toHaveBeenCalledWith({ rootId: 'workspace', relPath: 'src/foo.ts' })
    })

    // hoverTooltip이 extensions에 포함됐는지 확인
    // EditorState.create로 전달된 extensions 중 _isHoverTooltip=true 객체가 있어야 함
    const allExtensions = capturedExtensions.flat(10)
    const hasHoverExtension = allExtensions.some(
      (ext) => ext !== null && typeof ext === 'object' && (ext as Record<string, unknown>)._isHoverTooltip === true
    )
    expect(hasHoverExtension).toBe(true)

    // hoverTooltip mock 자체도 호출됐는지 확인
    expect(hoverTooltip).toHaveBeenCalled()
  })

  it('status ready 시 hoverTooltip 핸들러가 lsp.hover를 호출한다', async () => {
    /**
     * RED: 현재 핸들러는 EditorView에 장착 안 됨 → 핸들러 직접 추출 불가.
     * GREEN: hoverTooltip 등록 후 핸들러를 호출 → lsp.hover IPC 호출.
     */
    mockLspStatus.mockResolvedValue('ready')
    mockLspHover.mockResolvedValue({ contents: '**string** type' })

    const { hoverTooltip } = await import('@codemirror/view')
    const { CodeViewer } = await import('../../../02.Source/renderer/src/components/03_viewer/CodeViewer')

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

    // hoverTooltip이 등록되어 핸들러를 가져올 수 있어야 함
    const calls = vi.mocked(hoverTooltip).mock.calls
    expect(calls.length).toBeGreaterThan(0)

    // 핸들러 직접 호출 — lsp.hover IPC 검증
    const handler = calls[0]?.[0] as ((view: unknown, pos: number) => Promise<unknown>) | undefined
    expect(handler).toBeDefined()
    if (!handler) return

    const mockView = {
      state: {
        doc: { lineAt: vi.fn(() => ({ number: 1, from: 0, to: 10 })) },
        selection: { main: { head: 5 } },
      },
    }
    const result = await handler(mockView, 5)
    expect(mockLspHover).toHaveBeenCalledWith({
      rootId: 'workspace',
      relPath: 'src/foo.ts',
      pos: expect.objectContaining({ line: 0 }),
    })
    expect(result).not.toBeNull()
  })

  it('status !== ready 일 때 핸들러가 lsp.hover를 호출하지 않는다', async () => {
    /**
     * 핸들러가 statusRef를 참조해 ready가 아니면 null 반환해야 함.
     * ref 기반 구현: 마운트 후 status 'starting' → 핸들러 호출 시 lsp.hover 미호출.
     */
    mockLspStatus.mockResolvedValue('starting')
    mockLspHover.mockResolvedValue({ contents: 'should not be called' })

    const { hoverTooltip } = await import('@codemirror/view')
    vi.mocked(hoverTooltip).mockClear()

    const { CodeViewer } = await import('../../../02.Source/renderer/src/components/03_viewer/CodeViewer')

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

    // status 'starting' → hoverTooltip 핸들러가 등록은 돼도 lsp.hover 미호출이어야 함
    // (핸들러가 statusRef.current !== 'ready' 확인 후 null 반환)
    // 핸들러가 있다면 직접 호출하여 lsp.hover 미호출 검증
    const calls = vi.mocked(hoverTooltip).mock.calls
    if (calls.length > 0) {
      const handler = calls[0]?.[0] as ((view: unknown, pos: number) => Promise<unknown>) | undefined
      if (handler) {
        const mockView = {
          state: {
            doc: { lineAt: vi.fn(() => ({ number: 1, from: 0 })) },
            selection: { main: { head: 5 } },
          },
        }
        const result = await handler(mockView, 5)
        // status 'starting' → null 반환, lsp.hover 미호출
        expect(result).toBeNull()
        expect(mockLspHover).not.toHaveBeenCalled()
      }
    }
  })

  it('hoverTooltip이 EditorView에 장착되어 (버려지지 않음) hover 응답 DOM을 생성한다', async () => {
    /**
     * 핵심 구조 검증: hoverTooltip 반환 Extension이 EditorState.create에 포함되거나
     * EditorView에 장착되어야 함. 버려진다면 extensions에 없음.
     */
    mockLspHover.mockResolvedValue({ contents: '```ts\nstring\n```' })
    mockLspStatus.mockResolvedValue('ready')

    const { hoverTooltip } = await import('@codemirror/view')
    const { CodeViewer } = await import('../../../02.Source/renderer/src/components/03_viewer/CodeViewer')

    await act(async () => {
      render(
        <CodeViewer
          content="const x = 1"
          language="typescript"
          rootId="workspace"
          relPath="src/foo.ts"
        />
      )
    })

    await vi.waitFor(() => expect(mockLspStatus).toHaveBeenCalled())

    // hoverTooltip이 1회 이상 호출되어 핸들러가 등록됐어야 함
    expect(vi.mocked(hoverTooltip).mock.calls.length).toBeGreaterThan(0)

    // 등록된 핸들러가 마크다운 응답 시 DOM 객체를 반환해야 함
    const handler = vi.mocked(hoverTooltip).mock.calls[0]?.[0] as
      | ((view: unknown, pos: number) => Promise<{ pos: number; create: () => { dom: HTMLElement } } | null>)
      | undefined

    if (handler) {
      const mockView = {
        state: {
          doc: { lineAt: vi.fn(() => ({ number: 1, from: 0 })) },
          selection: { main: { head: 3 } },
        },
      }
      const tooltip = await handler(mockView, 3)
      expect(tooltip).not.toBeNull()
      if (tooltip) {
        const { dom } = tooltip.create()
        expect(dom).toBeInstanceOf(HTMLElement)
        expect(dom.className).toBe('lsp-hover-card')
      }
    }
  })
})

// ── 갭 2: F12가 document 전역 리스너가 아닌 EditorView 스코프 ────────────────

describe('갭 2: F12 스코핑 — document 전역 리스너 아닌 EditorView keymap/domEventHandlers', () => {
  it('document.addEventListener keydown 전역 등록이 없어야 한다', async () => {
    /**
     * RED: 현재 구현은 document.addEventListener('keydown', handleF12) 전역 등록 →
     *   포커스 무관 발화 + 중복 등록 가능.
     * GREEN: EditorView keymap 또는 domEventHandlers로 등록해야 전역 리스너 0.
     */
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener')

    const { CodeViewer } = await import('../../../02.Source/renderer/src/components/03_viewer/CodeViewer')

    await act(async () => {
      render(
        <CodeViewer
          content="const x = 1"
          language="typescript"
          rootId="workspace"
          relPath="src/foo.ts"
        />
      )
    })

    await vi.waitFor(() => expect(mockLspStatus).toHaveBeenCalled())

    // document.addEventListener에 'keydown' 리스너 등록이 없어야 함
    const keydownCalls = addEventListenerSpy.mock.calls.filter(
      ([event]) => event === 'keydown'
    )
    expect(keydownCalls).toHaveLength(0)

    addEventListenerSpy.mockRestore()
  })

  it('F12 keymap이 EditorView keymap.of 또는 EditorView.domEventHandlers 경유로 등록된다', async () => {
    /**
     * GREEN: keymap.of([{key:'F12', run:...}]) 또는 EditorView.domEventHandlers({keydown})
     *   로 등록해야 에디터 스코프에서만 발화.
     * 검증: keymap.of 호출 시 F12 바인딩이 포함되거나 domEventHandlers keydown 등록.
     */
    const { CodeViewer } = await import('../../../02.Source/renderer/src/components/03_viewer/CodeViewer')

    await act(async () => {
      render(
        <CodeViewer
          content="const x = 1"
          language="typescript"
          rootId="workspace"
          relPath="src/foo.ts"
        />
      )
    })

    await vi.waitFor(() => expect(mockLspStatus).toHaveBeenCalled())

    // keymap.of 호출 중 F12 키 바인딩이 있는지 확인
    const keymapCalls = mockKeymapOf.mock.calls
    const hasF12Keymap = keymapCalls.some((args) => {
      const bindings = args[0] as Array<{ key?: string; run?: unknown }>
      return Array.isArray(bindings) && bindings.some((b) => b.key === 'F12')
    })

    // domEventHandlers 경유 확인
    const domHandlerCalls = mockDomEventHandlers.mock.calls
    const hasDomKeydown = domHandlerCalls.some((args) => {
      const handlers = args[0] as Record<string, unknown>
      return handlers && 'keydown' in handlers
    })

    // 둘 중 하나는 반드시 있어야 함 (EditorView 스코프 F12 등록)
    expect(hasF12Keymap || hasDomKeydown).toBe(true)
  })

  it('F12 발화 시 lsp.definition을 호출하고 결과 있으면 openFile을 호출한다', async () => {
    /**
     * keymap.of F12 run 함수 또는 domEventHandlers keydown 핸들러에서
     * lsp.definition → openFile(relPath, rootId) 호출 검증.
     */
    mockLspDefinition.mockResolvedValue([
      { relPath: 'src/utils.ts', line: 10, character: 3 },
    ])
    mockLspStatus.mockResolvedValue('ready')

    const { CodeViewer } = await import('../../../02.Source/renderer/src/components/03_viewer/CodeViewer')

    await act(async () => {
      render(
        <CodeViewer
          content="const x = 1"
          language="typescript"
          rootId="workspace"
          relPath="src/foo.ts"
        />
      )
    })

    await vi.waitFor(() => expect(mockLspStatus).toHaveBeenCalled())

    // F12 keymap run 함수를 찾아 직접 실행
    const keymapCalls = mockKeymapOf.mock.calls
    let f12RunFn: ((view: unknown) => boolean) | undefined

    for (const args of keymapCalls) {
      const bindings = args[0] as Array<{ key?: string; run?: (view: unknown) => boolean }>
      if (!Array.isArray(bindings)) continue
      const f12 = bindings.find((b) => b.key === 'F12')
      if (f12?.run) {
        f12RunFn = f12.run
        break
      }
    }

    // domEventHandlers keydown 폴백 확인
    let domKeydownFn: ((e: KeyboardEvent, view: unknown) => void) | undefined
    if (!f12RunFn) {
      for (const args of mockDomEventHandlers.mock.calls) {
        const handlers = args[0] as Record<string, unknown>
        if (handlers?.keydown) {
          domKeydownFn = handlers.keydown as (e: KeyboardEvent, view: unknown) => void
          break
        }
      }
    }

    expect(f12RunFn ?? domKeydownFn).toBeDefined()

    if (f12RunFn) {
      // keymap run 함수에 view mock 전달
      const mockView = {
        state: {
          selection: { main: { head: 5 } },
          doc: { lineAt: vi.fn(() => ({ number: 1, from: 0 })) },
        },
      }
      f12RunFn(mockView)
    } else if (domKeydownFn) {
      // domEventHandlers keydown에 F12 이벤트 전달
      const e = new KeyboardEvent('keydown', { key: 'F12' })
      const mockView = {
        state: {
          selection: { main: { head: 5 } },
          doc: { lineAt: vi.fn(() => ({ number: 1, from: 0 })) },
        },
      }
      domKeydownFn(e, mockView)
    }

    // lsp.definition 호출 대기 + openFile 검증
    await vi.waitFor(() => {
      expect(mockLspDefinition).toHaveBeenCalled()
    })
    await vi.waitFor(() => {
      expect(mockOpenFile).toHaveBeenCalledWith('src/utils.ts', 'workspace')
    })
  })

  it('F12 발화 시 lsp.definition 빈 결과 → openFile 미호출 (no-op)', async () => {
    mockLspDefinition.mockResolvedValue([])
    mockLspStatus.mockResolvedValue('ready')

    const { CodeViewer } = await import('../../../02.Source/renderer/src/components/03_viewer/CodeViewer')

    await act(async () => {
      render(
        <CodeViewer
          content="const x = 1"
          language="typescript"
          rootId="workspace"
          relPath="src/foo.ts"
        />
      )
    })

    await vi.waitFor(() => expect(mockLspStatus).toHaveBeenCalled())

    // F12 keymap run 함수 실행
    const keymapCalls = mockKeymapOf.mock.calls
    let f12RunFn: ((view: unknown) => boolean) | undefined
    for (const args of keymapCalls) {
      const bindings = args[0] as Array<{ key?: string; run?: (view: unknown) => boolean }>
      if (!Array.isArray(bindings)) continue
      const f12 = bindings.find((b) => b.key === 'F12')
      if (f12?.run) { f12RunFn = f12.run; break }
    }

    let domKeydownFn: ((e: KeyboardEvent, view: unknown) => void) | undefined
    if (!f12RunFn) {
      for (const args of mockDomEventHandlers.mock.calls) {
        const handlers = args[0] as Record<string, unknown>
        if (handlers?.keydown) {
          domKeydownFn = handlers.keydown as (e: KeyboardEvent, view: unknown) => void
          break
        }
      }
    }

    if (f12RunFn) {
      const mockView = {
        state: {
          selection: { main: { head: 5 } },
          doc: { lineAt: vi.fn(() => ({ number: 1, from: 0 })) },
        },
      }
      f12RunFn(mockView)
    } else if (domKeydownFn) {
      const e = new KeyboardEvent('keydown', { key: 'F12' })
      const mockView = {
        state: {
          selection: { main: { head: 5 } },
          doc: { lineAt: vi.fn(() => ({ number: 1, from: 0 })) },
        },
      }
      domKeydownFn(e, mockView)
    }

    await vi.waitFor(() => expect(mockLspDefinition).toHaveBeenCalled())
    // 빈 결과 → openFile 미호출
    await new Promise((r) => setTimeout(r, 30))
    expect(mockOpenFile).not.toHaveBeenCalled()
  })

  it('두 CodeViewer 동시 마운트 시 document keydown 리스너 중복 없음', async () => {
    /**
     * 전역 document.addEventListener 사용 시 2개 마운트 → 리스너 2개 등록.
     * EditorView 스코프 keymap이면 각자 에디터에만 존재 → 전역 등록 0.
     */
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener')

    const { CodeViewer } = await import('../../../02.Source/renderer/src/components/03_viewer/CodeViewer')

    await act(async () => {
      render(
        <>
          <CodeViewer content="const a = 1" language="typescript" rootId="ws1" relPath="a.ts" />
          <CodeViewer content="const b = 2" language="typescript" rootId="ws2" relPath="b.ts" />
        </>
      )
    })

    await vi.waitFor(() => expect(mockLspStatus).toHaveBeenCalled())

    const keydownCalls = addEventListenerSpy.mock.calls.filter(
      ([event]) => event === 'keydown'
    )
    // 전역 document keydown 등록이 0이어야 함
    expect(keydownCalls).toHaveLength(0)

    addEventListenerSpy.mockRestore()
  })
})

// ── 회귀: 기존 동작 유지 ──────────────────────────────────────────────────────

describe('회귀: 갭 수정 후에도 기존 동작 유지', () => {
  it('rootId 없으면 LSP 비활성 (하위호환)', async () => {
    const { CodeViewer } = await import('../../../02.Source/renderer/src/components/03_viewer/CodeViewer')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<CodeViewer content="const x = 1" language="typescript" />)
      container = result.container
    })

    expect(container.querySelector('.cm-editor')).toBeTruthy()
    expect(mockLspStatus).not.toHaveBeenCalled()
    expect(mockLspHover).not.toHaveBeenCalled()
  })

  it('status ready 시 시맨틱 토큰 dispatch 정상 동작', async () => {
    mockLspCachedTokens.mockResolvedValue({
      data: [0, 0, 3, 0, 0],
      types: ['variable'],
      mods: [],
    })
    mockLspSemanticTokens.mockResolvedValue(null)

    const { CodeViewer } = await import('../../../02.Source/renderer/src/components/03_viewer/CodeViewer')

    await act(async () => {
      render(
        <CodeViewer
          content="const x = 1"
          language="typescript"
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

  it('시맨틱 토큰 갱신 시 EditorView.destroy 미호출 (재생성 없음)', async () => {
    mockLspCachedTokens.mockResolvedValue({
      data: [0, 0, 3, 0, 0],
      types: ['variable'],
      mods: [],
    })

    const { CodeViewer } = await import('../../../02.Source/renderer/src/components/03_viewer/CodeViewer')

    await act(async () => {
      render(
        <CodeViewer
          content="const x = 1"
          language="typescript"
          rootId="workspace"
          relPath="src/foo.ts"
        />
      )
    })

    await vi.waitFor(() => expect(mockLspCachedTokens).toHaveBeenCalled())
    expect(mockDestroyCount).toBe(0)
  })
})
