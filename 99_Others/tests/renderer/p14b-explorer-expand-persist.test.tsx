// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import type { FileTreeNode } from '../../../02_Source/shared/ipcContract'

let _prefsStore: Record<string, unknown> = {}

const mockGetUiPrefs = vi.fn(async (): Promise<Record<string, unknown>> => ({ ..._prefsStore }))
const mockSetUiPref = vi.fn(async (req: { key: string; value: unknown }): Promise<{ ok: boolean }> => {
  _prefsStore[req.key] = req.value
  return { ok: true }
})

const mockFsListDir = vi.fn().mockImplementation(({ relDir }: { relDir: string }) => {
  if (relDir === '') {
    return Promise.resolve({
      entries: [
        { name: 'src', path: 'src', kind: 'directory' },
        { name: 'tests', path: 'tests', kind: 'directory' },
        { name: 'index.ts', path: 'index.ts', kind: 'file' },
      ],
    })
  }
  if (relDir === 'src') {
    return Promise.resolve({ entries: [{ name: 'app.ts', path: 'src/app.ts', kind: 'file' }] })
  }
  if (relDir === 'tests') {
    return Promise.resolve({ entries: [{ name: 'spec.ts', path: 'tests/spec.ts', kind: 'file' }] })
  }
  if (relDir === 'lib') {
    return Promise.resolve({ entries: [{ name: 'util.ts', path: 'lib/util.ts', kind: 'file' }] })
  }
  return Promise.resolve({ entries: [] })
})

const mockListFiles = vi.fn().mockResolvedValue({ files: [] })

