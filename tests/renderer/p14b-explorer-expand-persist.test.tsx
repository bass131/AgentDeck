// @vitest-environment jsdom
/**
 * p14b-explorer-expand-persist.test.tsx — P14b 탐색기 폴리싱 TDD (M7 lazy 로딩 개정).
 *
 * M7 변경사항:
 *   - FileExplorer가 lazy 로딩을 사용하므로 fsListDir mock 필수
 *   - buildTree는 root+1레벨 shallow. 자식은 fsListDir 응답에서 옴.
 *   - expanded prefs: root-상대 POSIX 경로(절대경로 → 상대경로로 변경)
 *   - 폴더 노드의 title 속성은 node.path(root-상대) = 'src', 'tests' 등
 *
 * AC:
 *  - 폴더 토글 → setPref가 펼친 경로 배열로 호출됨 (키=워크스페이스 기반)
 *  - 마운트 시 getPref로 저장된 경로 복원 (저장된 폴더가 펼쳐짐)
 *  - 워크스페이스 루트 변경 시 해당 키로 복원
 *  - 루트 없으면 영속 skip (setPref 호출 안 함)
 *  - 기존 f15 회귀 0
 *
 * 신뢰경계: renderer untrusted. getPref/setPref(lib/prefs) 경유만.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import type { FileTreeNode } from '../../src/shared/ipc-contract'

// ── window.api mock ────────────────────────────────────────────────────────────

/** 인메모리 prefs 저장소 (테스트 간 초기화) */
let _prefsStore: Record<string, unknown> = {}

const mockGetUiPrefs = vi.fn(async (): Promise<Record<string, unknown>> => ({ ..._prefsStore }))
const mockSetUiPref = vi.fn(async (req: { key: string; value: unknown }): Promise<{ ok: boolean }> => {
  _prefsStore[req.key] = req.value
  return { ok: true }
})

// M7: lazy 폴더 로딩을 위한 fsListDir mock
// relDir='' → mainTree 1레벨, 'src' → src 하위, 'tests' → tests 하위, 'lib' → lib 하위
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

// ── 테스트 픽스처 ──────────────────────────────────────────────────────────────
// M7: buildTree는 root+1레벨 shallow. children 없음(lazy 로딩).
// node.path = root-상대 POSIX ('src', 'tests', ...)

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

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

async function freshModules(initialPrefs: Record<string, unknown> = {}) {
  _prefsStore = { ...initialPrefs }
  vi.resetModules()
  const prefsModule = await import('../../src/renderer/src/lib/prefs')
  await prefsModule.loadPrefs()
  const storeModule = await import('../../src/renderer/src/store/appStore')
  const { FileExplorer } = await import('../../src/renderer/src/components/FileExplorer')
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

// ── 키 형식 상수 ──────────────────────────────────────────────────────────────

function expandedKey(root: string): string {
  return 'explorer.expanded:' + root.replace(/[\\/]+/g, '/').toLowerCase()
}

// ── 테스트 스위트 ──────────────────────────────────────────────────────────────

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

    // lazy 루트 로드 대기
    await act(async () => { await new Promise((r) => setTimeout(r, 30)) })

    // M7: src 폴더의 title = root-상대 경로 'src'
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
      // M7: root-상대 경로 'src'가 저장됨
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

    // 열기
    await act(async () => { fireEvent.click(srcDirBtn) })
    // 닫기
    await act(async () => { fireEvent.click(srcDirBtn) })

    const expectedKey = expandedKey('/ws/myproject')
    await waitFor(() => {
      const calls = mockSetUiPref.mock.calls
      const lastRelevantCall = [...calls].reverse().find((c) => c[0].key === expectedKey)
      expect(lastRelevantCall).toBeTruthy()
      const value = lastRelevantCall![0].value as string[]
      // M7: 닫기 후 'src'가 제거됨
      expect(value).not.toContain('src')
    })
  })

  it('마운트 시 저장된 경로를 getPref로 복원한다 — 저장된 폴더가 펼쳐짐', async () => {
    const prefsKey = expandedKey('/ws/myproject')
    // M7: prefs는 root-상대 경로로 저장
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

    // lazy 로드 대기 (prefs 복원 + fsListDir 완료)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60))
    })

    // src 폴더가 펼쳐져 있어야 함 → aria-expanded=true
    const srcDirBtn = container.querySelector('.fe-dir-head[title="src"]') as HTMLButtonElement
    expect(srcDirBtn).toBeTruthy()
    expect(srcDirBtn.getAttribute('aria-expanded')).toBe('true')

    // 저장된 펼침으로 인해 자식 파일이 표시됨 (M7: path=상대경로)
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
    // 저장된 펼침 없음 → 닫힘
    expect(srcDirBtn.getAttribute('aria-expanded')).toBe('false')
  })

  it('워크스페이스 루트 변경 시 새 키로 복원한다', async () => {
    const prefsKey1 = expandedKey('/ws/myproject')
    const prefsKey2 = expandedKey('/ws/otherproject')
    // M7: 상대경로로 저장
    const { storeModule, FileExplorer } = await freshModules({
      [prefsKey1]: ['src'],
      [prefsKey2]: ['lib'],
    })

    // 첫 워크스페이스용 mock
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

    // 첫 워크스페이스
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

    // src 펼쳐진 상태 확인
    const srcBtn = container.querySelector('.fe-dir-head[title="src"]') as HTMLButtonElement
    expect(srcBtn?.getAttribute('aria-expanded')).toBe('true')

    // 워크스페이스 전환 전에 mock을 otherproject 용으로 교체
    mockFsListDir.mockImplementation(({ relDir }: { relDir: string }) => {
      if (relDir === '') {
        return Promise.resolve({ entries: [{ name: 'lib', path: 'lib', kind: 'directory' }] })
      }
      if (relDir === 'lib') return Promise.resolve({ entries: [{ name: 'util.ts', path: 'lib/util.ts', kind: 'file' }] })
      return Promise.resolve({ entries: [] })
    })

    // 워크스페이스 전환
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

    // lib 폴더가 펼쳐진 상태로 복원
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
      workspaceRoot: null, // 루트 없음
      changedFiles: new Set(),
      openedFile: null,
      references: [],
    } as Parameters<typeof storeModule.useAppStore.setState>[0])

    let container!: HTMLElement
    await act(async () => {
      const result = render(<FileExplorer />)
      container = result.container
    })

    // 루트 없이는 fsListDir도 호출 안 됨. buildTree fallback만 표시.
    const srcDirBtn = container.querySelector('.fe-dir-head[title="src"]') as HTMLButtonElement
    if (srcDirBtn) {
      await act(async () => {
        fireEvent.click(srcDirBtn)
      })
    }

    // 루트 없으면 setPref 호출 없어야 함
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

    // lazy 루트 로드 대기
    await act(async () => { await new Promise((r) => setTimeout(r, 30)) })

    // .fe-node.fe-file 클래스 조합 존재 확인 (lazy 로드로 index.ts가 루트에 있음)
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

    // 처음엔 app.ts 안 보임(src 미펼침)
    expect(container.querySelector('[title="src/app.ts"]')).toBeNull()

    // src 폴더 열기 (M7: title='src')
    const srcDirBtn = container.querySelector('.fe-dir-head[title="src"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(srcDirBtn) })

    // lazy 로드 대기
    await act(async () => { await new Promise((r) => setTimeout(r, 30)) })

    // 이제 app.ts 보임 (M7: path='src/app.ts')
    expect(container.querySelector('[title="src/app.ts"]')).toBeTruthy()
  })
})
