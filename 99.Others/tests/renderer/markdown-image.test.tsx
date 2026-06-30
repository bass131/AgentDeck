// @vitest-environment jsdom
/**
 * markdown-image.test.tsx — MarkdownView, ImagePreview 컴포넌트, store openFile 확장, CodeViewerPane 라우팅 테스트.
 *
 * TDD RED → GREEN.
 * 신뢰경계: renderer는 untrusted. XSS/SSRF 방어 검증 포함.
 *
 * ESM 주의: react-markdown@9 / remark-gfm@4 / rehype-highlight@7 는 ESM-only.
 * 컴포넌트를 정적 import로 먼저 올려 vitest inline-transform 모듈 캐시를
 * 올바르게 초기화한 뒤 테스트 진행 (모듈 초기화 순서 의존성 해결).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup, fireEvent } from '@testing-library/react'

// ── 컴포넌트 정적 import (ESM 모듈 캐시 초기화용) ────────────────────────────
// react-markdown, remark-gfm, rehype-highlight가 inline-transform 경로로
// 캐시되도록 컴포넌트 파일을 먼저 정적으로 로드.
import { MarkdownView } from '../../../02.Source/renderer/src/components/01_conversation/MarkdownView'
import { ImagePreview } from '../../../02.Source/renderer/src/components/03_viewer/ImagePreview'

// ── window.api mock ──────────────────────────────────────────────────────────
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

// ── CodeMirror 관련 mock (CodeViewerPane 테스트에서 CodeViewer를 마운트할 때 필요) ──

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
  mockApi.onAgentEvent.mockReturnValue(vi.fn())
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.conversationSave.mockResolvedValue({ id: 'cv-1' })
})

afterEach(() => {
  cleanup()
})

// ── MarkdownView 컴포넌트 ────────────────────────────────────────────────────

describe('MarkdownView', () => {
  it('h1 제목을 렌더한다', async () => {
    let container!: HTMLElement
    await act(async () => {
      const result = render(<MarkdownView source="# 제목" />)
      container = result.container
    })
    expect(container.querySelector('h1')).toBeTruthy()
  })

  it('굵게(bold) 텍스트를 렌더한다', async () => {
    let container!: HTMLElement
    await act(async () => {
      const result = render(<MarkdownView source="**굵게**" />)
      container = result.container
    })
    expect(container.querySelector('strong')).toBeTruthy()
  })

  it('ul 리스트를 렌더한다', async () => {
    let container!: HTMLElement
    await act(async () => {
      const result = render(<MarkdownView source="- 항목1\n- 항목2" />)
      container = result.container
    })
    expect(container.querySelector('ul')).toBeTruthy()
  })

  it('GFM 테이블을 렌더한다', async () => {
    // JSX 문자열 속성에서 \n은 리터럴 백슬래시-n이므로 템플릿 리터럴 사용
    const tableSource = `| 헤더1 | 헤더2 |
|---|---|
| 값1 | 값2 |`
    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <MarkdownView source={tableSource} />
      )
      container = result.container
    })
    expect(container.querySelector('table')).toBeTruthy()
  })

  it('markdown-view 클래스 래퍼가 있다', async () => {
    let container!: HTMLElement
    await act(async () => {
      const result = render(<MarkdownView source="hello" />)
      container = result.container
    })
    expect(container.querySelector('.markdown-view')).toBeTruthy()
  })

  it('filePath가 있을 때 aria-label에 포함된다', async () => {
    let container!: HTMLElement
    await act(async () => {
      const result = render(<MarkdownView source="hello" filePath="docs/README.md" />)
      container = result.container
    })
    const wrapper = container.querySelector('[aria-label]')
    expect(wrapper?.getAttribute('aria-label')).toContain('docs/README.md')
  })

  // XSS 방어
  it('XSS: <script> 태그가 렌더되지 않는다', async () => {
    let container!: HTMLElement
    await act(async () => {
      const result = render(<MarkdownView source="<script>alert(1)</script>" />)
      container = result.container
    })
    expect(container.querySelector('script')).toBeNull()
  })

  it('XSS: onerror 속성이 있는 img가 렌더되지 않는다', async () => {
    let container!: HTMLElement
    await act(async () => {
      const result = render(<MarkdownView source='<img src=x onerror="alert(1)">' />)
      container = result.container
    })
    expect(container.querySelector('img[onerror]')).toBeNull()
  })

  it('XSS: javascript: 링크가 href에 그대로 남지 않는다', async () => {
    let container!: HTMLElement
    await act(async () => {
      const result = render(<MarkdownView source="[클릭](javascript:alert(1))" />)
      container = result.container
    })
    // react-markdown 기본 urlTransform이 javascript: 를 무력화 — 어떤 anchor도 javascript: href를 갖지 않음
    const anchors = Array.from(container.querySelectorAll('a'))
    for (const a of anchors) {
      const href = (a.getAttribute('href') ?? '').toLowerCase()
      expect(href.startsWith('javascript:')).toBe(false)
    }
  })

  it('XSS: data: 링크(href)가 무력화된다 — 이미지 src 예외가 href로 새지 않음', async () => {
    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <MarkdownView source="[클릭](data:text/html,<script>alert(1)</script>)" />
      )
      container = result.container
    })
    // data: 통과 예외는 이미지(src)에만 적용 — 링크 href에는 data: 가 남으면 안 됨
    const anchors = Array.from(container.querySelectorAll('a'))
    for (const a of anchors) {
      const href = (a.getAttribute('href') ?? '').toLowerCase()
      expect(href.startsWith('data:')).toBe(false)
    }
  })

  // 원격 이미지 차단 (컴포넌트 레벨 SafeImg)
  it('원격 http 이미지가 img 엘리먼트로 렌더되지 않고 플레이스홀더가 표시된다', async () => {
    let container!: HTMLElement
    await act(async () => {
      const result = render(<MarkdownView source="![x](http://evil.example/track.png)" />)
      container = result.container
    })
    // img 엘리먼트가 없어야 함
    expect(container.querySelector('img')).toBeNull()
    // 플레이스홀더가 있어야 함
    expect(container.querySelector('.md-img-blocked')).toBeTruthy()
  })

  it('https 이미지도 img 엘리먼트로 렌더되지 않는다', async () => {
    let container!: HTMLElement
    await act(async () => {
      const result = render(<MarkdownView source="![x](https://example.com/img.png)" />)
      container = result.container
    })
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.md-img-blocked')).toBeTruthy()
  })

  // data: URL 이미지 허용
  it('data: URL 이미지는 img 엘리먼트로 렌더된다', async () => {
    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <MarkdownView source="![ok](data:image/png;base64,iVBORw0KGgo=)" />
      )
      container = result.container
    })
    const img = container.querySelector('img[src^="data:"]')
    expect(img).toBeTruthy()
  })
})

// ── ImagePreview 컴포넌트 ────────────────────────────────────────────────────

describe('ImagePreview', () => {
  it('정상 data URL → img 엘리먼트가 있다', async () => {
    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <ImagePreview dataUrl="data:image/png;base64,AAA" filePath="logo.png" />
      )
      container = result.container
    })
    expect(container.querySelector('img[src^="data:"]')).toBeTruthy()
  })

  it('SVG data URL은 <img>로만 렌더되고 svg/object/iframe로 렌더되지 않는다 (불변)', async () => {
    // <img> 컨텍스트의 SVG는 스크립트 비활성. 향후 object/iframe/innerHTML 전환 회귀 차단.
    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <ImagePreview
          dataUrl="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="
          filePath="icon.svg"
        />
      )
      container = result.container
    })
    expect(container.querySelector('img[src^="data:image/svg"]')).toBeTruthy()
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('object')).toBeNull()
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('http URL 전달 → img 엘리먼트 없음, 안내문 표시', async () => {
    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <ImagePreview dataUrl="http://evil.example/img.png" filePath="bad.png" />
      )
      container = result.container
    })
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('이미지를 표시할 수 없습니다')
  })

  it('dataUrl이 null → 안내문 표시', async () => {
    let container!: HTMLElement
    await act(async () => {
      const result = render(<ImagePreview dataUrl={null} filePath="logo.png" />)
      container = result.container
    })
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('이미지를 표시할 수 없습니다')
  })

  it('image-preview 클래스 래퍼가 있다', async () => {
    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <ImagePreview dataUrl="data:image/png;base64,AAA" />
      )
      container = result.container
    })
    expect(container.querySelector('.image-preview')).toBeTruthy()
  })

  it('filePath가 있을 때 aria-label에 포함된다', async () => {
    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <ImagePreview dataUrl="data:image/png;base64,AAA" filePath="assets/logo.png" />
      )
      container = result.container
    })
    const wrapper = container.querySelector('[aria-label]')
    expect(wrapper?.getAttribute('aria-label')).toContain('assets/logo.png')
  })

  it('맞춤/실제크기 토글 버튼이 있다', async () => {
    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <ImagePreview dataUrl="data:image/png;base64,AAA" filePath="logo.png" />
      )
      container = result.container
    })
    // 토글 버튼이 존재해야 함
    expect(container.querySelector('button')).toBeTruthy()
  })

  it('토글 버튼 클릭 시 상태가 변한다', async () => {
    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <ImagePreview dataUrl="data:image/png;base64,AAA" filePath="logo.png" />
      )
      container = result.container
    })
    const btn = container.querySelector('button')!
    const initialText = btn.textContent
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(btn.textContent).not.toBe(initialText)
  })
})

// ── store openFile 확장 (M2-02) ──────────────────────────────────────────────

describe('store openFile M2-02 확장', () => {
  it('readme.md → openedViewer=markdown, fsRead 호출 시 asBinary 없음', async () => {
    mockFsRead.mockResolvedValue({
      kind: 'text',
      content: '# Hello',
      language: 'markdown',
    })

    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
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
      await openFile('readme.md')
    })

    const state = useAppStore.getState()
    expect(state.openedViewer).toBe('markdown')
    expect(state.openedStatus).toBe('ready')
    // asBinary 없이 호출됨
    expect(mockFsRead).toHaveBeenCalledWith({ path: 'readme.md' })
  })

  it('pic.png → openedViewer=image, openedDataUrl 세팅, fsRead 호출 시 asBinary:true', async () => {
    mockFsRead.mockResolvedValue({
      kind: 'binary',
      dataUrl: 'data:image/png;base64,AAA',
      mime: 'image/png',
    })

    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
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
      await openFile('pic.png')
    })

    const state = useAppStore.getState()
    expect(state.openedViewer).toBe('image')
    expect(state.openedDataUrl).toBe('data:image/png;base64,AAA')
    expect(state.openedStatus).toBe('ready')
    expect(mockFsRead).toHaveBeenCalledWith({ path: 'pic.png', asBinary: true })
  })

  it('logo.svg → asBinary:true로 fsRead 호출', async () => {
    mockFsRead.mockResolvedValue({
      kind: 'binary',
      dataUrl: 'data:image/svg+xml;base64,XXX',
      mime: 'image/svg+xml',
    })

    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
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
      await openFile('logo.svg')
    })

    expect(mockFsRead).toHaveBeenCalledWith({ path: 'logo.svg', asBinary: true })
  })

  it('app.ts → openedViewer=code, asBinary 없음', async () => {
    mockFsRead.mockResolvedValue({
      kind: 'text',
      content: 'const x = 1',
      language: 'typescript',
    })

    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
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
      await openFile('app.ts')
    })

    const state = useAppStore.getState()
    expect(state.openedViewer).toBe('code')
    expect(mockFsRead).toHaveBeenCalledWith({ path: 'app.ts' })
  })

  it('이미지 파일에서 binary-skipped 응답 → status binary-skipped, openedDataUrl null', async () => {
    // binary-skipped는 asBinary:true 요청 시 발생하지 않지만, 방어적 처리
    mockFsRead.mockResolvedValue({ kind: 'binary-skipped' })

    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
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
    expect(state.openedDataUrl).toBeNull()
  })
})

// ── CodeViewerPane 라우팅 (M2-02) ────────────────────────────────────────────

describe('CodeViewerPane 라우팅 M2-02', () => {
  it('ready + viewer=markdown + content → .markdown-view 존재', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      openedFile: 'README.md',
      openedContent: '# 제목',
      openedLanguage: 'markdown',
      openedStatus: 'ready',
      openedViewer: 'markdown',
      openedDataUrl: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const { CodeViewerPane } = await import('../../../02.Source/renderer/src/layout/CodeViewerPane')
    let container!: HTMLElement
    await act(async () => {
      const result = render(<CodeViewerPane />)
      container = result.container
    })
    expect(container.querySelector('.markdown-view')).toBeTruthy()
  })

  it('ready + viewer=image + dataUrl → .image-preview 및 img[src^="data:"]', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      openedFile: 'logo.png',
      openedContent: null,
      openedLanguage: null,
      openedStatus: 'ready',
      openedViewer: 'image',
      openedDataUrl: 'data:image/png;base64,AAA',
    } as Parameters<typeof useAppStore.setState>[0])

    const { CodeViewerPane } = await import('../../../02.Source/renderer/src/layout/CodeViewerPane')
    let container!: HTMLElement
    await act(async () => {
      const result = render(<CodeViewerPane />)
      container = result.container
    })
    expect(container.querySelector('.image-preview')).toBeTruthy()
    expect(container.querySelector('img[src^="data:"]')).toBeTruthy()
  })

  it('ready + viewer=code + content → .code-viewer 존재', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      openedFile: 'app.ts',
      openedContent: 'const x = 1',
      openedLanguage: 'typescript',
      openedStatus: 'ready',
      openedViewer: 'code',
      openedDataUrl: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const { CodeViewerPane } = await import('../../../02.Source/renderer/src/layout/CodeViewerPane')
    let container!: HTMLElement
    await act(async () => {
      const result = render(<CodeViewerPane />)
      container = result.container
    })
    expect(container.querySelector('.code-viewer')).toBeTruthy()
  })
})
