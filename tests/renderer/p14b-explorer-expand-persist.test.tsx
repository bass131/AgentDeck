// @vitest-environment jsdom
/**
 * p14b-explorer-expand-persist.test.tsx — P14b 탐색기 폴리싱 TDD (실패 먼저).
 *
 * AC:
 *  - 폴더 토글 → setPref가 펼친 경로 배열로 호출됨 (키=워크스페이스 기반)
 *  - 마운트 시 getPref로 저장된 경로 복원 (저장된 폴더가 펼쳐짐)
 *  - 워크스페이스 루트 변경 시 해당 키로 복원
 *  - 루트 없으면 영속 skip (setPref 호출 안 함)
 *  - 기존 f15 회귀 0
 *
 * 신뢰경계: renderer untrusted. getPref/setPref(lib/prefs) 경유만.
 * prefs 모킹: getUiPrefs/setUiPref spy.
 * CRITICAL: prefs 키에 시크릿 0 (폴더 경로는 무해 UI 상태).
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

const mockApi = {
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
  fsRead: vi.fn().mockResolvedValue({ kind: 'text', content: '', language: 'text' }),
  referenceAdd: vi.fn().mockResolvedValue({ reference: null }),
  referenceList: vi.fn().mockResolvedValue({ references: [] }),
  referenceTree: vi.fn().mockResolvedValue({ tree: null }),
  getUiPrefs: mockGetUiPrefs,
  setUiPref: mockSetUiPref,
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

// ── 테스트 픽스처 ──────────────────────────────────────────────────────────────

const mainTree: FileTreeNode = {
  name: 'myproject',
  path: '/ws/myproject',
  kind: 'directory',
  children: [
    {
      name: 'src',
      path: '/ws/myproject/src',
      kind: 'directory',
      children: [
        { name: 'app.ts', path: '/ws/myproject/src/app.ts', kind: 'file' },
      ],
    },
    {
      name: 'tests',
      path: '/ws/myproject/tests',
      kind: 'directory',
      children: [
        { name: 'spec.ts', path: '/ws/myproject/tests/spec.ts', kind: 'file' },
      ],
    },
    { name: 'index.ts', path: '/ws/myproject/index.ts', kind: 'file' },
  ],
}

const mainTree2: FileTreeNode = {
  name: 'otherproject',
  path: '/ws/otherproject',
  kind: 'directory',
  children: [
    {
      name: 'lib',
      path: '/ws/otherproject/lib',
      kind: 'directory',
      children: [
        { name: 'util.ts', path: '/ws/otherproject/lib/util.ts', kind: 'file' },
      ],
    },
  ],
}

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

/**
 * prefs 모듈을 fresh import (캐시 격리) 하고 loadPrefs() 완료 대기.
 * FileExplorer 모듈도 함께 fresh import.
 */
async function freshModules(initialPrefs: Record<string, unknown> = {}) {
  _prefsStore = { ...initialPrefs }
  vi.resetModules()
  // prefs 먼저 로드
  const prefsModule = await import('../../src/renderer/src/lib/prefs')
  await prefsModule.loadPrefs()
  // store, component
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
})

afterEach(() => {
  cleanup()
  vi.resetModules()
})

// ── 키 형식 상수 (원본 expandedKey 패턴) ─────────────────────────────────────

/** 원본 expandedKey(cwd) 패턴 복제 — 테스트에서 키 검증용 */
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

    // src 폴더 토글 버튼 찾기
    const srcDirBtn = container.querySelector('.fe-dir-head[title="/ws/myproject/src"]') as HTMLButtonElement
    expect(srcDirBtn).toBeTruthy()

    await act(async () => {
      fireEvent.click(srcDirBtn)
    })

    // setUiPref가 올바른 키 형식으로 호출됐는지 확인
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

    const srcDirBtn = container.querySelector('.fe-dir-head[title="/ws/myproject/src"]') as HTMLButtonElement
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
      expect(value).toContain('/ws/myproject/src')
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

    const srcDirBtn = container.querySelector('.fe-dir-head[title="/ws/myproject/src"]') as HTMLButtonElement

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
      expect(value).not.toContain('/ws/myproject/src')
    })
  })

  it('마운트 시 저장된 경로를 getPref로 복원한다 — 저장된 폴더가 펼쳐짐', async () => {
    const prefsKey = expandedKey('/ws/myproject')
    const { storeModule, FileExplorer } = await freshModules({
      [prefsKey]: ['/ws/myproject/src'],
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

    // src 폴더가 펼쳐져 있어야 함 → aria-expanded=true
    const srcDirBtn = container.querySelector('.fe-dir-head[title="/ws/myproject/src"]') as HTMLButtonElement
    expect(srcDirBtn).toBeTruthy()
    expect(srcDirBtn.getAttribute('aria-expanded')).toBe('true')

    // 저장된 펼침으로 인해 자식 파일이 표시됨
    expect(container.querySelector('[title="/ws/myproject/src/app.ts"]')).toBeTruthy()
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

    const srcDirBtn = container.querySelector('.fe-dir-head[title="/ws/myproject/src"]') as HTMLButtonElement
    expect(srcDirBtn).toBeTruthy()
    // 저장된 펼침 없음 → 닫힘
    expect(srcDirBtn.getAttribute('aria-expanded')).toBe('false')
  })

  it('워크스페이스 루트 변경 시 새 키로 복원한다', async () => {
    const prefsKey1 = expandedKey('/ws/myproject')
    const prefsKey2 = expandedKey('/ws/otherproject')
    const { storeModule, FileExplorer } = await freshModules({
      [prefsKey1]: ['/ws/myproject/src'],
      [prefsKey2]: ['/ws/otherproject/lib'],
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

    // src 펼쳐진 상태 확인
    const srcBtn = container.querySelector('.fe-dir-head[title="/ws/myproject/src"]') as HTMLButtonElement
    expect(srcBtn?.getAttribute('aria-expanded')).toBe('true')

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

    // lib 폴더가 펼쳐진 상태로 복원
    const libBtn = container.querySelector('.fe-dir-head[title="/ws/otherproject/lib"]') as HTMLButtonElement
    expect(libBtn).toBeTruthy()
    expect(libBtn.getAttribute('aria-expanded')).toBe('true')
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

    const srcDirBtn = container.querySelector('.fe-dir-head[title="/ws/myproject/src"]') as HTMLButtonElement
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

    // .fe-node.fe-file 클래스 조합 존재 확인
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

    // 처음엔 app.ts 안 보임
    expect(container.querySelector('[title="/ws/myproject/src/app.ts"]')).toBeNull()

    // src 폴더 열기
    const srcDirBtn = container.querySelector('.fe-dir-head[title="/ws/myproject/src"]') as HTMLButtonElement
    await act(async () => { fireEvent.click(srcDirBtn) })

    // 이제 app.ts 보임
    expect(container.querySelector('[title="/ws/myproject/src/app.ts"]')).toBeTruthy()
  })
})
