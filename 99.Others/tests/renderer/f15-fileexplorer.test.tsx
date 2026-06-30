// @vitest-environment jsdom
/**
 * f15-fileexplorer.test.tsx — F15-01 FileExplorer 디테일 폴리싱 (TDD: 실패 먼저).
 *
 * AC:
 *  - .fe-head .fe-title('탐색기') 존재
 *  - .fe-frow.main (project명 + Ctrl O kbd) 존재
 *  - .fe-folder-add 존재
 *  - .fe-blank / .fe-blank-btn 존재 (트리 없을 때)
 *  - 검색창 .fe-search .kbd 존재
 *  - 레퍼런스 .fe-frow 클릭 → viewing 전환(ref 트리 표시, 메인 트리 숨김)
 *  - .fe-file 클릭 → openFile 회귀 0 (기존 동작 보존)
 *  - .fe-ref-section 제거 확인
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import type { FileTreeNode } from '../../../02.Source/shared/ipc-contract'

// window.api stub (M7: fsListDir + listFiles 추가)
const mockFsListDir = vi.fn().mockImplementation(({ relDir, rootId }: { relDir: string; rootId?: string }) => {
  // 레퍼런스 폴더(rootId='ref-1') 루트
  if (rootId === 'ref-1' && relDir === '') {
    return Promise.resolve({
      entries: [
        { name: 'ref-file.ts', path: 'ref-file.ts', kind: 'file' },
      ],
    })
  }
  if (relDir === '') {
    return Promise.resolve({
      entries: [
        { name: 'app.ts', path: 'app.ts', kind: 'file' },
        { name: 'index.ts', path: 'index.ts', kind: 'file' },
      ],
    })
  }
  return Promise.resolve({ entries: [] })
})
const mockListFiles = vi.fn().mockResolvedValue({ files: ['app.ts', 'index.ts'] })

const mockApi = {
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
  fsRead: vi.fn().mockResolvedValue({ kind: 'text', content: '', language: 'text' }),
  referenceAdd: vi.fn().mockResolvedValue({ reference: null }),
  referenceList: vi.fn().mockResolvedValue({ references: [] }),
  referenceTree: vi.fn().mockResolvedValue({ tree: null }),
  getUiPrefs: vi.fn().mockResolvedValue({}),
  setUiPref: vi.fn().mockResolvedValue({ ok: true }),
  fsListDir: mockFsListDir,
  listFiles: mockListFiles,
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

const mainTree: FileTreeNode = {
  name: 'myproject',
  path: '',
  kind: 'directory',
  children: [
    { name: 'app.ts', path: 'app.ts', kind: 'file' },
    { name: 'index.ts', path: 'index.ts', kind: 'file' },
  ],
}

const refTree: FileTreeNode = {
  name: 'refproject',
  path: '/ref',
  kind: 'directory',
  children: [
    { name: 'ref-file.ts', path: '/ref/ref-file.ts', kind: 'file' },
  ],
}

async function renderExplorerEmpty() {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  useAppStore.setState({
    fileTree: null,
    workspaceRoot: null,
    changedFiles: new Set(),
    openedFile: null,
    references: [],
  } as Parameters<typeof useAppStore.setState>[0])
  const { FileExplorer } = await import('../../../02.Source/renderer/src/components/02_file/FileExplorer')
  const result = await act(async () => render(<FileExplorer />))
  return result
}

async function renderExplorerWithTree(refs?: { id: string; name: string; tree: import('../../../02.Source/shared/ipc-contract').FileTreeNode | null }[]) {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  useAppStore.setState({
    fileTree: mainTree,
    workspaceRoot: '/ws/myproject',
    changedFiles: new Set(['app.ts']),
    openedFile: null,
    references: refs ?? [],
  } as Parameters<typeof useAppStore.setState>[0])
  const { FileExplorer } = await import('../../../02.Source/renderer/src/components/02_file/FileExplorer')
  const result = await act(async () => render(<FileExplorer />))
  // lazy 루트 로드 대기
  await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
  return result
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.workspaceOpen.mockResolvedValue({ rootPath: null, tree: null })
  mockFsListDir.mockImplementation(({ relDir, rootId }: { relDir: string; rootId?: string }) => {
    if (rootId === 'ref-1' && relDir === '') {
      return Promise.resolve({
        entries: [{ name: 'ref-file.ts', path: 'ref-file.ts', kind: 'file' }],
      })
    }
    if (relDir === '') {
      return Promise.resolve({
        entries: [
          { name: 'app.ts', path: 'app.ts', kind: 'file' },
          { name: 'index.ts', path: 'index.ts', kind: 'file' },
        ],
      })
    }
    return Promise.resolve({ entries: [] })
  })
  mockListFiles.mockResolvedValue({ files: ['app.ts', 'index.ts'] })
})
afterEach(() => cleanup())

describe('F15-01 FileExplorer — 헤더 + 폴더 리스트', () => {
  it('.fe-head 가 존재하고 .fe-title 에 "탐색기" 텍스트가 있다', async () => {
    const { container } = await renderExplorerWithTree()
    const head = container.querySelector('.fe-head')
    expect(head).toBeTruthy()
    const title = container.querySelector('.fe-head .fe-title')
    expect(title).toBeTruthy()
    expect(title?.textContent?.toLowerCase()).toContain('탐색기')
  })

  it('.fe-folders 가 존재하고 .fe-frow.main 이 project명을 포함한다', async () => {
    const { container } = await renderExplorerWithTree()
    const folders = container.querySelector('.fe-folders')
    expect(folders).toBeTruthy()
    const mainRow = container.querySelector('.fe-frow.main')
    expect(mainRow).toBeTruthy()
    expect(mainRow?.textContent).toContain('myproject')
  })

  it('.fe-frow.main 에 "Ctrl O" kbd 힌트가 있다 (레퍼런스 없을 때)', async () => {
    const { container } = await renderExplorerWithTree([])
    const mainRow = container.querySelector('.fe-frow.main')
    expect(mainRow).toBeTruthy()
    // Ctrl O kbd 또는 메인칩 존재
    const kbd = mainRow?.querySelector('.kbd')
    const chip = mainRow?.querySelector('.f-main-chip')
    expect(kbd ?? chip).toBeTruthy()
  })

  it('.fe-folder-add (폴더 추가 점선 버튼)이 존재한다', async () => {
    const { container } = await renderExplorerWithTree()
    expect(container.querySelector('.fe-folder-add')).toBeTruthy()
  })

  it('검색창 .fe-search 안에 .kbd(Ctrl F) 힌트가 있다', async () => {
    const { container } = await renderExplorerWithTree()
    const kbd = container.querySelector('.fe-search .kbd')
    expect(kbd).toBeTruthy()
  })
})

describe('F15-01 FileExplorer — 빈상태 (.fe-blank)', () => {
  it('트리 없을 때 .fe-blank 와 .fe-blank-btn 이 렌더된다', async () => {
    const { container } = await renderExplorerEmpty()
    expect(container.querySelector('.fe-blank')).toBeTruthy()
    expect(container.querySelector('.fe-blank-btn')).toBeTruthy()
  })

  it('.fe-blank-btn 클릭 → workspaceOpen 호출', async () => {
    await renderExplorerEmpty()
    const btn = screen.getByRole('button', { name: /폴더 선택/i })
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(mockApi.workspaceOpen).toHaveBeenCalledOnce()
  })

  it('.file-explorer--empty 클래스가 사라지고 .fe-blank 로 대체된다', async () => {
    const { container } = await renderExplorerEmpty()
    expect(container.querySelector('.file-explorer--empty')).toBeNull()
    expect(container.querySelector('.fe-blank')).toBeTruthy()
  })
})

describe('F15-01 FileExplorer — viewing 모델 (레퍼런스 폴더 스위처)', () => {
  it('레퍼런스 폴더 .fe-frow (non-main)가 존재한다', async () => {
    const { container } = await renderExplorerWithTree([
      { id: 'ref-1', name: 'refproject', tree: refTree },
    ])
    // main 아닌 fe-frow 존재
    const frows = container.querySelectorAll('.fe-frow:not(.main)')
    expect(frows.length).toBeGreaterThanOrEqual(1)
  })

  it('레퍼런스 .fe-frow 클릭 → ref 트리가 표시되고 메인 트리 파일 숨김', async () => {
    const { container } = await renderExplorerWithTree([
      { id: 'ref-1', name: 'refproject', tree: refTree },
    ])
    // 초기: 메인 트리 파일 표시
    expect(screen.getByText('app.ts')).toBeTruthy()
    // 레퍼런스 행 클릭
    const refRow = container.querySelector('.fe-frow:not(.main)')
    expect(refRow).toBeTruthy()
    await act(async () => {
      fireEvent.click(refRow!)
    })
    // ref-file.ts 표시, 메인 트리 파일은 숨김
    expect(screen.getByText('ref-file.ts')).toBeTruthy()
    expect(screen.queryByText('app.ts')).toBeNull()
  })

  it('메인 .fe-frow 클릭 → 메인 트리 복귀', async () => {
    const { container } = await renderExplorerWithTree([
      { id: 'ref-1', name: 'refproject', tree: refTree },
    ])
    // ref로 전환
    const refRow = container.querySelector('.fe-frow:not(.main)')
    await act(async () => { fireEvent.click(refRow!) })
    expect(screen.getByText('ref-file.ts')).toBeTruthy()
    // 메인으로 복귀
    const mainRow = container.querySelector('.fe-frow.main')
    await act(async () => { fireEvent.click(mainRow!) })
    expect(screen.getByText('app.ts')).toBeTruthy()
    expect(screen.queryByText('ref-file.ts')).toBeNull()
  })

  it('이미 메인 보기일 때 메인 .fe-frow 클릭 → 폴더 선택(openWorkspace) 호출 (다른 폴더로 변경)', async () => {
    const { container } = await renderExplorerWithTree() // viewing='' (메인)
    const mainRow = container.querySelector('.fe-frow.main')
    await act(async () => { fireEvent.click(mainRow!) })
    // 메인 보기 상태에서 메인 행 클릭 = 폴더 선택 다이얼로그 열기
    expect(mockApi.workspaceOpen).toHaveBeenCalled()
  })

  it('.fe-ref-section 이 제거되었다', async () => {
    const { container } = await renderExplorerWithTree([
      { id: 'ref-1', name: 'refproject', tree: refTree },
    ])
    expect(container.querySelector('.fe-ref-section')).toBeNull()
  })
})

describe('F15-01 FileExplorer — 기존 동작 회귀', () => {
  it('.fe-tree / .fe-file 셀렉터가 유지된다', async () => {
    const { container } = await renderExplorerWithTree()
    expect(container.querySelector('.fe-tree')).toBeTruthy()
    expect(container.querySelectorAll('.fe-file').length).toBeGreaterThanOrEqual(2)
  })

  it('.fe-file 클릭 → fsRead(window.api)가 호출된다 (store 액션 경유 IPC)', async () => {
    await renderExplorerWithTree()
    const fileBtns = screen.getAllByRole('button')
    const appTsBtn = fileBtns.find((b) => b.textContent?.includes('app.ts') && b.classList.contains('fe-file'))
    expect(appTsBtn).toBeTruthy()
    await act(async () => { fireEvent.click(appTsBtn!) })
    // openFile store 액션이 window.api.fsRead를 호출함
    expect(mockApi.fsRead).toHaveBeenCalled()
  })

  it('검색 필터 회귀 — 입력 시 .fe-file 결과가 필터된다', async () => {
    const { container } = await renderExplorerWithTree()
    const input = screen.getByLabelText('파일 검색')
    await act(async () => {
      fireEvent.change(input, { target: { value: 'app' } })
    })
    const files = Array.from(container.querySelectorAll('.fe-file .fe-node-name')).map(
      (n) => n.textContent
    )
    expect(files).toContain('app.ts')
    expect(files).not.toContain('index.ts')
  })
})