const mockApi = {
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
  fsRead: vi.fn().mockResolvedValue({ kind: 'text', content: '', language: 'text' }),
  referenceAdd: vi.fn().mockResolvedValue({ reference: null }),
  referenceList: vi.fn().mockResolvedValue({ references: [] }),
  referenceTree: vi.fn().mockResolvedValue({ tree: null }),
  getUiPrefs: mockGetUiPrefs,
  setUiPref: mockSetUiPref,
  fsListDir: mockFsListDir,
  listFiles: mockListFiles,
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

const mainTree: FileTreeNode = {
  name: 'myproject',
  path: '',
  kind: 'directory',
  children: [
    { name: 'src', path: 'src', kind: 'directory' },
    { name: 'tests', path: 'tests', kind: 'directory' },
    { name: 'index.ts', path: 'index.ts', kind: 'file' },
  ],
}

const mainTree2: FileTreeNode = {
  name: 'otherproject',
  path: '',
  kind: 'directory',
  children: [
    { name: 'lib', path: 'lib', kind: 'directory' },
  ],
}

async function freshModules(initialPrefs: Record<string, unknown> = {}) {
  _prefsStore = { ...initialPrefs }
  vi.resetModules()
  const prefsModule = await import('../../../02_Source/renderer/src/lib/prefs')
  await prefsModule.loadPrefs()
  const storeModule = await import('../../../02_Source/renderer/src/store/appStore')
  const { FileExplorer } = await import('../../../02_Source/renderer/src/features/file')
  return { prefsModule, storeModule, FileExplorer }
}

beforeEach(() => {
  _prefsStore = {}
  vi.clearAllMocks()
  mockGetUiPrefs.mockImplementation(async () => ({ ..._prefsStore }))
  mockSetUiPref.mockImplementation(async (req) => {
    _prefsStore[req.key] = req.value
    return { ok: true }
  })
  mockFsListDir.mockImplementation(({ relDir }: { relDir: string }) => {
    if (relDir === '') {
      return Promise.resolve({
        entries: [
          { name: 'src', path: 'src', kind: 'directory' },
          { name: 'tests', path: 'tests', kind: 'directory' },
          { name: 'index.ts', path: 'index.ts', kind: 'file' },
        ],
      })
    }
    if (relDir === 'src') {
      return Promise.resolve({ entries: [{ name: 'app.ts', path: 'src/app.ts', kind: 'file' }] })
    }
    if (relDir === 'tests') {
      return Promise.resolve({ entries: [{ name: 'spec.ts', path: 'tests/spec.ts', kind: 'file' }] })
    }
    if (relDir === 'lib') {
      return Promise.resolve({ entries: [{ name: 'util.ts', path: 'lib/util.ts', kind: 'file' }] })
    }
    return Promise.resolve({ entries: [] })
  })
})

afterEach(() => {
  cleanup()
  vi.resetModules()
})

function expandedKey(root: string): string {
  return 'explorer.expanded:' + root.replace(/[\\/]+/g, '/').toLowerCase()
}

describe('P14b C-3 — 폴더 펼침 상태 영속', () => {
  it('폴더 토글 시 setPref가 워크스페이스 기반 키로 호출된다', async () => {
    const { storeModule, FileExplorer } = await freshModules()
    storeModule.useAppStore.setState({
      fileTree: mainTree,
      workspaceRoot: '/ws/myproject',
      changedFiles: new Set(),
      openedFile: null,
      references: [],
    } as Parameters<typeof storeModule.useAppStore.setState>[0])

    let container!: HTMLElement
    await act(async () => {
      const result = render(<FileExplorer />)
      container = result.container
    })

    await act(async () => { await new Promise((r) => setTimeout(r, 30)) })

    const srcDirBtn = container.querySelector('.fe-dir-head[title="src"]') as HTMLButtonElement
    expect(srcDirBtn).toBeTruthy()

    await act(async () => {
      fireEvent.click(srcDirBtn)
    })

    const expectedKey = expandedKey('/ws/myproject')
    await waitFor(() => {
      expect(mockSetUiPref).toHaveBeenCalledWith(
        expect.objectContaining({ key: expectedKey })
      )
    })
  })

  it('폴더 토글 시 setPref 값이 펼친 경로 배열이다', async () => {
    const { storeModule, FileExplorer } = await freshModules()
    storeModule.useAppStore.setState({
      fileTree: mainTree,
      workspaceRoot: '/ws/myproject',
      changedFiles: new Set(),
      openedFile: null,
      references: [],
    } as Parameters<typeof storeModule.useAppStore.setState>[0])

    let container!: HTMLElement
    await act(async () => {
      const result = render(<FileExplorer />)
      container = result.container
    })

    await act(async () => { await new Promise((r) => setTimeout(r, 30)) })

    const srcDirBtn = container.querySelector('.fe-dir-head[title="src"]') as HTMLButtonElement
    await act(async () => {
      fireEvent.click(srcDirBtn)
    })

    const expectedKey = expandedKey('/ws/myproject')
    await waitFor(() => {
      const calls = mockSetUiPref.mock.calls
      const relevantCall = calls.find((c) => c[0].key === expectedKey)
      expect(relevantCall).toBeTruthy()
      const value = relevantCall![0].value as string[]
      expect(Array.isArray(value)).toBe(true)
      expect(value).toContain('src')
    })
  })

  it('폴더 닫기(토글 재클릭) 시 setPref 값에서 해당 경로가 제거된다', async () => {
    const { storeModule, FileExplorer } = await freshModules()
    storeModule.useAppStore.setState({
      fileTree: mainTree,
      workspaceRoot: '/ws/myproject',
      changedFiles: new Set(),
      openedFile: null,
      references: [],
    } as Parameters<typeof storeModule.useAppStore.setState>[0])

    let container!: HTMLElement
    await act(async () => {
      const result = render(<FileExplorer />)
      container = result.container
    })

    await act(async () => { await new Promise((r) => setTimeout(r, 30)) })

    const srcDirBtn = container.querySelector('.fe-dir-head[title="src"]') as HTMLButtonElement

    await act(async () => { fireEvent.click(srcDirBtn) })
    await act(async () => { fireEvent.click(srcDirBtn) })

    const expectedKey = expandedKey('/ws/myproject')
    await waitFor(() => {
      const calls = mockSetUiPref.mock.calls
      const lastRelevantCall = [...calls].reverse().find((c) => c[0].key === expectedKey)
      expect(lastRelevantCall).toBeTruthy()
      const value = lastRelevantCall![0].value as string[]
      expect(value).not.toContain('src')
    })
  })

  it('마운트 시 저장된 경로를 getPref로 복원한다 — 저장된 폴더가 펼쳐짐', async () => {
    const prefsKey = expandedKey('/ws/myproject')
    const { storeModule, FileExplorer } = await freshModules({
      [prefsKey]: ['src'],
    })

    storeModule.useAppStore.setState({
      fileTree: mainTree,
      workspaceRoot: '/ws/myproject',
      changedFiles: new Set(),
      openedFile: null,
      references: [],
    } as Parameters<typeof storeModule.useAppStore.setState>[0])

    let container!: HTMLElement
    await act(async () => {
      const result = render(<FileExplorer />)
      container = result.container
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60))
    })

    const srcDirBtn = container.querySelector('.fe-dir-head[title="src"]') as HTMLButtonElement
    expect(srcDirBtn).toBeTruthy()
    expect(srcDirBtn.getAttribute('aria-expanded')).toBe('true')

    expect(container.querySelector('[title="src/app.ts"]')).toBeTruthy()
  })

  it('저장된 펼침이 없으면 모든 폴더가 닫힌 상태로 시작한다', async () => {
    const { storeModule, FileExplorer } = await freshModules({})
    storeModule.useAppStore.setState({
      fileTree: mainTree,
      workspaceRoot: '/ws/myproject',
      changedFiles: new Set(),
      openedFile: null,
      references: [],
    } as Parameters<typeof storeModule.useAppStore.setState>[0])

    let container!: HTMLElement
    await act(async () => {
      const result = render(<FileExplorer />)
      container = result.container
    })

    await act(async () => { await new Promise((r) => setTimeout(r, 30)) })

    const srcDirBtn = container.querySelector('.fe-dir-head[title="src"]') as HTMLButtonElement
    expect(srcDirBtn).toBeTruthy()
    expect(srcDirBtn.getAttribute('aria-expanded')).toBe('false')
  })

  it('워크스페이스 루트 변경 시 새 키로 복원한다', async () => {
    const prefsKey1 = expandedKey('/ws/myproject')
    const prefsKey2 = expandedKey('/ws/otherproject')
    const { storeModule, FileExplorer } = await freshModules({
      [prefsKey1]: ['src'],
      [prefsKey2]: ['lib'],
    })

    mockFsListDir.mockImplementation(({ relDir }: { relDir: string }) => {
      if (relDir === '') {
        return Promise.resolve({
          entries: [
            { name: 'src', path: 'src', kind: 'directory' },
            { name: 'tests', path: 'tests', kind: 'directory' },
            { name: 'index.ts', path: 'index.ts', kind: 'file' },
          ],
        })
      }
      if (relDir === 'src') return Promise.resolve({ entries: [{ name: 'app.ts', path: 'src/app.ts', kind: 'file' }] })
      return Promise.resolve({ entries: [] })
    })

    storeModule.useAppStore.setState({
      fileTree: mainTree,
      workspaceRoot: '/ws/myproject',
      changedFiles: new Set(),
      openedFile: null,
      references: [],
    } as Parameters<typeof storeModule.useAppStore.setState>[0])

    let container!: HTMLElement
    await act(async () => {
      const result = render(<FileExplorer />)
      container = result.container
    })

    await act(async () => { await new Promise((r) => setTimeout(r, 60)) })

    const srcBtn = container.querySelector('.fe-dir-head[title="src"]') as HTMLButtonElement
    expect(srcBtn?.getAttribute('aria-expanded')).toBe('true')

    mockFsListDir.mockImplementation(({ relDir }: { relDir: string }) => {
      if (relDir === '') {
        return Promise.resolve({ entries: [{ name: 'lib', path: 'lib', kind: 'directory' }] })
      }
      if (relDir === 'lib') return Promise.resolve({ entries: [{ name: 'util.ts', path: 'lib/util.ts', kind: 'file' }] })
      return Promise.resolve({ entries: [] })
    })

    await act(async () => {
      storeModule.useAppStore.setState({
        fileTree: mainTree2,
        workspaceRoot: '/ws/otherproject',
        changedFiles: new Set(),
        openedFile: null,
        references: [],
      } as Parameters<typeof storeModule.useAppStore.setState>[0])
    })

    await act(async () => { await new Promise((r) => setTimeout(r, 100)) })

    await waitFor(() => {
      const libBtn = container.querySelector('.fe-dir-head[title="lib"]')
      expect(libBtn).toBeTruthy()
      expect(libBtn?.getAttribute('aria-expanded')).toBe('true')
    }, { timeout: 500 })
  })

  it('워크스페이스 루트 없으면 setPref 호출 안 함 (영속 skip)', async () => {
    const { storeModule, FileExplorer } = await freshModules()
    storeModule.useAppStore.setState({
      fileTree: mainTree,
      workspaceRoot: null,
      changedFiles: new Set(),
      openedFile: null,
      references: [],
    } as Parameters<typeof storeModule.useAppStore.setState>[0])

    let container!: HTMLElement
    await act(async () => {
      const result = render(<FileExplorer />)
      container = result.container
    })

    const srcDirBtn = container.querySelector('.fe-dir-head[title="src"]') as HTMLButtonElement
    if (srcDirBtn) {
      await act(async () => {
        fireEvent.click(srcDirBtn)
      })
    }

    await new Promise((r) => setTimeout(r, 50))
    const explorerCalls = mockSetUiPref.mock.calls.filter((c) =>
      String(c[0].key).startsWith('explorer.expanded:')
    )
    expect(explorerCalls.length).toBe(0)
  })
})

