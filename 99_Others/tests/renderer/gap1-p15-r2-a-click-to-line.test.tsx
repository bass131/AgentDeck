// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'

const captured = vi.hoisted(() => ({
  codeViewerProps: [] as Array<Record<string, unknown>>,
}))

vi.mock('../../../02_Source/renderer/src/features/viewer', () => {
  function MockCodeViewer(props: Record<string, unknown>): null {
    captured.codeViewerProps.push(props)
    return null
  }
  return { CodeViewer: MockCodeViewer, default: MockCodeViewer }
})

const mockUnsubscribe = vi.fn()
const mockFsRead = vi.fn()
const mockApi = {
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
  workspaceTree: vi.fn().mockResolvedValue({ tree: null }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'run-test' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(mockUnsubscribe),
  fsDiff: vi.fn().mockResolvedValue({ filePath: '', lines: [] }),
  fsRead: mockFsRead,
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
  referenceAdd: vi.fn().mockResolvedValue({ reference: null }),
  referenceList: vi.fn().mockResolvedValue({ references: [] }),
  referenceTree: vi.fn().mockResolvedValue({ tree: null }),
  getUiPrefs: vi.fn().mockResolvedValue({}),
  setUiPref: vi.fn().mockResolvedValue({ ok: true }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

import { useAppStore } from '../../../02_Source/renderer/src/store/appStore'
import { SearchResultView } from '../../../02_Source/renderer/src/components/01_conversation/SearchResultView'
import { FileModal } from '../../../02_Source/renderer/src/features/file'
import type { AgentEventSearchResult } from '../../../02_Source/shared/agentEvents'

type OpenFileWithLine = (path: string, rootId?: string, line?: number) => Promise<void>
type LineStateBridge = { openedLine?: number | null }

function getOpenedLine(): number | null | undefined {
  return (useAppStore.getState() as ReturnType<typeof useAppStore.getState> & LineStateBridge)
    .openedLine
}

const baselineState = useAppStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  mockFsRead.mockResolvedValue({ kind: 'text', content: 'const x = 1', language: 'typescript' })
  mockApi.onAgentEvent.mockReturnValue(mockUnsubscribe)
  captured.codeViewerProps.length = 0
  localStorage.clear()
  useAppStore.setState(baselineState, true)
})

afterEach(() => {
  cleanup()
})

const CONTENT_RESULT: AgentEventSearchResult = {
  type: 'search_result',
  toolUseId: 'tc-grep',
  mode: 'content',
  matches: [
    { path: '02_Source/main/index.ts', line: 10, text: "import { app } from 'electron'" },
    { path: '02_Source/renderer/src/App.tsx', line: 7, text: 'export function App()' },
    { path: '02_Source/renderer/src/App.tsx', text: '라인 정보 없는 매치' },
  ],
  total: 3,
}

const FILES_RESULT: AgentEventSearchResult = {
  type: 'search_result',
  toolUseId: 'tc-grep',
  mode: 'files_with_matches',
  files: ['02_Source/main/a.ts', '02_Source/main/b.ts'],
  total: 2,
}

function spyOpenFile(): ReturnType<typeof vi.fn> {
  const spy = vi.fn().mockResolvedValue(undefined)
  useAppStore.setState({ openFile: spy } as unknown as Parameters<typeof useAppStore.setState>[0])
  return spy
}

describe('GAP1 P15 R2-A — SearchResultView 매치 클릭 → 라인 전달 (RED)', () => {
  it('매치 라인(라인 있음) 클릭 → openFile(path, undefined, line) — 3번째 인자로 라인 전달', () => {
    const spy = spyOpenFile()
    const { container } = render(<SearchResultView result={CONTENT_RESULT} />)

    const row = container.querySelector('[data-search-match][data-line="7"]') as HTMLElement
    expect(row).toBeTruthy()
    fireEvent.click(row)

    expect(spy).toHaveBeenCalledTimes(1)
    const call = spy.mock.calls[0]
    expect(call[0]).toBe('02_Source/renderer/src/App.tsx')
    expect(call[1]).toBeUndefined()
    expect(call[2]).toBe(7)
  })

  it('라인 정보 없는 매치 클릭 → line 미전달(기존 거동 핀)', () => {
    const spy = spyOpenFile()
    const { container } = render(<SearchResultView result={CONTENT_RESULT} />)

    const row = container.querySelector('[data-search-match]:not([data-line])') as HTMLElement
    expect(row).toBeTruthy()
    fireEvent.click(row)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('02_Source/renderer/src/App.tsx')
    expect(spy.mock.calls[0][2]).toBeUndefined()
  })

  it('파일 헤더 클릭 → line 미전달(기존 거동 핀)', () => {
    const spy = spyOpenFile()
    const { container } = render(<SearchResultView result={CONTENT_RESULT} />)

    const header = container.querySelector(
      '[data-search-file="02_Source/main/index.ts"]'
    ) as HTMLElement
    expect(header).toBeTruthy()
    fireEvent.click(header)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('02_Source/main/index.ts')
    expect(spy.mock.calls[0][2]).toBeUndefined()
  })

  it('파일 목록 모드(files_with_matches) 행 클릭 → line 미전달(기존 거동 핀)', () => {
    const spy = spyOpenFile()
    const { container } = render(<SearchResultView result={FILES_RESULT} />)

    const row = container.querySelector('[data-search-file="02_Source/main/b.ts"]') as HTMLElement
    expect(row).toBeTruthy()
    fireEvent.click(row)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('02_Source/main/b.ts')
    expect(spy.mock.calls[0][2]).toBeUndefined()
  })
})

describe('GAP1 P15 R2-A — viewer slice openedLine (RED)', () => {
  it('openFile(path, undefined, line) → openedLine 저장 + fsRead 요청은 {path} 그대로(IPC 불변)', async () => {
    const openFile = useAppStore.getState().openFile as OpenFileWithLine
    await act(async () => {
      await openFile('src/foo.ts', undefined, 42)
    })

    const state = useAppStore.getState()
    expect(state.openedFile).toBe('src/foo.ts')
    expect(state.openedStatus).toBe('ready')
    expect(mockFsRead).toHaveBeenCalledWith({ path: 'src/foo.ts' })
    expect(getOpenedLine()).toBe(42)
  })

  it('line 미전달 openFile → openedLine=null 리셋(이전 라인 표류 방지)', async () => {
    const openFile = useAppStore.getState().openFile as OpenFileWithLine
    await act(async () => {
      await openFile('src/foo.ts', undefined, 42)
    })
    await act(async () => {
      await openFile('src/bar.ts')
    })

    expect(getOpenedLine()).toBeNull()
  })

  it('closeOpenedFile → openedLine=null 리셋', () => {
    useAppStore.setState({
      openedFile: 'src/foo.ts',
      openedLine: 42,
    } as unknown as Parameters<typeof useAppStore.setState>[0])

    useAppStore.getState().closeOpenedFile()

    expect(getOpenedLine()).toBeNull()
  })
})

function setReadyFileState(line: number | null): void {
  useAppStore.setState({
    openedFile: 'src/foo.ts',
    openedContent: 'const x = 1',
    openedLanguage: 'typescript',
    openedStatus: 'ready',
    openedViewer: 'code',
    openedDataUrl: null,
    openedRootId: null,
    diffFilePath: null,
    openedLine: line,
  } as unknown as Parameters<typeof useAppStore.setState>[0])
}

describe('GAP1 P15 R2-A — FileModal openedLine → CodeViewer line prop (RED)', () => {
  it('openedLine=42 → CodeViewer가 line=42 prop을 받는다', async () => {
    setReadyFileState(42)
    await act(async () => {
      render(<FileModal />)
    })

    expect(captured.codeViewerProps.length).toBeGreaterThan(0)
    const last = captured.codeViewerProps[captured.codeViewerProps.length - 1]
    expect(last.filePath).toBe('src/foo.ts')
    expect(last.line).toBe(42)
  })

  it('openedLine=null → line prop 미전달(기존 거동 핀)', async () => {
    setReadyFileState(null)
    await act(async () => {
      render(<FileModal />)
    })

    expect(captured.codeViewerProps.length).toBeGreaterThan(0)
    const last = captured.codeViewerProps[captured.codeViewerProps.length - 1]
    expect(last.line == null).toBe(true)
  })
})
