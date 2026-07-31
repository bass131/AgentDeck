// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import type { ComponentType } from 'react'

const mockApi = {
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
  workspaceTree: vi.fn().mockResolvedValue({ tree: null }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'run-test' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(vi.fn()),
  fsDiff: vi.fn().mockResolvedValue({ filePath: '', lines: [] }),
  fsRead: vi.fn().mockResolvedValue({ kind: 'text', content: 'x', language: 'text' }),
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

vi.mock('../../../02_Source/renderer/src/theme/darcula', () => ({
  darculaTheme: {},
  darculaHighlighting: {},
  darculaHighlightStyle: {},
}))

const DOC_LINES = 100
const LINE_STRIDE = 100

vi.mock('@codemirror/view', () => {
  const dispatched: Array<Record<string, unknown>> = []
  const constructed: Array<Record<string, unknown>> = []
  const scrollSpy = vi.fn((pos: number, opts?: unknown) => ({ __scrollEffect: true, pos, opts }))

  class MockEditorView {
    static theme(_spec: unknown, _opts?: unknown) {
      return {}
    }
    static decorations = { from: vi.fn(() => ({})) }
    static scrollIntoView = scrollSpy
    static __dispatched = dispatched
    static __constructed = constructed

    state: Record<string, unknown> = {}

    constructor(cfg: { parent: HTMLElement; state?: unknown; [k: string]: unknown }) {
      constructed.push(cfg)
      const div = document.createElement('div')
      div.className = 'cm-editor'
      cfg.parent.appendChild(div)
      if (cfg.state) this.state = cfg.state as Record<string, unknown>
    }

    destroy(): void {}
    dispatch(spec: Record<string, unknown>): void {
      dispatched.push(spec)
    }
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

vi.mock('@codemirror/state', () => {
  const mockDoc = {
    lines: 100,
    lineAt: vi.fn(() => ({ number: 1, from: 0 })),
    line: vi.fn((n: number) => {
      if (!Number.isInteger(n) || n < 1 || n > 100) {
        throw new RangeError(`Invalid line number ${n}`)
      }
      return { number: n, from: (n - 1) * 100, to: (n - 1) * 100 + 99 }
    }),
  }
  return {
    EditorState: {
      create: vi.fn(() => ({ doc: mockDoc })),
      readOnly: { of: vi.fn(() => ({})) },
    },
    Compartment: class {
      of(v: unknown) {
        return v
      }
      reconfigure(v: unknown) {
        return v
      }
    },
    StateEffect: { define: vi.fn(() => ({ of: vi.fn(() => ({})) })) },
    StateField: { define: vi.fn((_spec: unknown) => ({ _isStateField: true })) },
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

import { EditorView } from '@codemirror/view'
import { CodeViewer, type CodeViewerProps } from '../../../02_Source/renderer/src/components/03_viewer/CodeViewer'

const CodeViewerWithLine = CodeViewer as unknown as ComponentType<
  CodeViewerProps & { line?: number }
>

const EV = EditorView as unknown as {
  scrollIntoView: ReturnType<typeof vi.fn>
  __dispatched: Array<Record<string, unknown>>
  __constructed: Array<Record<string, unknown>>
}

function scrollEffectDelivered(pos: number): boolean {
  const effects: Array<Record<string, unknown>> = []
  for (const cfg of EV.__constructed) {
    if (cfg.scrollTo) effects.push(cfg.scrollTo as Record<string, unknown>)
  }
  for (const spec of EV.__dispatched) {
    const e = spec.effects
    if (Array.isArray(e)) effects.push(...(e as Array<Record<string, unknown>>))
    else if (e) effects.push(e as Record<string, unknown>)
  }
  return effects.some((x) => x.__scrollEffect === true && x.pos === pos)
}

const CONTENT = Array.from({ length: DOC_LINES }, (_, i) => `line ${i + 1}`).join('\n')

beforeEach(() => {
  vi.clearAllMocks()
  EV.__dispatched.length = 0
  EV.__constructed.length = 0
})

afterEach(() => {
  cleanup()
})

describe('GAP1 P15 R2-A — CodeViewer line prop → 지정 라인 스크롤 (RED)', () => {
  it('line=42 → EditorView.scrollIntoView(doc.line(42).from) 생성 + 뷰에 전달', async () => {
    await act(async () => {
      render(<CodeViewerWithLine content={CONTENT} language="typescript" line={42} />)
    })

    expect(EV.scrollIntoView).toHaveBeenCalled()
    const [pos] = EV.scrollIntoView.mock.calls[0] as [number, unknown?]
    expect(pos).toBe((42 - 1) * LINE_STRIDE)
    expect(scrollEffectDelivered((42 - 1) * LINE_STRIDE)).toBe(true)
  })

  it('범위 밖 line(doc.lines 초과) → 스크롤 시도 없음 + 크래시 0(방어 핀)', async () => {
    let container!: HTMLElement
    await act(async () => {
      container = render(
        <CodeViewerWithLine content={CONTENT} language="typescript" line={DOC_LINES + 899} />
      ).container
    })

    expect(container.querySelector('.cm-editor')).toBeTruthy()
    expect(EV.scrollIntoView).not.toHaveBeenCalled()
  })

  it('line 미전달 → 스크롤 시도 없음(기존 거동 핀)', async () => {
    await act(async () => {
      render(<CodeViewerWithLine content={CONTENT} language="typescript" />)
    })

    expect(EV.scrollIntoView).not.toHaveBeenCalled()
  })
})
