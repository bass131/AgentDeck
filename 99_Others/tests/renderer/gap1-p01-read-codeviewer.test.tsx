// @vitest-environment jsdom
/**
 * gap1-p01-read-codeviewer.test.tsx — GAP1 P01(a) Read 도구 결과 → CodeViewer 재사용.
 *
 * TDD RED: ToolCallCard의 read 분기가 문자열 코드 결과를 CodeMirror 6 CodeViewer로
 * 렌더해야 한다(구문강조 승격). 판별 실패(비-문자열 result·error 상태)는 기존 무강조
 * <pre> 폴백을 유지해야 한다(렌더 깨짐 0).
 *
 * CodeMirror 실 엔진은 jsdom에서 완전 동작 불가 → codeviewer.test.tsx와 동일한 모킹
 * 패턴을 재사용해 `.code-viewer`/`.cm-editor` 마운트 여부만 구조 단언한다.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import type { ToolCard } from '../../../02.Source/renderer/src/store/reducer'

afterEach(() => cleanup())

// darcula.ts 전체 mock — @lezer/highlight tags 복잡성 우회 (codeviewer.test.tsx와 동일)
import { vi } from 'vitest'

vi.mock('../../../02.Source/renderer/src/theme/darcula', () => ({
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

vi.mock('@codemirror/lang-javascript', () => ({ javascript: vi.fn(() => ({})) }))
vi.mock('@codemirror/lang-python', () => ({ python: vi.fn(() => ({})) }))
vi.mock('@codemirror/lang-json', () => ({ json: vi.fn(() => ({})) }))
vi.mock('@codemirror/lang-markdown', () => ({ markdown: vi.fn(() => ({})) }))
vi.mock('@codemirror/lang-html', () => ({ html: vi.fn(() => ({})) }))
vi.mock('@codemirror/lang-css', () => ({ css: vi.fn(() => ({})) }))

const card = (over: Partial<ToolCard>): ToolCard => ({
  id: 't1',
  name: 'Read',
  input: { file_path: 'src/a.ts' },
  status: 'done',
  result: 'const x = 1\nconst y = 2\n',
  ...over,
})

describe('ToolCallCard — Read → CodeViewer 재사용 (GAP1 P01a)', () => {
  it('read 도구 + 문자열 결과 → 펼치면 CodeViewer(.code-viewer) 마운트', async () => {
    const { ToolCallCard } = await import('../../../02.Source/renderer/src/components/01_conversation/ToolCallCard')
    const { container } = render(<ToolCallCard card={card({})} />)
    fireEvent.click(container.querySelector('.t-row')!)
    expect(container.querySelector('.code-viewer')).toBeTruthy()
    expect(container.querySelector('.cm-editor')).toBeTruthy()
  })

  it('read + 문자열 결과 → 기존 무강조 bo-res <pre>는 더 이상 렌더되지 않는다', async () => {
    const { ToolCallCard } = await import('../../../02.Source/renderer/src/components/01_conversation/ToolCallCard')
    const { container } = render(<ToolCallCard card={card({})} />)
    fireEvent.click(container.querySelector('.t-row')!)
    expect(container.querySelector('pre.bo-res')).toBeFalsy()
  })

  it('read + error 상태 → CodeViewer 미사용(기존 pre 폴백 유지, 렌더 깨짐 0)', async () => {
    const { ToolCallCard } = await import('../../../02.Source/renderer/src/components/01_conversation/ToolCallCard')
    const { container } = render(
      <ToolCallCard card={card({ status: 'error', result: 'Error: file not found' })} />
    )
    fireEvent.click(container.querySelector('.t-row')!)
    expect(container.querySelector('.code-viewer')).toBeFalsy()
    expect(container.querySelector('pre.bo-res')).toBeTruthy()
  })

  it('read + 비-문자열 결과(객체) → 판별 실패 → 기존 JSON pre 폴백 유지', async () => {
    const { ToolCallCard } = await import('../../../02.Source/renderer/src/components/01_conversation/ToolCallCard')
    const { container } = render(
      <ToolCallCard card={card({ result: { note: 'not a string' } as unknown as string })} />
    )
    fireEvent.click(container.querySelector('.t-row')!)
    expect(container.querySelector('.code-viewer')).toBeFalsy()
    expect(container.querySelector('pre.bo-res')).toBeTruthy()
  })

  it('Write/Edit 등 read 이외 도구는 CodeViewer 재사용 대상이 아니다(회귀 0)', async () => {
    const { ToolCallCard } = await import('../../../02.Source/renderer/src/components/01_conversation/ToolCallCard')
    const { container } = render(
      <ToolCallCard card={card({ name: 'Edit', input: { file_path: 'src/a.ts' }, result: 'const x = 1' })} />
    )
    fireEvent.click(container.querySelector('.t-row')!)
    expect(container.querySelector('.code-viewer')).toBeFalsy()
    expect(container.querySelector('pre.bo-res')).toBeTruthy()
  })
})
