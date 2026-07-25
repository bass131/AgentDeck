// @vitest-environment jsdom
/**
 * gap1-p15-r2-a-codeviewer-line-scroll.test.tsx — GAP1 P15 R2-A: CodeViewer line prop
 * → 지정 라인 스크롤 RED (TDD 선행). 자매 파일 gap1-p15-r2-a-click-to-line.test.tsx의
 * (SearchResultView 클릭 → store openedLine → FileModal line prop) 사슬의 마지막 마디.
 *
 * 대상(R only — 구현은 renderer Worker 몫):
 *   02.Source/renderer/src/components/03_viewer/CodeViewer.tsx
 *     — CodeViewerProps에 additive optional `line?: number`(1-based).
 *
 * 계약(interface-of-record — 구현이 여기에 맞춘다):
 *   · line 제공 + 1 <= line <= view.state.doc.lines →
 *     EditorView.scrollIntoView(view.state.doc.line(line).from, ...) effect를 생성해
 *     뷰에 전달한다. 전달 채널은 둘 다 허용: 생성 옵션(scrollTo) 또는 dispatch({effects}).
 *     스크롤 옵션(y:'center' 등)·라인 하이라이트는 자유(과장 금지 — 스펙은 위치만 고정).
 *   · 범위 밖 line(0 이하·doc.lines 초과) → 스크롤 시도 없음 + 크래시 0(방어).
 *     (실제 CM6 doc.line은 범위 밖에서 RangeError throw — mock도 동일하게 throw해
 *      가드 없는 구현은 크래시로 정직하게 잡힌다.)
 *   · line 미전달 → 스크롤 시도 없음(기존 거동 핀).
 *
 * 테스트 기법: CodeMirror는 jsdom에서 완전 동작 불가 → 기존 관례(codeviewer.test.tsx)대로
 * 패키지 mock. 이 파일의 mock은 scrollIntoView 호출·effect 전달 경로를 계측(instrument)한다.
 * mock doc 좌표계: line n의 시작 오프셋 = (n-1)*100, 총 100라인 — 위치 단언의 정답표.
 *
 * TDD 상태: RED 1건(line → scrollIntoView 위치+전달). 나머지 2건은 GREEN 회귀 핀.
 *
 * 구현 전 타입 다리(P07/P08 선례): line prop은 아직 CodeViewerProps에 없어 cast로 주입.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import type { ComponentType } from 'react'

// ── window.api mock (codeviewer.test.tsx 선례 미러) ─────────────────────────────
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

// darcula 전체 mock — @lezer/highlight 복잡성 우회(기존 관례).
vi.mock('../../../02.Source/renderer/src/theme/darcula', () => ({
  darculaTheme: {},
  darculaHighlighting: {},
  darculaHighlightStyle: {},
}))

/** mock doc 좌표계 상수 — 아래 두 factory와 테스트 단언이 공유하는 정답표. */
const DOC_LINES = 100
const LINE_STRIDE = 100 // line n 시작 오프셋 = (n-1)*LINE_STRIDE

// CodeMirror view mock — scrollIntoView·dispatch·생성 옵션을 계측.
vi.mock('@codemirror/view', () => {
  const dispatched: Array<Record<string, unknown>> = []
  const constructed: Array<Record<string, unknown>> = []
  // 실제 CM6과 동형: EditorView.scrollIntoView(pos, opts) → StateEffect(불투명 객체).
  const scrollSpy = vi.fn((pos: number, opts?: unknown) => ({ __scrollEffect: true, pos, opts }))

  class MockEditorView {
    static theme(_spec: unknown, _opts?: unknown) {
      return {}
    }
    static decorations = { from: vi.fn(() => ({})) }
    static scrollIntoView = scrollSpy
    /** 테스트 계측 훅(실 CM6엔 없음) */
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

// CodeMirror state mock — EditorState.create가 mock doc을 실은 state를 반환
// (구현이 view.state.doc.line(n).from으로 위치를 계산할 수 있게).
vi.mock('@codemirror/state', () => {
  const mockDoc = {
    lines: 100, // = DOC_LINES (factory 호이스팅 제약으로 리터럴 중복 — 정답표는 상단 상수)
    lineAt: vi.fn(() => ({ number: 1, from: 0 })),
    line: vi.fn((n: number) => {
      // 실제 CM6 Text.line과 동형: 범위 밖은 RangeError throw.
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
import { CodeViewer, type CodeViewerProps } from '../../../02.Source/renderer/src/components/03_viewer/CodeViewer'

// ── 구현 전 타입 다리: line prop은 아직 CodeViewerProps에 없다 ────────────────────
const CodeViewerWithLine = CodeViewer as unknown as ComponentType<
  CodeViewerProps & { line?: number }
>

// mock 계측 접근자(실 EditorView 타입엔 없는 훅 — cast 경유).
const EV = EditorView as unknown as {
  scrollIntoView: ReturnType<typeof vi.fn>
  __dispatched: Array<Record<string, unknown>>
  __constructed: Array<Record<string, unknown>>
}

/**
 * scrollIntoView가 만든 effect(pos 일치)가 뷰에 실제 전달됐는지 —
 * 생성 옵션(scrollTo)·dispatch({effects}) 두 채널 모두 수용(구현 자유도).
 */
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

/** DOC_LINES(100)행짜리 고정 content — 어떤 라인 계산 방식이든 mock doc과 행수 일치. */
const CONTENT = Array.from({ length: DOC_LINES }, (_, i) => `line ${i + 1}`).join('\n')

beforeEach(() => {
  vi.clearAllMocks()
  EV.__dispatched.length = 0
  EV.__constructed.length = 0
})

afterEach(() => {
  cleanup()
})

// ── 테스트 ──────────────────────────────────────────────────────────────────────

describe('GAP1 P15 R2-A — CodeViewer line prop → 지정 라인 스크롤 (RED)', () => {
  it('line=42 → EditorView.scrollIntoView(doc.line(42).from) 생성 + 뷰에 전달', async () => {
    await act(async () => {
      render(<CodeViewerWithLine content={CONTENT} language="typescript" line={42} />)
    })

    // RED: 현행 CodeViewer는 line prop을 모른다 — scrollIntoView 미호출.
    expect(EV.scrollIntoView).toHaveBeenCalled()
    const [pos] = EV.scrollIntoView.mock.calls[0] as [number, unknown?]
    expect(pos).toBe((42 - 1) * LINE_STRIDE) // mock doc 좌표계: line n 시작 = (n-1)*100
    // 생성만 하고 버리면 스크롤 안 됨 — effect가 뷰에 실제 전달돼야 한다.
    expect(scrollEffectDelivered((42 - 1) * LINE_STRIDE)).toBe(true)
  })

  it('범위 밖 line(doc.lines 초과) → 스크롤 시도 없음 + 크래시 0(방어 핀)', async () => {
    let container!: HTMLElement
    await act(async () => {
      container = render(
        <CodeViewerWithLine content={CONTENT} language="typescript" line={DOC_LINES + 899} />
      ).container
    })

    // 에디터는 정상 마운트(크래시 0 — 가드 없는 doc.line 호출은 RangeError로 여기서 잡힘).
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
