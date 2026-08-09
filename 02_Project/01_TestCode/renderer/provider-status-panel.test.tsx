// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import type { BackendStatus } from '../../../02_Project/00_Source/shared/ipcContract'

const mockListBackends = vi.fn<() => Promise<BackendStatus[]>>()

const SAMPLE_BACKENDS: BackendStatus[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    available: true,
    version: '0.3.186',
    latestVersion: '0.3.190',
    authed: true,
  },
  {
    id: 'codex',
    name: 'Codex',
    available: false,
    version: null,
    latestVersion: null,
    authed: false,
  },
]

const baseApi = {
  listBackends: mockListBackends,
  getEngineState: vi.fn().mockResolvedValue({ available: true, authed: true, version: '0.3.186' }),
  listSkills: vi.fn().mockResolvedValue([]),
  setSkillEnabled: vi.fn().mockResolvedValue({ ok: true }),
  listMcpServers: vi.fn().mockResolvedValue([]),
  setMcpEnabled: vi.fn().mockResolvedValue({ ok: true }),
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
}

Object.defineProperty(window, 'api', {
  value: baseApi,
  writable: true,
  configurable: true,
})

async function renderPanel(): Promise<void> {
  vi.resetModules()
  const { ProviderStatusPanel } = await import(
    '../../../02_Project/00_Source/renderer/src/features/agent/ProviderStatusPanel'
  )
  await act(async () => {
    render(<ProviderStatusPanel />)
  })
  await act(async () => {})
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  mockListBackends.mockResolvedValue(SAMPLE_BACKENDS)
  ;(window as unknown as { api: unknown }).api = {
    ...baseApi,
    listBackends: mockListBackends,
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('B1 ProviderStatusPanel — listBackends IPC 호출', () => {
  it('마운트 시 window.api.listBackends()가 1회 호출된다', async () => {
    await renderPanel()
    expect(mockListBackends).toHaveBeenCalledTimes(1)
  })
})

describe('B1 ProviderStatusPanel — claude-code 카드', () => {
  it('"Claude Code" 이름이 렌더된다', async () => {
    await renderPanel()
    expect(screen.getByText('Claude Code')).toBeTruthy()
  })

  it('"사용 가능" pill이 렌더된다', async () => {
    await renderPanel()
    expect(screen.getByText('사용 가능')).toBeTruthy()
  })

  it('"인증됨" pill이 렌더된다', async () => {
    await renderPanel()
    expect(screen.getByText('인증됨')).toBeTruthy()
  })
})

describe('B1 ProviderStatusPanel — codex 카드', () => {
  it('"Codex" 이름이 렌더된다', async () => {
    await renderPanel()
    expect(screen.getByText('Codex')).toBeTruthy()
  })

  it('"사용 불가" pill이 렌더된다', async () => {
    await renderPanel()
    expect(screen.getByText('사용 불가')).toBeTruthy()
  })

  it('available=false 백엔드는 인증 pill을 표시하지 않는다', async () => {
    await renderPanel()
    const authedPills = screen.queryAllByText('인증됨')
    expect(authedPills.length).toBe(1)
    expect(screen.queryByText('미인증')).toBeNull()
  })

  it('"Track 2 — 추후 지원 예정" 안내가 표시된다', async () => {
    await renderPanel()
    expect(screen.getByText(/Track 2/)).toBeTruthy()
  })
})

describe('B1 ProviderStatusPanel — 버전 + 업데이트 배지', () => {
  it('버전 "0.3.186"이 표시된다', async () => {
    await renderPanel()
    expect(screen.getByText('0.3.186')).toBeTruthy()
  })

  it('latestVersion != version 시 "업데이트 v0.3.190" 배지가 표시된다', async () => {
    await renderPanel()
    expect(screen.getByText(/업데이트.*0\.3\.190/)).toBeTruthy()
  })
})

describe('B1 ProviderStatusPanel — listBackends 실패 graceful', () => {
  it('listBackends throw 시 크래시 없이 빈 상태로 렌더된다', async () => {
    mockListBackends.mockRejectedValueOnce(new Error('IPC 오류'))
    await expect(renderPanel()).resolves.not.toThrow()
    expect(screen.queryByText('Claude Code')).toBeNull()
  })
})

describe('B1 스토어 — selectBackends 셀렉터', () => {
  it('selectBackends는 BackendStatus[] 를 반환한다', async () => {
    vi.resetModules()
    const { selectBackends, useAppStore } = await import(
      '../../../02_Project/00_Source/renderer/src/store/appStore'
    )
    const result = selectBackends(useAppStore.getState())
    expect(Array.isArray(result)).toBe(true)
  })
})
