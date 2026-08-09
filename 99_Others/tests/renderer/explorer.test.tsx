// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import type { FileTreeNode } from '../../../02_Source/shared/ipcContract'

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

const tree: FileTreeNode = {
  name: 'root',
  path: '',
  kind: 'directory',
  children: [
    { name: 'app.ts', path: 'app.ts', kind: 'file' },
    { name: 'README.md', path: 'README.md', kind: 'file' },
    { name: 'src', path: 'src', kind: 'directory' },
  ],
}

async function renderExplorer() {
  vi.resetModules()
  const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
  const prefsModule = await import('../../../02_Source/renderer/src/lib/prefs')
  await prefsModule.loadPrefs()
  useAppStore.setState({
    fileTree: tree,
    workspaceRoot: '/ws',
    changedFiles: new Set(['app.ts']),
    openedFile: null,
    references: [],
  } as Parameters<typeof useAppStore.setState>[0])
  const { FileExplorer } = await import('../../../02_Source/renderer/src/features/file')
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(<FileExplorer />)
  })
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
    expect(container.querySelectorAll('.ftbadge').length).toBeGreaterThanOrEqual(1)
  })

  it('중첩 디렉토리는 기본 접힘 — 자식 미표시, chevron 토글 시 표시', async () => {
    const { container } = await renderExplorer()
    expect(screen.queryByText('index.ts')).toBeNull()
    expect(screen.getByText('app.ts')).toBeTruthy()
    const beforeFiles = container.querySelectorAll('.fe-file').length
    await act(async () => {
      fireEvent.click(screen.getByText('src'))
    })
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
    await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
    const files = Array.from(container.querySelectorAll('.fe-node-name')).map(
      (n) => n.textContent
    )
    expect(files).toContain('util.css')
    expect(files).not.toContain('app.ts')
  })

  it('변경 파일은 chg- 클래스(변경 표시)', async () => {
    const { container } = await renderExplorer()
    const changed = container.querySelector('.chg-edit')
    expect(changed).toBeTruthy()
  })
})
