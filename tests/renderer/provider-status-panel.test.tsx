// @vitest-environment jsdom
/**
 * provider-status-panel.test.tsx — B1 ProviderStatusPanel TDD.
 *
 * 검증 대상:
 *  1. 마운트 시 window.api.listBackends() 1회 호출.
 *  2. claude-code: "Claude Code" 이름 렌더.
 *  3. claude-code: "사용 가능" pill 렌더.
 *  4. claude-code: "인증됨" pill 렌더.
 *  5. codex: "Codex" 이름 렌더.
 *  6. codex: "사용 불가" pill 렌더.
 *  7. codex: 인증 pill 숨김(available=false 시).
 *  8. codex: "Track 2 — 추후 지원 예정" 안내 표시.
 *  9. claude-code: 버전 "0.3.186" 표시.
 * 10. 업데이트 배지 — latestVersion != version 시 "업데이트 v0.3.190" 표시.
 * 11. listBackends 실패(throw) → graceful (백엔드 없이 렌더, 크래시 없음).
 * 12. 스토어 selectBackends 셀렉터 타입 단언.
 *
 * 신뢰경계:
 *   - window.api.listBackends mock — fs/Node 직접 0.
 *   - BackendStatus 6필드만 소비 — 토큰/시크릿 표시 0.
 *   - 채널명 문자열 하드코딩 0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import type { BackendStatus } from '../../src/shared/ipc-contract'

// ── window.api mock ────────────────────────────────────────────────────────────
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

// window.api 전체 mock
const baseApi = {
  listBackends: mockListBackends,
  // SettingsModal 사용 채널 (회귀 방지)
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

// ── 헬퍼: 패널 렌더 ────────────────────────────────────────────────────────────
async function renderPanel(): Promise<void> {
  vi.resetModules()
  const { ProviderStatusPanel } = await import(
    '../../src/renderer/src/components/05_agent/ProviderStatusPanel'
  )
  await act(async () => {
    render(<ProviderStatusPanel />)
  })
  // listBackends Promise resolve 대기
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

// ══════════════════════════════════════════════════════════════════════════════
// 1. listBackends 호출
// ══════════════════════════════════════════════════════════════════════════════

describe('B1 ProviderStatusPanel — listBackends IPC 호출', () => {
  it('마운트 시 window.api.listBackends()가 1회 호출된다', async () => {
    await renderPanel()
    expect(mockListBackends).toHaveBeenCalledTimes(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2~4. claude-code 렌더
// ══════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// 5~8. codex 렌더
// ══════════════════════════════════════════════════════════════════════════════

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
    // "인증됨"은 claude-code에만, "미인증"도 없어야 함(codex는 숨김)
    // 인증됨 pill은 1개(claude-code)만
    const authedPills = screen.queryAllByText('인증됨')
    expect(authedPills.length).toBe(1)
    // 미인증 pill 없어야 함(codex available=false라 숨김)
    expect(screen.queryByText('미인증')).toBeNull()
  })

  it('"Track 2 — 추후 지원 예정" 안내가 표시된다', async () => {
    await renderPanel()
    expect(screen.getByText(/Track 2/)).toBeTruthy()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 9~10. 버전 + 업데이트 배지
// ══════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// 11. graceful 실패
// ══════════════════════════════════════════════════════════════════════════════

describe('B1 ProviderStatusPanel — listBackends 실패 graceful', () => {
  it('listBackends throw 시 크래시 없이 빈 상태로 렌더된다', async () => {
    mockListBackends.mockRejectedValueOnce(new Error('IPC 오류'))
    await expect(renderPanel()).resolves.not.toThrow()
    // 백엔드 카드 없어도 패널 자체는 마운트 유지
    expect(screen.queryByText('Claude Code')).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 12. selectBackends 셀렉터 타입 확인
// ══════════════════════════════════════════════════════════════════════════════

describe('B1 스토어 — selectBackends 셀렉터', () => {
  it('selectBackends는 BackendStatus[] 를 반환한다', async () => {
    vi.resetModules()
    const { selectBackends, useAppStore } = await import(
      '../../src/renderer/src/store/appStore'
    )
    const result = selectBackends(useAppStore.getState())
    expect(Array.isArray(result)).toBe(true)
  })
})
