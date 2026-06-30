// @vitest-environment jsdom
/**
 * f15-filemodal.test.tsx — F15-02 FileModal 플로팅 모달 + Shell 재구성 (TDD: 실패 먼저).
 *
 * AC:
 *  - FileModal: openedFile set → .fv-overlay 표시
 *  - FileModal: closeOpenedFile → .fv-overlay 사라짐
 *  - FileModal: Esc → 닫기
 *  - FileModal: openedFile null → 미렌더
 *  - FileModal: 기본 최대화(원본 ref-03 센터+블러) → 복원/최대화 버튼 토글
 *  - Shell: .pane-tab 0개 (탭 제거)
 *  - Shell: 파일 열기 → .pane.explorer·.pane.chat DOM 유지 (자동 탭전환 없음)
 *  - appStore: closeOpenedFile 액션 존재 + 상태 리셋
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'

// ── window.api mock ─────────────────────────────────────────────────────────
const mockUnsubscribe = vi.fn()
const mockApi = {
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
  workspaceTree: vi.fn().mockResolvedValue({ tree: null }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'run-test' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(mockUnsubscribe),
  fsDiff: vi.fn().mockResolvedValue({ filePath: '', lines: [] }),
  fsRead: vi.fn().mockResolvedValue({ kind: 'text', content: 'const x = 1', language: 'typescript' }),
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
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
  referenceAdd: vi.fn().mockResolvedValue({ reference: null }),
  referenceList: vi.fn().mockResolvedValue({ references: [] }),
  referenceTree: vi.fn().mockResolvedValue({ tree: null }),
  // P1: UI prefs IPC (Shell.tsx가 prefs 연결에서 호출)
  getUiPrefs: vi.fn().mockResolvedValue({}),
  setUiPref: vi.fn().mockResolvedValue({ ok: true }),
  // P4: 부트 자동 트리거 — 빈 버전 반환 → decideStartupModal null → 모달 자동 표시 없음
  getAppVersion: vi.fn().mockResolvedValue(''),
  // 폴리싱 #2(a): Shell 부트 useEffect가 호출하는 엔진 업데이트 체크 — updateAvailable:false → 알림 미표시
  checkEngineUpdate: vi.fn().mockResolvedValue({ current: null, latest: null, updateAvailable: false }),
}

Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

// CodeMirror / darcula mocks (Shell이 CodeViewerPane 포함)
vi.mock('../../../02.Source/renderer/src/theme/darcula', () => ({
  darculaTheme: {}, darculaHighlighting: {}, darculaHighlightStyle: {},
}))
vi.mock('@codemirror/view', () => {
  class MockEditorView {
    static theme() { return {} }
    static decorations = { from: vi.fn(() => ({})) }
    constructor({ parent }: { parent: HTMLElement }) {
      const div = document.createElement('div'); div.className = 'cm-editor'; parent.appendChild(div)
    }
    destroy() {} dispatch() {}
    state = { doc: { lineAt: vi.fn(() => ({ number: 1, from: 0 })), line: vi.fn(() => ({ from: 0, to: 10 })), lines: 100 } }
  }
  return {
    EditorView: MockEditorView,
    lineNumbers: vi.fn(() => ({})), highlightActiveLine: vi.fn(() => ({})),
    keymap: { of: vi.fn(() => ({})) }, drawSelection: vi.fn(() => ({})),
    dropCursor: vi.fn(() => ({})), rectangularSelection: vi.fn(() => ({})),
    crosshairCursor: vi.fn(() => ({})), highlightActiveLineGutter: vi.fn(() => ({})),
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
  EditorState: { create: vi.fn(() => ({})), readOnly: { of: vi.fn(() => ({})) } },
  Compartment: class { of(v: unknown) { return v } reconfigure(v: unknown) { return v } },
  StateEffect: { define: vi.fn(() => ({ of: vi.fn(() => ({})) })) },
  StateField: { define: vi.fn((_spec: unknown) => ({ _isStateField: true })) },
}))
vi.mock('@codemirror/language', () => ({
  syntaxHighlighting: vi.fn(() => ({})), defaultHighlightStyle: {}, indentOnInput: vi.fn(() => ({})),
  foldGutter: vi.fn(() => ({})), bracketMatching: vi.fn(() => ({})),
  LanguageSupport: class {}, HighlightStyle: { define: vi.fn(() => ({})) },
}))
vi.mock('@codemirror/commands', () => ({ defaultKeymap: [], historyKeymap: [], history: vi.fn(() => ({})) }))
vi.mock('@codemirror/search', () => ({ searchKeymap: [], highlightSelectionMatches: vi.fn(() => ({})), search: vi.fn(() => ({})), openSearchPanel: vi.fn() }))
vi.mock('@codemirror/lang-javascript', () => ({ javascript: vi.fn(() => ({})) }))
vi.mock('@codemirror/lang-python', () => ({ python: vi.fn(() => ({})) }))
vi.mock('@codemirror/lang-json', () => ({ json: vi.fn(() => ({})) }))
vi.mock('@codemirror/lang-markdown', () => ({ markdown: vi.fn(() => ({})) }))
vi.mock('@codemirror/lang-html', () => ({ html: vi.fn(() => ({})) }))
vi.mock('@codemirror/lang-css', () => ({ css: vi.fn(() => ({})) }))

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.workspaceOpen.mockResolvedValue({ rootPath: null, tree: null })
  mockApi.agentRun.mockResolvedValue({ runId: 'run-test' })
  mockApi.onAgentEvent.mockReturnValue(mockUnsubscribe)
  mockApi.fsDiff.mockResolvedValue({ filePath: '', lines: [] })
  mockApi.fsRead.mockResolvedValue({ kind: 'text', content: 'const x = 1', language: 'typescript' })
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.conversationSave.mockResolvedValue({ id: 'cv-1' })
  mockApi.windowIsMaximized.mockResolvedValue({ maximized: false })
  mockApi.onWindowState.mockReturnValue(mockUnsubscribe)
  // localStorage 정리 (resizableModal 영속)
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  useAppStore.setState({ workspaceMode: 'single' })
})

// ── appStore closeOpenedFile 액션 ────────────────────────────────────────────

describe('appStore — closeOpenedFile 액션 (F15-02)', () => {
  it('closeOpenedFile 액션이 존재한다', () => {
    const state = useAppStore.getState()
    expect(typeof state.closeOpenedFile).toBe('function')
  })

  it('closeOpenedFile 호출 시 openedFile/openedContent/openedStatus/diffFilePath 리셋', () => {
    useAppStore.setState({
      openedFile: '/path/to/file.ts',
      openedContent: 'content',
      openedStatus: 'ready',
      diffFilePath: '/path/to/file.ts',
      openedDataUrl: null,
    } as Parameters<typeof useAppStore.setState>[0])

    useAppStore.getState().closeOpenedFile()

    const s = useAppStore.getState()
    expect(s.openedFile).toBeNull()
    expect(s.openedContent).toBeNull()
    expect(s.openedStatus).toBe('idle')
    expect(s.diffFilePath).toBeNull()
  })
})

// ── FileModal 컴포넌트 ────────────────────────────────────────────────────────

describe('FileModal — 렌더 (F15-02)', () => {
  it('openedFile null → .fv-overlay 미렌더', async () => {
    useAppStore.setState({
      openedFile: null, openedContent: null, openedStatus: 'idle',
    } as Parameters<typeof useAppStore.setState>[0])

    const { FileModal } = await import('../../../02.Source/renderer/src/components/02_file/FileModal')
    const { container } = await act(async () => render(<FileModal />))
    expect(container.querySelector('.fv-overlay')).toBeNull()
  })

  it('openedFile set → .fv-overlay 표시', async () => {
    useAppStore.setState({
      openedFile: '/path/test.ts',
      openedContent: 'const x = 1',
      openedStatus: 'ready',
      openedViewer: 'code',
      openedLanguage: 'typescript',
      openedRootId: null,
      diffFilePath: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const { FileModal } = await import('../../../02.Source/renderer/src/components/02_file/FileModal')
    const { container } = await act(async () => render(<FileModal />))
    expect(container.querySelector('.fv-overlay')).toBeTruthy()
  })

  it('헤더 .diff-head 가 렌더된다', async () => {
    useAppStore.setState({
      openedFile: '/path/test.ts',
      openedContent: 'const x = 1',
      openedStatus: 'ready',
      openedViewer: 'code',
      openedLanguage: 'typescript',
      openedRootId: null,
      diffFilePath: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const { FileModal } = await import('../../../02.Source/renderer/src/components/02_file/FileModal')
    const { container } = await act(async () => render(<FileModal />))
    expect(container.querySelector('.diff-head')).toBeTruthy()
  })

  it('기본 최대화(원본 ref-03 센터+블러): 복원 버튼 노출, 최대화 버튼 없음', async () => {
    useAppStore.setState({
      openedFile: '/path/test.ts',
      openedContent: 'const x = 1',
      openedStatus: 'ready',
      openedViewer: 'code',
      openedLanguage: 'typescript',
      openedRootId: null,
      diffFilePath: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const { FileModal } = await import('../../../02.Source/renderer/src/components/02_file/FileModal')
    const { container } = await act(async () => render(<FileModal />))
    expect(container.querySelector('.fv-overlay')).toBeTruthy()
    // 기본 최대화 → 복원 버튼 노출, 최대화 버튼 없음
    expect(container.querySelector('.dclose[aria-label="복원"]')).toBeTruthy()
    expect(container.querySelector('.dclose[aria-label="최대화"]')).toBeNull()
  })
})

describe('FileModal — 닫기 (F15-02)', () => {
  async function renderOpenModal() {
    useAppStore.setState({
      openedFile: '/path/test.ts',
      openedContent: 'const x = 1',
      openedStatus: 'ready',
      openedViewer: 'code',
      openedLanguage: 'typescript',
      openedRootId: null,
      diffFilePath: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const { FileModal } = await import('../../../02.Source/renderer/src/components/02_file/FileModal')
    return act(async () => render(<FileModal />))
  }

  it('닫기 버튼(.dclose) 클릭 → closeOpenedFile → .fv-overlay 사라짐', async () => {
    const { container } = await renderOpenModal()
    expect(container.querySelector('.fv-overlay')).toBeTruthy()

    // 닫기 버튼 클릭
    const closeBtn = container.querySelector('.dclose[aria-label="닫기"]') ??
      container.querySelectorAll('.dclose')[container.querySelectorAll('.dclose').length - 1]
    expect(closeBtn).toBeTruthy()
    await act(async () => { fireEvent.click(closeBtn!) })

    expect(container.querySelector('.fv-overlay')).toBeNull()
  })

  it('Esc 키 → closeOpenedFile → .fv-overlay 사라짐', async () => {
    const { container } = await renderOpenModal()
    expect(container.querySelector('.fv-overlay')).toBeTruthy()

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })

    expect(container.querySelector('.fv-overlay')).toBeNull()
  })

  it('Esc가 다른 모달이 없을 때만 작동 (전역 preventDefault 호출 안 함)', async () => {
    const { container } = await renderOpenModal()

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault')

    await act(async () => {
      document.dispatchEvent(event)
    })

    // FileModal의 Esc 핸들러는 preventDefault를 호출하지 않아야 함 (전역 단축키 위반)
    expect(preventDefaultSpy).not.toHaveBeenCalled()
    expect(container.querySelector('.fv-overlay')).toBeNull()
  })
})

describe('FileModal — 최대화/복원 토글 (F15)', () => {
  function openMaximized() {
    useAppStore.setState({
      openedFile: '/path/test.ts',
      openedContent: 'const x = 1',
      openedStatus: 'ready',
      openedViewer: 'code',
      openedLanguage: 'typescript',
      openedRootId: null,
      diffFilePath: null,
    } as Parameters<typeof useAppStore.setState>[0])
  }

  it('기본 최대화 → 복원 버튼 클릭 → 최대화 버튼으로 전환 (1140 센터 카드)', async () => {
    openMaximized()
    const { FileModal } = await import('../../../02.Source/renderer/src/components/02_file/FileModal')
    const { container } = await act(async () => render(<FileModal />))

    const restoreBtn = container.querySelector('.dclose[aria-label="복원"]')
    expect(restoreBtn).toBeTruthy()
    await act(async () => { fireEvent.click(restoreBtn!) })

    // 복원됨 → 최대화 버튼 노출
    expect(container.querySelector('.dclose[aria-label="최대화"]')).toBeTruthy()
    expect(container.querySelector('.dclose[aria-label="복원"]')).toBeNull()
  })

  it('복원 → 최대화 버튼 클릭 → 다시 복원 버튼 복귀', async () => {
    openMaximized()
    const { FileModal } = await import('../../../02.Source/renderer/src/components/02_file/FileModal')
    const { container } = await act(async () => render(<FileModal />))

    // 복원
    await act(async () => {
      fireEvent.click(container.querySelector('.dclose[aria-label="복원"]')!)
    })
    const maxBtn = container.querySelector('.dclose[aria-label="최대화"]')
    expect(maxBtn).toBeTruthy()

    // 다시 최대화
    await act(async () => { fireEvent.click(maxBtn!) })
    expect(container.querySelector('.dclose[aria-label="복원"]')).toBeTruthy()
    expect(container.querySelector('.dclose[aria-label="최대화"]')).toBeNull()
  })
})

// ── Shell 재구성 (F15-02) ─────────────────────────────────────────────────────

describe('Shell 재구성 — 탭 제거 (F15-02)', () => {
  async function renderShell() {
    useAppStore.setState({
      fileTree: null, workspaceRoot: null, isRunning: false,
      messages: [], streamingText: '', toolCards: [], changedFiles: new Set(),
      openedFile: null, openedContent: null, openedLanguage: null, openedStatus: 'idle',
      workspaceMode: 'single',
    } as Parameters<typeof useAppStore.setState>[0])

    const { Shell } = await import('../../../02.Source/renderer/src/layout/Shell')
    return act(async () => render(<Shell />))
  }

  it('Shell에 .pane-tab 이 0개여야 한다 (탭 완전 제거)', async () => {
    const { container } = await renderShell()
    const tabs = container.querySelectorAll('.pane-tab')
    expect(tabs.length).toBe(0)
  })

  it('.pane.explorer 와 .pane.chat 가 항상 동시에 존재한다', async () => {
    const { container } = await renderShell()
    expect(container.querySelector('.pane.explorer')).toBeTruthy()
    expect(container.querySelector('.pane.chat')).toBeTruthy()
  })

  it('파일 열기(openedFile set)해도 .pane.explorer·.pane.chat DOM 유지', async () => {
    const { container } = await renderShell()

    // openedFile 세팅 → 자동 탭전환이 있었다면 explorer/chat pane 사라졌을 것
    await act(async () => {
      useAppStore.setState({
        openedFile: '/path/test.ts',
        openedContent: 'const x = 1',
        openedStatus: 'ready',
        openedViewer: 'code',
      } as Parameters<typeof useAppStore.setState>[0])
    })

    expect(container.querySelector('.pane.explorer')).toBeTruthy()
    expect(container.querySelector('.pane.chat')).toBeTruthy()
  })

  it('파일 열기 시 .fv-overlay(FileModal)가 표시된다', async () => {
    const { container } = await renderShell()

    await act(async () => {
      useAppStore.setState({
        openedFile: '/path/test.ts',
        openedContent: 'const x = 1',
        openedStatus: 'ready',
        openedViewer: 'code',
        openedLanguage: 'typescript',
        openedRootId: null,
        diffFilePath: null,
      } as Parameters<typeof useAppStore.setState>[0])
    })

    expect(container.querySelector('.fv-overlay')).toBeTruthy()
  })

  it('Conversation 컴포넌트가 항상 표시된다 (대화 탭 없이)', async () => {
    const { container } = await renderShell()
    // chat 입력창(textarea)이 항상 보여야 함
    const chatPane = container.querySelector('.pane.chat')
    expect(chatPane).toBeTruthy()
    // textarea나 chat 입력 영역 존재
    const textarea = chatPane?.querySelector('textarea')
    expect(textarea).toBeTruthy()
  })

  it('.chat-files(RecentFiles) 가 .pane.chat 안에 있다', async () => {
    // recentFiles가 있을 때 .chat-files가 chat pane 안에 렌더됨
    useAppStore.setState({
      fileTree: null, workspaceRoot: null, isRunning: false,
      messages: [], streamingText: '', toolCards: [], changedFiles: new Set(),
      openedFile: '/path/test.ts', openedContent: null, openedLanguage: null, openedStatus: 'idle',
      recentFiles: ['/path/test.ts'],
      workspaceMode: 'single',
    } as Parameters<typeof useAppStore.setState>[0])

    const { Shell } = await import('../../../02.Source/renderer/src/layout/Shell')
    const { container } = await act(async () => render(<Shell />))

    const chatPane = container.querySelector('.pane.chat')
    expect(chatPane).toBeTruthy()
    const chatFiles = chatPane?.querySelector('.chat-files')
    expect(chatFiles).toBeTruthy()
  })
})
