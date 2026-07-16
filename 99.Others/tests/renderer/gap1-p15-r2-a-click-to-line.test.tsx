// @vitest-environment jsdom
/**
 * gap1-p15-r2-a-click-to-line.test.tsx — GAP1 P15 R2-A: 검색 매치 클릭 → 라인 점프 RED (TDD 선행).
 *
 * R1 실사용 확인 불편: SearchResultView 매치 클릭 시 openFile(m.path)만 호출 —
 * m.line(계약 데이터엔 존재)이 버려져 파일은 열리나 해당 라인으로 스크롤되지 않음.
 *
 * 대상(R only — qa는 앱 소스 미편집, 구현은 renderer Worker 몫):
 *   02.Source/renderer/src/store/slices/viewer.ts
 *     — openFile 시그니처 additive 확장: (path, rootId?, line?) + 상태 `openedLine: number | null`
 *   02.Source/renderer/src/components/01_conversation/SearchResultView.tsx:83
 *     — 매치 클릭 시 openFile(m.path, undefined, m.line)
 *   02.Source/renderer/src/components/02_file/FileModal.tsx:138
 *     — CodeViewer에 line={openedLine ?? undefined} 전달
 *
 * 계약(interface-of-record — 구현이 여기에 맞춘다):
 *   [SearchResultView] 매치 라인(라인 있음) 클릭 → openFile(path, undefined, line).
 *     · 2번째 인자(rootId)는 탈취 금지 — undefined 유지(워크스페이스 파일).
 *     · 라인 없는 매치/파일 헤더/파일 목록 행 클릭 → 기존 거동(line 미전달) 핀.
 *   [viewer slice] openFile 3번째 인자 line →
 *     · openedLine에 저장(1-based). line 미전달 호출은 openedLine=null 리셋(표류 방지).
 *     · closeOpenedFile()도 openedLine=null 리셋.
 *     · CRITICAL: line은 window.api.fsRead 요청에 싣지 않는다(IPC 계약 불변 — CORE-04.
 *       스크롤은 뷰어가 열린 뒤 renderer 클라이언트에서).
 *   [FileModal] openedStatus=ready·viewer=code일 때 CodeViewer에 line prop으로 openedLine 전달
 *     (null이면 미전달). CodeViewer 쪽 스크롤 계약은 자매 파일
 *     gap1-p15-r2-a-codeviewer-line-scroll.test.tsx 참조.
 *
 * TDD 상태: RED 5건(이 파일) — 매치 클릭 line 전달 1 + openedLine 저장 1 + 미전달 리셋 1
 *   + closeOpenedFile 리셋 1 + FileModal 배선 1. 나머지는 현행 GREEN 회귀 핀(구현 후에도 불변).
 *
 * 구현 전 타입 다리(P07/P08 선례): 아직 없는 시그니처/필드는 cast로 접근 —
 * 구현이 실제 타입을 추가하면 다리 없이도 동형.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'

// ── CodeViewer 모듈 mock (FileModal 배선 관찰용 — props 기록) ────────────────────
// vi.hoisted: mock factory가 참조 가능한 유일한 외부 값(호이스팅 제약).
const captured = vi.hoisted(() => ({
  codeViewerProps: [] as Array<Record<string, unknown>>,
}))

vi.mock('../../../02.Source/renderer/src/components/03_viewer/CodeViewer', () => {
  function MockCodeViewer(props: Record<string, unknown>): null {
    captured.codeViewerProps.push(props)
    return null
  }
  return { CodeViewer: MockCodeViewer, default: MockCodeViewer }
})

// ── window.api mock (f15-filemodal 선례 미러 — store 액션이 IPC 대신 이 mock 호출) ──
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

import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import { SearchResultView } from '../../../02.Source/renderer/src/components/01_conversation/SearchResultView'
import FileModal from '../../../02.Source/renderer/src/components/02_file/FileModal'
import type { AgentEventSearchResult } from '../../../02.Source/shared/agent-events'

// ── 구현 전 타입 다리 ─────────────────────────────────────────────────────────────
/** 확장 예정 openFile 시그니처 — 구현 후 viewer slice 실제 타입과 동형이어야 한다. */
type OpenFileWithLine = (path: string, rootId?: string, line?: number) => Promise<void>
/** 확장 예정 상태 필드 — 구현 후 ViewerState.openedLine과 동형이어야 한다. */
type LineStateBridge = { openedLine?: number | null }

function getOpenedLine(): number | null | undefined {
  return (useAppStore.getState() as ReturnType<typeof useAppStore.getState> & LineStateBridge)
    .openedLine
}

// ── store 리셋(파일 단위 baseline snapshot → 각 테스트 전 replace 복원) ─────────────
const baselineState = useAppStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  mockFsRead.mockResolvedValue({ kind: 'text', content: 'const x = 1', language: 'typescript' })
  mockApi.onAgentEvent.mockReturnValue(mockUnsubscribe)
  captured.codeViewerProps.length = 0
  localStorage.clear()
  // replace=true: spy로 바꾼 액션·다리로 주입한 임시 필드까지 원상 복구(테스트 간 오염 0).
  useAppStore.setState(baselineState, true)
})

afterEach(() => {
  cleanup()
})

