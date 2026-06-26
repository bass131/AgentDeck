// @vitest-environment jsdom
/**
 * explorer.test.tsx — F2-02 Explorer 개편 DOM 단언(M7 lazy 로딩 개정).
 *
 * M7 변경사항:
 *   - fsListDir mock 필수 (lazy 폴더 로딩)
 *   - listFiles mock 필수 (검색 전환)
 *   - 검색은 listFiles 기반(treeFilter 아님) → 깊은 파일 검색 가능
 *   - 변경 파일 배지: .chg-edit 클래스 (원본 Explorer 패턴)
 *   - 루트 1레벨은 buildTree fallback 또는 fsListDir 응답
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import type { FileTreeNode } from '../../src/shared/ipc-contract'

// window.api mock (M7: fsListDir + listFiles 추가)
const mockFsListDir = vi.fn().mockImplementation(({ relDir }: { relDir: string }) => {
  if (relDir === '') {
    return Promise.resolve({
      entries: [
        { name: 'app.ts', path: 'app.ts', kind: 'file' },
        { name: 'README.md', path: 'README.md', kind: 'file' },
        { name: 'src', path: 'src', kind: 'directory' },
      ],
    })
  }
  if (relDir === 'src') {
    return Promise.resolve({
      entries: [
        { name: 'index.ts', path: 'src/index.ts', kind: 'file' },
        { name: 'util.css', path: 'src/util.css', kind: 'file' },
      ],
    })
  }
  return Promise.resolve({ entries: [] })
})

const mockListFiles = vi.fn().mockResolvedValue({
  files: ['app.ts', 'README.md', 'src/index.ts', 'src/util.css'],
})

Object.defineProperty(window, 'api', {
  value: {
    workspaceOpen: async () => ({ rootPath: null, tree: null }),
    fsRead: async () => ({ kind: 'text', content: '', language: 'text' }),
    referenceAdd: async () => ({ reference: null }),
    referenceList: async () => ({ references: [] }),
    referenceTree: async () => ({ tree: null }),
    getUiPrefs: async () => ({}),
    setUiPref: async () => ({ ok: true }),
    fsListDir: mockFsListDir,
    listFiles: mockListFiles,
  },
  writable: true,
  configurable: true,
})

// M7: buildTree는 root+1레벨 shallow
const tree: FileTreeNode = {
  name: 'root',
  path: '',
  kind: 'directory',
  children: [
    { name: 'app.ts', path: 'app.ts', kind: 'file' },
    { name: 'README.md', path: 'README.md', kind: 'file' },
    { name: 'src', path: 'src', kind: 'directory' }, // children 없음(lazy)
  ],
}

async function renderExplorer() {
  vi.resetModules()
  const { useAppStore } = await import('../../src/renderer/src/store/appStore')
  const prefsModule = await import('../../src/renderer/src/lib/prefs')
  await prefsModule.loadPrefs()
  useAppStore.setState({
    fileTree: tree,
    workspaceRoot: '/ws',
    changedFiles: new Set(['app.ts']),
    openedFile: null,
    references: [],
  } as Parameters<typeof useAppStore.setState>[0])
  const { FileExplorer } = await import('../../src/renderer/src/components/02_file/FileExplorer')
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(<FileExplorer />)
  })
  // lazy 루트 로드 대기
  await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
  return result
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFsListDir.mockImplementation(({ relDir }: { relDir: string }) => {
    if (relDir === '') {
      return Promise.resolve({
        entries: [
          { name: 'app.ts', path: 'app.ts', kind: 'file' },
          { name: 'README.md', path: 'README.md', kind: 'file' },
          { name: 'src', path: 'src', kind: 'directory' },
        ],
      })
    }
    if (relDir === 'src') {
      return Promise.resolve({
        entries: [
          { name: 'index.ts', path: 'src/index.ts', kind: 'file' },
          { name: 'util.css', path: 'src/util.css', kind: 'file' },
        ],
      })
    }
    return Promise.resolve({ entries: [] })
  })
  mockListFiles.mockResolvedValue({ files: ['app.ts', 'README.md', 'src/index.ts', 'src/util.css'] })
})
afterEach(() => {
  cleanup()
  vi.resetModules()
})

describe('Explorer 개편 (F2-02)', () => {
  it('파일 행에 파일타입 배지(.ftbadge)가 렌더된다', async () => {
    const { container } = await renderExplorer()
    // lazy 로드 후 루트 1레벨 파일들이 표시됨
    expect(container.querySelectorAll('.ftbadge').length).toBeGreaterThanOrEqual(1)
  })

  it('중첩 디렉토리는 기본 접힘 — 자식 미표시, chevron 토글 시 표시', async () => {
    const { container } = await renderExplorer()
    // 기본: src/index.ts 안 보임(src 접힘)
    expect(screen.queryByText('index.ts')).toBeNull()
    // 루트 파일은 보임(lazy 로드 완료)
    expect(screen.getByText('app.ts')).toBeTruthy()
    // src 디렉토리 클릭 → 펼침 + lazy 로드
    const beforeFiles = container.querySelectorAll('.fe-file').length
    await act(async () => {
      fireEvent.click(screen.getByText('src'))
    })
    // lazy 로드 대기
    await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
    expect(screen.getByText('index.ts')).toBeTruthy()
    expect(container.querySelectorAll('.fe-file').length).toBeGreaterThan(beforeFiles)
  })

  it('검색 입력 시 listFiles 기반 평탄 결과로 필터된다', async () => {
    const { container } = await renderExplorer()
    const input = screen.getByLabelText('파일 검색')
    await act(async () => {
      fireEvent.change(input, { target: { value: 'css' } })
    })
    // allFiles 로드 대기
    await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
    // util.css가 결과에 포함 (B1: listFiles 기반으로 깊은 파일도 검색됨)
    const files = Array.from(container.querySelectorAll('.fe-node-name')).map(
      (n) => n.textContent
    )
    expect(files).toContain('util.css')
    expect(files).not.toContain('app.ts')
  })

  it('변경 파일은 chg- 클래스(변경 표시)', async () => {
    const { container } = await renderExplorer()
    // M7: 변경 파일은 .chg-edit 클래스 (원본 Explorer.tsx chg-${tag} 패턴)
    const changed = container.querySelector('.chg-edit')
    expect(changed).toBeTruthy()
  })
})
