// @vitest-environment jsdom
/**
 * components.test.tsx — renderer 컴포넌트 렌더 스모크 + 상호작용 테스트.
 * window.api는 mock 주입. CSS 임포트는 vitest transform으로 무시됨.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

// ── darcula 테마 mock (CodeViewer가 Shell에 포함됨 — @lezer/highlight 우회) ──
vi.mock('../../src/renderer/src/theme/darcula', () => ({
  darculaTheme: {},
  darculaHighlighting: {},
  darculaHighlightStyle: {},
}))

// ── CodeMirror view mock (Shell → CodeViewerPane → CodeViewer 경유) ───────────
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
    state = { doc: { lineAt: vi.fn(() => ({ number: 1, from: 0 })), line: vi.fn(() => ({ from: 0, to: 10 })), lines: 100 } }
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
    hoverTooltip: vi.fn(() => ({})),
    Decoration: {
      mark: vi.fn(() => ({ range: vi.fn(() => ({ from: 0, to: 1 })) })),
      widget: vi.fn(), set: vi.fn(() => []), none: [],
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
  StateField: { define: vi.fn((_spec: unknown) => ({ _isStateField: true })) },
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

// ── window.api mock (모든 import 전에 설정) ───────────────────────────────────
const mockUnsubscribe = vi.fn()
const mockApi = {
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
  workspaceTree: vi.fn().mockResolvedValue({ tree: null }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'run-test' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(mockUnsubscribe),
  fsDiff: vi.fn().mockResolvedValue({ filePath: '', lines: [] }),
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
  // 윈도우 컨트롤(F1-b) — Shell이 TitleBar/ResizeHandles + useWindowState 포함.
  windowMinimize: vi.fn().mockResolvedValue(undefined),
  windowMaximizeToggle: vi.fn().mockResolvedValue({ maximized: false }),
  windowClose: vi.fn().mockResolvedValue(undefined),
  windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
  windowGetBounds: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1200, height: 800 }),
  windowSetBounds: vi.fn().mockResolvedValue(undefined),
  windowDragStart: vi.fn().mockResolvedValue(undefined),
  windowDragEnd: vi.fn().mockResolvedValue(undefined),
  windowResizeStart: vi.fn().mockResolvedValue(undefined),
  windowResizeEnd: vi.fn().mockResolvedValue(undefined),
  onWindowState: vi.fn().mockReturnValue(mockUnsubscribe),
}

Object.defineProperty(window, 'api', {
  value: mockApi,
  writable: true,
  configurable: true,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.workspaceOpen.mockResolvedValue({ rootPath: null, tree: null })
  mockApi.agentRun.mockResolvedValue({ runId: 'run-test' })
  mockApi.agentAbort.mockResolvedValue({ accepted: true })
  mockApi.onAgentEvent.mockReturnValue(mockUnsubscribe)
  mockApi.fsDiff.mockResolvedValue({ filePath: '', lines: [] })
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.conversationSave.mockResolvedValue({ id: 'cv-1' })
})

afterEach(() => {
  cleanup()
})

// ── DiffViewer (의존성 없음, 먼저 테스트) ──────────────────────────────────────
describe('DiffViewer', () => {
  it('빈 diff 목록에서 "변경 없음"을 표시한다', async () => {
    const { DiffViewer } = await import(
      '../../src/renderer/src/components/DiffViewer'
    )
    await act(async () => {
      render(<DiffViewer filePath="src/foo.ts" lines={[]} />)
    })
    expect(screen.getByText(/변경 없음/)).toBeTruthy()
  })

  it('add 라인에 diff-add 클래스, remove에 diff-del 클래스를 적용한다', async () => {
    const { DiffViewer } = await import(
      '../../src/renderer/src/components/DiffViewer'
    )
    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <DiffViewer
          filePath="src/foo.ts"
          lines={[
            { kind: 'add', content: '+ new line', lineNew: 1 },
            { kind: 'remove', content: '- old line', lineOld: 1 },
            { kind: 'context', content: '  ctx', lineOld: 2, lineNew: 2 },
          ]}
        />
      )
      container = result.container
    })
    expect(container.querySelector('.diff-add')).toBeTruthy()
    expect(container.querySelector('.diff-del')).toBeTruthy()
  })
})

// ── AgentPanel (상세는 agentpanel.test.tsx) ────────────────────────────────────
describe('AgentPanel', () => {
  it('헤더 + 상태 pill + 3섹션(F4)을 렌더한다', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({ isRunning: false, errorMessage: undefined, toolCards: [], changedFiles: new Set() })

    const { AgentPanel } = await import(
      '../../src/renderer/src/components/AgentPanel'
    )
    const { container } = await act(async () => render(<AgentPanel />))
    expect(container.querySelector('.ag-head .ag-pill')).toBeTruthy()
    expect(container.querySelectorAll('.ag-sec').length).toBe(3)
  })
})

// ── FileExplorer ───────────────────────────────────────────────────────────────
describe('FileExplorer', () => {
  it('트리 없을 때 .fe-blank(빈상태 카드)를 표시한다 (F15-01)', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({ fileTree: null, workspaceRoot: null })

    const { FileExplorer } = await import(
      '../../src/renderer/src/components/FileExplorer'
    )
    let container!: HTMLElement
    await act(async () => {
      const result = render(<FileExplorer />)
      container = result.container
    })
    expect(container.querySelector('.fe-blank')).toBeTruthy()
  })

  it('폴더 선택 버튼 클릭 시 workspaceOpen을 호출한다 (F15-01)', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({ fileTree: null, workspaceRoot: null })

    const { FileExplorer } = await import(
      '../../src/renderer/src/components/FileExplorer'
    )
    await act(async () => {
      render(<FileExplorer />)
    })
    const btn = screen.getByRole('button', { name: /폴더 선택/i })
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(mockApi.workspaceOpen).toHaveBeenCalledOnce()
  })
})

// ── Conversation ───────────────────────────────────────────────────────────────
describe('Conversation', () => {
  it('텍스트 입력창이 렌더된다', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({ isRunning: false, messages: [], streamingText: '', toolCards: [] })

    const { Conversation } = await import(
      '../../src/renderer/src/components/Conversation'
    )
    await act(async () => {
      render(<Conversation />)
    })
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('텍스트 입력 후 Enter 전송 시 agentRun을 호출한다', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({ isRunning: false, messages: [], streamingText: '', toolCards: [] })

    const { Conversation } = await import(
      '../../src/renderer/src/components/Conversation'
    )
    await act(async () => {
      render(<Conversation />)
    })
    const textarea = screen.getByRole('textbox')
    await act(async () => {
      fireEvent.change(textarea, { target: { value: '안녕하세요' } })
    })
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    })
    expect(mockApi.agentRun).toHaveBeenCalledOnce()
  })

  it('Shift+Enter는 전송하지 않는다', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({ isRunning: false, messages: [], streamingText: '', toolCards: [] })

    const { Conversation } = await import(
      '../../src/renderer/src/components/Conversation'
    )
    await act(async () => {
      render(<Conversation />)
    })
    const textarea = screen.getByRole('textbox')
    await act(async () => {
      fireEvent.change(textarea, { target: { value: '멀티라인' } })
    })
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    })
    expect(mockApi.agentRun).not.toHaveBeenCalled()
  })
})

// ── Shell ──────────────────────────────────────────────────────────────────────
describe('Shell', () => {
  it('플로팅 카드(.win) + 타이틀바(워크스페이스명) + 3-pane를 렌더한다', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      fileTree: null, workspaceRoot: null, isRunning: false,
      messages: [], streamingText: '', toolCards: [], changedFiles: new Set(),
      openedFile: null, openedContent: null, openedLanguage: null, openedStatus: 'idle',
    } as Parameters<typeof useAppStore.setState>[0])

    const { Shell } = await import('../../src/renderer/src/layout/Shell')
    const { container } = await act(async () => render(<Shell />))

    // 투명창 위 플로팅 카드
    expect(container.querySelector('.win')).toBeTruthy()
    // 타이틀바 컨트롤 버튼
    expect(screen.getByLabelText('최소화')).toBeTruthy()
    expect(screen.getByLabelText('닫기')).toBeTruthy()
    // 4컬럼: 사이드바 / 탐색기 / 대화 / 에이전트
    expect(container.querySelector('.win-body')).toBeTruthy()
    expect(container.querySelector('.sidebar')).toBeTruthy()
    expect(container.querySelector('.pane.explorer')).toBeTruthy()
    expect(container.querySelector('.pane.chat')).toBeTruthy()
    expect(container.querySelector('.pane.agent')).toBeTruthy()
    expect(container.querySelector('.pane.agent .ag-head')).toBeTruthy()
    // F15-02: pane-tab 제거 — .pane-tab 0개 단언
    expect(container.querySelectorAll('.pane-tab').length).toBe(0)
    // 대화 입력창(Conversation 항상 표시)
    expect(container.querySelector('.pane.chat textarea')).toBeTruthy()
  })

  it('사이드바/탐색기 접힘 토글: rail 전환', async () => {
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      fileTree: null, workspaceRoot: null, isRunning: false,
      messages: [], streamingText: '', toolCards: [], changedFiles: new Set(),
      openedFile: null, openedContent: null, openedLanguage: null, openedStatus: 'idle',
    } as Parameters<typeof useAppStore.setState>[0])

    const { Shell } = await import('../../src/renderer/src/layout/Shell')
    const { container } = await act(async () => render(<Shell />))

    // 초기: 사이드바 펼침
    expect(container.querySelector('.sidebar')).toBeTruthy()
    expect(container.querySelector('.col-rail')).toBeFalsy()
    // 접기 → rail
    await act(async () => {
      fireEvent.click(screen.getByLabelText('사이드바 접기'))
    })
    expect(container.querySelector('.sidebar')).toBeFalsy()
    expect(screen.getByLabelText('사이드바 펼치기')).toBeTruthy()
  })
})