describe('P14b D-3 — 파일행 hover 링 (CSS 클래스 존재)', () => {
  it('.fe-node.fe-file 클래스가 존재한다 (hover 스타일 적용 대상)', async () => {
    const { storeModule, FileExplorer } = await freshModules()
    storeModule.useAppStore.setState({
      fileTree: mainTree,
      workspaceRoot: '/ws/myproject',
      changedFiles: new Set(),
      openedFile: null,
      references: [],
    } as Parameters<typeof storeModule.useAppStore.setState>[0])

    let container!: HTMLElement
    await act(async () => {
      const result = render(<FileExplorer />)
      container = result.container
    })

    await act(async () => { await new Promise((r) => setTimeout(r, 30)) })

    const fileNodes = container.querySelectorAll('.fe-node.fe-file')
    expect(fileNodes.length).toBeGreaterThan(0)
  })

  it('.fe-node.fe-dir-head 클래스가 존재한다 (dir hover 스타일 적용 대상)', async () => {
    const { storeModule, FileExplorer } = await freshModules()
    storeModule.useAppStore.setState({
      fileTree: mainTree,
      workspaceRoot: '/ws/myproject',
      changedFiles: new Set(),
      openedFile: null,
      references: [],
    } as Parameters<typeof storeModule.useAppStore.setState>[0])

    let container!: HTMLElement
    await act(async () => {
      const result = render(<FileExplorer />)
      container = result.container
    })

    await act(async () => { await new Promise((r) => setTimeout(r, 30)) })

    const dirNodes = container.querySelectorAll('.fe-node.fe-dir-head')
    expect(dirNodes.length).toBeGreaterThan(0)
  })
})

