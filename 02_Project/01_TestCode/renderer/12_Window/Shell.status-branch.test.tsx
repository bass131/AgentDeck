// @vitest-environment jsdom
// M11 G2 — M06 Backlog 3. 상태 줄의 가지 칸은 폴더가 열려 있으면 늘 'main'이었다. 실제 가지를 git에서 읽는다.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { installWindowApi } from '../00_Helpers/windowApiMock'

const ROOT = 'C:\\work\\repo'

const flush = async (): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }

function installMatchMedia(): void {
  const w = window as unknown as { matchMedia: typeof window.matchMedia }
  w.matchMedia = vi.fn(
    (query: string) => ({ media: query, matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList,
  )
}

function statusOf(branch: string) {
  return { root: ROOT, branch, ahead: 0, behind: 0, changes: [], branches: [{ name: branch, current: true }] }
}

afterEach(async () => {
  cleanup()
  const { useAppStore } = await import('@renderer/00_App/appStore')
  useAppStore.setState({ workspaceRoot: null, isRunning: false } as Parameters<typeof useAppStore.setState>[0])
})

async function renderShell(git: { root: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> }) {
  const installed = installWindowApi({
    windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
    getUiPrefs: vi.fn().mockResolvedValue({ 'whatsnew.seenVersion': '0.0.0-test' }),
    checkEngineUpdate: vi.fn().mockResolvedValue({ current: null, latest: null, updateAvailable: false }),
    git: { ...installedGitStubs(), ...git },
  } as unknown as Parameters<typeof installWindowApi>[0])
  installMatchMedia()
  const { loadPrefs } = await import('@renderer/11_Settings/prefs')
  await loadPrefs()
  const { Shell } = await import('@renderer/12_Window/Shell')
  const { useAppStore } = await import('@renderer/00_App/appStore')
  const view = render(<Shell />)
  await flush()
  const branchCell = (): string => view.container.querySelector('.statusbar [data-status-branch]')?.textContent ?? ''
  return { installed, useAppStore, branchCell }
}

function installedGitStubs(): Record<string, unknown> {
  return {
    log: vi.fn().mockResolvedValue([]),
    commitDetail: vi.fn().mockResolvedValue([]),
  }
}

describe('상태 줄 가지 칸 (M06 Backlog 3)', () => {
  it('폴더가 없으면 「—」이고 git을 묻지 않는다', async () => {
    const git = { root: vi.fn().mockResolvedValue(ROOT), status: vi.fn().mockResolvedValue(statusOf('feat/x')) }
    const { installed, branchCell } = await renderShell(git)
    try {
      expect(branchCell()).toBe('—')
      expect(git.root).not.toHaveBeenCalled()
    } finally {
      installed.uninstall()
    }
  })

  it('폴더를 열면 그 저장소의 실제 가지를 보인다 — main이 아닌 가지도', async () => {
    const git = { root: vi.fn().mockResolvedValue(ROOT), status: vi.fn().mockResolvedValue(statusOf('feat/m11-branch')) }
    const { installed, useAppStore, branchCell } = await renderShell(git)
    try {
      await act(async () => { useAppStore.setState({ workspaceRoot: ROOT } as Parameters<typeof useAppStore.setState>[0]) })
      await flush()
      expect(git.root).toHaveBeenCalledWith({ cwd: ROOT })
      expect(git.status).toHaveBeenCalledWith({ root: ROOT })
      expect(branchCell()).toBe('feat/m11-branch')
    } finally {
      installed.uninstall()
    }
  })

  it('git 저장소가 아니면 「—」이다', async () => {
    const git = { root: vi.fn().mockResolvedValue(null), status: vi.fn() }
    const { installed, useAppStore, branchCell } = await renderShell(git)
    try {
      await act(async () => { useAppStore.setState({ workspaceRoot: ROOT } as Parameters<typeof useAppStore.setState>[0]) })
      await flush()
      expect(branchCell()).toBe('—')
      expect(git.status).not.toHaveBeenCalled()
    } finally {
      installed.uninstall()
    }
  })

  it('실행 중에 폴더가 바뀌면 새 폴더의 가지를 바로 읽는다', async () => {
    const ROOT2 = 'C:\\work\\other'
    const git = {
      root: vi.fn(async ({ cwd }: { cwd: string }) => cwd),
      status: vi.fn(async ({ root }: { root: string }) => statusOf(root === ROOT2 ? 'feat/other' : 'main')),
    }
    const { installed, useAppStore, branchCell } = await renderShell(git)
    try {
      await act(async () => { useAppStore.setState({ workspaceRoot: ROOT } as Parameters<typeof useAppStore.setState>[0]) })
      await flush()
      expect(branchCell()).toBe('main')
      await act(async () => { useAppStore.setState({ isRunning: true } as Parameters<typeof useAppStore.setState>[0]) })
      await flush()
      await act(async () => { useAppStore.setState({ workspaceRoot: ROOT2 } as Parameters<typeof useAppStore.setState>[0]) })
      await flush()
      expect(branchCell()).toBe('feat/other')
    } finally {
      installed.uninstall()
    }
  })

  it('실행이 끝나면 다시 읽는다 — 에이전트가 가지를 바꿨을 수 있다', async () => {
    const git = {
      root: vi.fn().mockResolvedValue(ROOT),
      status: vi.fn().mockResolvedValueOnce(statusOf('main')).mockResolvedValue(statusOf('fix/after-run')),
    }
    const { installed, useAppStore, branchCell } = await renderShell(git)
    try {
      await act(async () => { useAppStore.setState({ workspaceRoot: ROOT } as Parameters<typeof useAppStore.setState>[0]) })
      await flush()
      expect(branchCell()).toBe('main')
      await act(async () => { useAppStore.setState({ isRunning: true } as Parameters<typeof useAppStore.setState>[0]) })
      await flush()
      await act(async () => { useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0]) })
      await flush()
      expect(branchCell()).toBe('fix/after-run')
    } finally {
      installed.uninstall()
    }
  })
})