// ── 고정 fixture (P08 골든과 동일 계약 형상 — 합성) ─────────────────────────────────
const CONTENT_RESULT: AgentEventSearchResult = {
  type: 'search_result',
  toolUseId: 'tc-grep',
  mode: 'content',
  matches: [
    { path: '02.Source/main/index.ts', line: 10, text: "import { app } from 'electron'" },
    { path: '02.Source/renderer/src/App.tsx', line: 7, text: 'export function App()' },
    // 라인 정보 없는 매치(계약상 line optional) — 기존 거동 유지 핀 대상.
    { path: '02.Source/renderer/src/App.tsx', text: '라인 정보 없는 매치' },
  ],
  total: 3,
}

const FILES_RESULT: AgentEventSearchResult = {
  type: 'search_result',
  toolUseId: 'tc-grep',
  mode: 'files_with_matches',
  files: ['02.Source/main/a.ts', '02.Source/main/b.ts'],
  total: 2,
}

/** store.openFile을 spy로 교체 — IPC 없이 호출 인자만 검증(gap1-p08 선례). */
function spyOpenFile(): ReturnType<typeof vi.fn> {
  const spy = vi.fn().mockResolvedValue(undefined)
  useAppStore.setState({ openFile: spy } as unknown as Parameters<typeof useAppStore.setState>[0])
  return spy
}

// ── 1. SearchResultView 클릭 계약 ──────────────────────────────────────────────────

describe('GAP1 P15 R2-A — SearchResultView 매치 클릭 → 라인 전달 (RED)', () => {
  it('매치 라인(라인 있음) 클릭 → openFile(path, undefined, line) — 3번째 인자로 라인 전달', () => {
    const spy = spyOpenFile()
    const { container } = render(<SearchResultView result={CONTENT_RESULT} />)

    const row = container.querySelector('[data-search-match][data-line="7"]') as HTMLElement
    expect(row).toBeTruthy()
    fireEvent.click(row)

    expect(spy).toHaveBeenCalledTimes(1)
    const call = spy.mock.calls[0]
    expect(call[0]).toBe('02.Source/renderer/src/App.tsx')
    // rootId 자리(2번째)는 탈취 금지 — 워크스페이스 파일이므로 undefined 유지.
    expect(call[1]).toBeUndefined()
    // RED: 현행은 openFile(m.path) 단일 인자 → call[2] === undefined.
    expect(call[2]).toBe(7)
  })

  it('라인 정보 없는 매치 클릭 → line 미전달(기존 거동 핀)', () => {
    const spy = spyOpenFile()
    const { container } = render(<SearchResultView result={CONTENT_RESULT} />)

    const row = container.querySelector('[data-search-match]:not([data-line])') as HTMLElement
    expect(row).toBeTruthy()
    fireEvent.click(row)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('02.Source/renderer/src/App.tsx')
    expect(spy.mock.calls[0][2]).toBeUndefined()
  })

  it('파일 헤더 클릭 → line 미전달(기존 거동 핀)', () => {
    const spy = spyOpenFile()
    const { container } = render(<SearchResultView result={CONTENT_RESULT} />)

    const header = container.querySelector(
      '[data-search-file="02.Source/main/index.ts"]'
    ) as HTMLElement
    expect(header).toBeTruthy()
    fireEvent.click(header)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('02.Source/main/index.ts')
    expect(spy.mock.calls[0][2]).toBeUndefined()
  })

  it('파일 목록 모드(files_with_matches) 행 클릭 → line 미전달(기존 거동 핀)', () => {
    const spy = spyOpenFile()
    const { container } = render(<SearchResultView result={FILES_RESULT} />)

    const row = container.querySelector('[data-search-file="02.Source/main/b.ts"]') as HTMLElement
    expect(row).toBeTruthy()
    fireEvent.click(row)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('02.Source/main/b.ts')
    expect(spy.mock.calls[0][2]).toBeUndefined()
  })
})

// ── 2. viewer slice — openedLine 상태 ──────────────────────────────────────────────

describe('GAP1 P15 R2-A — viewer slice openedLine (RED)', () => {
  it('openFile(path, undefined, line) → openedLine 저장 + fsRead 요청은 {path} 그대로(IPC 불변)', async () => {
    const openFile = useAppStore.getState().openFile as OpenFileWithLine
    await act(async () => {
      await openFile('src/foo.ts', undefined, 42)
    })

    const state = useAppStore.getState()
    expect(state.openedFile).toBe('src/foo.ts')
    expect(state.openedStatus).toBe('ready')
    // CRITICAL 핀: line은 IPC(fsRead) 요청에 실리지 않는다 — 기존 {path} 형상 그대로.
    expect(mockFsRead).toHaveBeenCalledWith({ path: 'src/foo.ts' })
    // RED: 현행 slice엔 openedLine 필드가 없다(undefined).
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

    // RED: 현행은 필드 자체가 없어 undefined(≠ null).
    expect(getOpenedLine()).toBeNull()
  })

  it('closeOpenedFile → openedLine=null 리셋', () => {
    useAppStore.setState({
      openedFile: 'src/foo.ts',
      openedLine: 42,
    } as unknown as Parameters<typeof useAppStore.setState>[0])

    useAppStore.getState().closeOpenedFile()

    // RED: 현행 closeOpenedFile은 openedLine을 모른다(42 잔존).
    expect(getOpenedLine()).toBeNull()
  })
})

// ── 3. FileModal 배선 — openedLine → CodeViewer line prop ──────────────────────────

/** ready 코드 파일이 열린 store 상태 세팅(+ openedLine 다리 주입). */
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
    // RED: 현행 FileModal은 line prop을 전달하지 않는다(undefined).
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