describe('P14b — 기존 f15 회귀 없음', () => {
  it('.fe-head .fe-title 존재', async () => {
    const { storeModule, FileExplorer } = await freshModules()
    storeModule.useAppStore.setState({
      fileTree: mainTree,
      workspaceRoot: '/ws/myproject',
      changedFiles: new Set(),
      openedFile: null,
      references: [],
    } as Parameters<typeof storeModule.useAppStore.setState>[0])

    let container!: HTMLElement
    await act(async () => {
      const result = render(<FileExplorer />)
      container = result.container
    })

    expect(container.querySelector('.fe-head .fe-title')?.textContent).toContain('탐색기')
  })

  it('폴더 토글 후 자식 파일이 표시된다', async () => {
    const { storeModule, FileExplorer } = await freshModules()
    storeModule.useAppStore.setState({
      fileTree: mainTree,
      workspaceRoot: '/ws/myproject',
      changedFiles: new Set(),
      openedFile: null,
      references: [],
    } as Parameters<typeof storeModule.useAppStore.setState>[0])

    let container!: HTMLElement
    await act(async () => {
      const result = render(<FileExplorer />)
      container = result.container
    })

    await act(async () => { await new Promise((r) => setTimeout(r, 30)) })

    expect(container.querySelector('[title="src/app.ts"]')).toBeNull()

    const srcDirBtn = container.querySelector('.fe-dir-head[title="src"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(srcDirBtn) })

    await act(async () => { await new Promise((r) => setTimeout(r, 30)) })

    expect(container.querySelector('[title="src/app.ts"]')).toBeTruthy()
  })
})
