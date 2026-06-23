// @vitest-environment jsdom
/**
 * settings-mcp-ipc.test.tsx — P5b McpView IPC 실배선 TDD.
 *
 * 검증 대상:
 *  1. 마운트 시 window.api.listMcpServers() 호출 → 반환된 서버들 렌더(name/scope 배지/transport 칩/detail).
 *  2. 동명/다른 origin 서버 2개 → key 충돌 없이 둘 다 렌더.
 *  3. scope 탭 전환 필터/카운트 정확.
 *  4. 토글 → setMcpEnabled({name, enabled}) 정확 인자 + state 반영(낙관적 갱신).
 *  5. 빈 배열 → scope별 빈 상태 안내문.
 *  6. 새로고침 버튼 → listMcpServers 재호출.
 *  7. listMcpServers 실패 → graceful (빈 목록, 크래시 없음).
 *  8. setMcpEnabled 실패 → graceful (롤백, 크래시 없음).
 *
 * 신뢰경계: window.api.listMcpServers/setMcpEnabled mock — fs/Node 직접 0.
 * 기존 SettingsModal 회귀(테마 라벨·nav·Skill P5a) 영향 없음.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react'
import type { McpServerInfo } from '../../src/shared/ipc-contract'

// ── window.api 최소 mock ────────────────────────────────────────────────────
const mockListMcpServers = vi.fn<() => Promise<McpServerInfo[]>>()
const mockSetMcpEnabled = vi.fn<(req: { name: string; enabled: boolean }) => Promise<{ ok: boolean }>>()
const mockListSkills = vi.fn().mockResolvedValue([])
const mockSetSkillEnabled = vi.fn().mockResolvedValue({ ok: true })

const SAMPLE_MCP: McpServerInfo[] = [
  {
    name: 'filesystem',
    scope: 'global',
    origin: 'user',
    transport: 'stdio',
    detail: 'npx',
    enabled: true,
  },
  {
    name: 'web-search',
    scope: 'global',
    origin: 'user',
    transport: 'http',
    detail: 'api.example.com',
    enabled: false,
  },
  {
    name: 'project-tools',
    scope: 'local',
    origin: 'project',
    transport: 'stdio',
    detail: 'node',
    enabled: true,
  },
]

// window.api 전체 mock — SettingsModal이 사용하는 모든 채널 포함
const baseApi = {
  listMcpServers: mockListMcpServers,
  setMcpEnabled: mockSetMcpEnabled,
  listSkills: mockListSkills,
  setSkillEnabled: mockSetSkillEnabled,
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
}

Object.defineProperty(window, 'api', {
  value: baseApi,
  writable: true,
  configurable: true,
})

// ── 헬퍼: MCP 탭 열기 ────────────────────────────────────────────────────
async function openMcpTab(): Promise<void> {
  vi.resetModules()
  const { SettingsModal } = await import('../../src/renderer/src/components/SettingsModal')
  await act(async () => {
    render(<SettingsModal onClose={() => {}} />)
  })
  // MCP 탭 클릭
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'MCP' }))
  })
  // listMcpServers Promise resolve 대기
  await act(async () => {})
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  mockListMcpServers.mockResolvedValue(SAMPLE_MCP)
  mockSetMcpEnabled.mockResolvedValue({ ok: true })
  mockListSkills.mockResolvedValue([])
  mockSetSkillEnabled.mockResolvedValue({ ok: true })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// ══════════════════════════════════════════════════════════════════════════════
// 1. 마운트 시 listMcpServers 호출 + 서버 렌더
// ══════════════════════════════════════════════════════════════════════════════

describe('P5b McpView — IPC 마운트 로드', () => {
  it('MCP 탭 진입 시 window.api.listMcpServers()가 1회 호출된다', async () => {
    await openMcpTab()
    expect(mockListMcpServers).toHaveBeenCalledTimes(1)
  })

  it('listMcpServers 반환 서버 이름이 렌더된다', async () => {
    await openMcpTab()
    expect(screen.getByText('filesystem')).toBeTruthy()
    expect(screen.getByText('web-search')).toBeTruthy()
    expect(screen.getByText('project-tools')).toBeTruthy()
  })

  it('scope 배지(전역/로컬)가 렌더된다', async () => {
    await openMcpTab()
    const badges = document.body.querySelectorAll('.scope-badge')
    expect(badges.length).toBeGreaterThan(0)
    const texts = Array.from(badges).map((b) => b.textContent)
    expect(texts.some((t) => t?.includes('전역'))).toBe(true)
    expect(texts.some((t) => t?.includes('로컬'))).toBe(true)
  })

  it('transport 칩(ver-chip)이 렌더된다', async () => {
    await openMcpTab()
    const chips = document.body.querySelectorAll('.ver-chip')
    expect(chips.length).toBeGreaterThan(0)
    // stdio, http 등 transport 값이 포함됨
    const texts = Array.from(chips).map((c) => c.textContent)
    expect(texts.some((t) => t?.includes('stdio') || t?.includes('http') || t?.includes('sse'))).toBe(true)
  })

  it('detail 텍스트가 ext-cmd 에 렌더된다', async () => {
    await openMcpTab()
    // detail 값: 'npx', 'api.example.com', 'node'
    expect(screen.getByText('npx')).toBeTruthy()
    expect(screen.getByText('api.example.com')).toBeTruthy()
    expect(screen.getByText('node')).toBeTruthy()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. 동명/다른 origin 서버 2개 → key 충돌 없이 둘 다 렌더
// ══════════════════════════════════════════════════════════════════════════════

describe('P5b McpView — 동명/다른 origin key 충돌 방지', () => {
  it('동명 서버가 다른 origin에 있어도 둘 다 렌더된다', async () => {
    const dupServers: McpServerInfo[] = [
      { name: 'same-name', scope: 'global', origin: 'user', transport: 'stdio', detail: 'npx', enabled: true },
      { name: 'same-name', scope: 'local', origin: 'project', transport: 'http', detail: 'localhost', enabled: false },
    ]
    mockListMcpServers.mockResolvedValue(dupServers)
    await openMcpTab()
    const items = document.body.querySelectorAll('.ext-item')
    // 전체 탭에서 2개 모두 렌더
    expect(items.length).toBe(2)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. scope 탭 필터/카운트
// ══════════════════════════════════════════════════════════════════════════════

describe('P5b McpView — scope 탭 필터', () => {
  it('전체 탭: 3개 서버가 모두 렌더된다', async () => {
    await openMcpTab()
    const items = document.body.querySelectorAll('.ext-item')
    expect(items.length).toBe(3)
  })

  it('전역 탭: global scope(2개)만 렌더된다', async () => {
    await openMcpTab()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /전역/ }))
    })
    const items = document.body.querySelectorAll('.ext-item')
    expect(items.length).toBe(2)
  })

  it('로컬 탭: local scope(1개)만 렌더된다', async () => {
    await openMcpTab()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /로컬/ }))
    })
    const items = document.body.querySelectorAll('.ext-item')
    expect(items.length).toBe(1)
    expect(screen.getByText('project-tools')).toBeTruthy()
  })

  it('전체 탭 카운트 뱃지가 3을 표시한다', async () => {
    await openMcpTab()
    const allTabBadge = document.body.querySelector('.skill-tab.active .skill-tab-n')
    expect(allTabBadge?.textContent).toBe('3')
  })

  it('전역 탭 카운트 뱃지가 2를 표시한다', async () => {
    await openMcpTab()
    const tabBtns = document.body.querySelectorAll('.skill-tab')
    const globalTabBadge = tabBtns[1]?.querySelector('.skill-tab-n')
    expect(globalTabBadge?.textContent).toBe('2')
  })

  it('로컬 탭 카운트 뱃지가 1을 표시한다', async () => {
    await openMcpTab()
    const tabBtns = document.body.querySelectorAll('.skill-tab')
    const localTabBadge = tabBtns[2]?.querySelector('.skill-tab-n')
    expect(localTabBadge?.textContent).toBe('1')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 4. 토글 클릭 → setMcpEnabled 호출 + state 반영
// ══════════════════════════════════════════════════════════════════════════════

describe('P5b McpView — 토글 IPC', () => {
  it('토글 클릭 시 window.api.setMcpEnabled가 호출된다', async () => {
    await openMcpTab()
    const firstToggle = document.body.querySelector('.skill-toggle') as HTMLElement
    expect(firstToggle).toBeTruthy()
    await act(async () => {
      fireEvent.click(firstToggle)
    })
    expect(mockSetMcpEnabled).toHaveBeenCalledTimes(1)
  })

  it('enabled=true인 서버 토글 → setMcpEnabled({name, enabled: false}) 호출', async () => {
    // filesystem은 enabled: true
    await openMcpTab()
    const toggles = document.body.querySelectorAll('.skill-toggle')
    const filesystemToggle = toggles[0] as HTMLElement
    await act(async () => {
      fireEvent.click(filesystemToggle)
    })
    expect(mockSetMcpEnabled).toHaveBeenCalledWith({ name: 'filesystem', enabled: false })
  })

  it('enabled=false인 서버 토글 → setMcpEnabled({name, enabled: true}) 호출', async () => {
    // web-search는 enabled: false
    await openMcpTab()
    const toggles = document.body.querySelectorAll('.skill-toggle')
    const webSearchToggle = toggles[1] as HTMLElement
    await act(async () => {
      fireEvent.click(webSearchToggle)
    })
    expect(mockSetMcpEnabled).toHaveBeenCalledWith({ name: 'web-search', enabled: true })
  })

  it('토글 성공 후 aria-checked가 반전된다 (낙관적 갱신)', async () => {
    await openMcpTab()
    const firstToggle = document.body.querySelector('.skill-toggle') as HTMLElement
    const before = firstToggle.getAttribute('aria-checked')
    await act(async () => {
      fireEvent.click(firstToggle)
    })
    await act(async () => {})
    const after = firstToggle.getAttribute('aria-checked')
    expect(after).not.toBe(before)
  })

  it('setMcpEnabled 실패 시 graceful — 크래시 없이 state 롤백', async () => {
    mockSetMcpEnabled.mockRejectedValue(new Error('IPC error'))
    await openMcpTab()
    const firstToggle = document.body.querySelector('.skill-toggle') as HTMLElement
    const before = firstToggle.getAttribute('aria-checked')
    await act(async () => {
      fireEvent.click(firstToggle)
    })
    // 낙관적으로 바뀐 후 롤백 대기
    await act(async () => {})
    // 롤백 후 원래 상태로 돌아와야 함
    expect(firstToggle.getAttribute('aria-checked')).toBe(before)
    // 크래시 없음
    expect(document.body.querySelector('.skill-toggle')).toBeTruthy()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 5. 빈 배열 → scope별 빈 상태 안내문
// ══════════════════════════════════════════════════════════════════════════════

describe('P5b McpView — 빈 상태', () => {
  it('listMcpServers 빈 배열 → "등록된 MCP 서버가 없습니다" 안내문 (전체 탭)', async () => {
    mockListMcpServers.mockResolvedValue([])
    await openMcpTab()
    expect(screen.getByText('등록된 MCP 서버가 없습니다.')).toBeTruthy()
  })

  it('global만 있을 때 로컬 탭 → 로컬 안내문', async () => {
    mockListMcpServers.mockResolvedValue([
      { name: 'g1', scope: 'global', origin: 'user', transport: 'stdio', detail: 'npx', enabled: true },
    ])
    await openMcpTab()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /로컬/ }))
    })
    expect(screen.getByText('이 프로젝트(.mcp.json·로컬)에 등록된 MCP 서버가 없습니다.')).toBeTruthy()
  })

  it('local만 있을 때 전역 탭 → 전역 안내문', async () => {
    mockListMcpServers.mockResolvedValue([
      { name: 'l1', scope: 'local', origin: 'project', transport: 'stdio', detail: 'node', enabled: true },
    ])
    await openMcpTab()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /전역/ }))
    })
    expect(screen.getByText('~/.claude.json 에 등록된 전역 MCP 서버가 없습니다.')).toBeTruthy()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 6. 새로고침 버튼 → listMcpServers 재호출
// ══════════════════════════════════════════════════════════════════════════════

describe('P5b McpView — 새로고침', () => {
  it('새로고침 버튼 클릭 → window.api.listMcpServers 재호출 (총 2회)', async () => {
    await openMcpTab()
    expect(mockListMcpServers).toHaveBeenCalledTimes(1)

    const refreshBtn = document.body.querySelector('.skill-refresh') as HTMLElement
    expect(refreshBtn).toBeTruthy()
    await act(async () => {
      fireEvent.click(refreshBtn)
    })
    await act(async () => {})
    expect(mockListMcpServers).toHaveBeenCalledTimes(2)
  })

  it('새로고침 후 갱신된 데이터가 반영된다', async () => {
    await openMcpTab()

    const updatedMcp: McpServerInfo[] = [
      { name: 'new-server', scope: 'global', origin: 'user', transport: 'http', detail: 'new.example.com', enabled: true },
    ]
    mockListMcpServers.mockResolvedValue(updatedMcp)

    const refreshBtn = document.body.querySelector('.skill-refresh') as HTMLElement
    await act(async () => {
      fireEvent.click(refreshBtn)
    })
    await act(async () => {})

    await waitFor(() => {
      expect(screen.getByText('new-server')).toBeTruthy()
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 7. listMcpServers 실패 → graceful (빈 목록, 크래시 없음)
// ══════════════════════════════════════════════════════════════════════════════

describe('P5b McpView — IPC 실패 graceful', () => {
  it('listMcpServers throw → 빈 목록(ext-item 0) + 크래시 없음', async () => {
    mockListMcpServers.mockRejectedValue(new Error('Network error'))
    await openMcpTab()
    const items = document.body.querySelectorAll('.ext-item')
    expect(items.length).toBe(0)
    expect(document.body.querySelector('.set-empty')).toBeTruthy()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 8. 기존 SettingsModal 회귀 가드 (P5b 배선 후 기존 테스트 계약 유지)
// ══════════════════════════════════════════════════════════════════════════════

describe('P5b 회귀 가드 — 기존 테스트 계약 유지', () => {
  it('테마 nav 버튼 라벨이 "테마" 유지', async () => {
    vi.resetModules()
    mockListMcpServers.mockResolvedValue(SAMPLE_MCP)
    const { SettingsModal } = await import('../../src/renderer/src/components/SettingsModal')
    await act(async () => {
      render(<SettingsModal onClose={() => {}} />)
    })
    expect(screen.getByRole('button', { name: '테마' })).toBeTruthy()
  })

  it('set-nav / set-nav-item 클래스 유지', async () => {
    vi.resetModules()
    mockListMcpServers.mockResolvedValue(SAMPLE_MCP)
    const { SettingsModal } = await import('../../src/renderer/src/components/SettingsModal')
    await act(async () => {
      render(<SettingsModal onClose={() => {}} />)
    })
    expect(document.body.querySelector('.set-nav')).toBeTruthy()
    expect(document.body.querySelector('.set-nav-item')).toBeTruthy()
  })

  it('기본 탭은 Claude Code (VersionView)', async () => {
    vi.resetModules()
    mockListMcpServers.mockResolvedValue(SAMPLE_MCP)
    const { SettingsModal } = await import('../../src/renderer/src/components/SettingsModal')
    await act(async () => {
      render(<SettingsModal onClose={() => {}} />)
    })
    const h1 = document.body.querySelector('.set-h1')
    expect(h1?.textContent).toBe('Claude Code')
  })

  it('Skill 탭 IPC(P5a) 정상 동작 유지 — MCP 배선 무관', async () => {
    mockListSkills.mockResolvedValue([
      { name: 'git-helper', scope: 'global', description: 'Git 자동화', enabled: true },
    ])
    vi.resetModules()
    const { SettingsModal } = await import('../../src/renderer/src/components/SettingsModal')
    await act(async () => {
      render(<SettingsModal onClose={() => {}} />)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Skill' }))
    })
    await act(async () => {})
    expect(document.body.querySelectorAll('.skill-tab').length).toBe(3)
  })
})
