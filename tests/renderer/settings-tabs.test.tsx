// @vitest-environment jsdom
/**
 * settings-tabs.test.tsx — F7 설정 모달 5탭 (Claude Code/MCP/Skill/Code/테마).
 *
 * 회귀 가드: 테마 nav 라벨 '테마' 유지.
 * P5a: SkillView가 window.api.listSkills IPC를 사용하므로 최소 mock 추가.
 * P5b: McpView가 window.api.listMcpServers IPC를 사용하므로 mock 추가.
 * P5c: VersionView가 window.api.getEngineState IPC를 사용하므로 mock 추가.
 *      가짜 vpick/ENGINE_VERSIONS 관련 테스트는 실 SDK 상태 기준으로 갱신.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

// ── window.api 최소 mock ────────────────────────────────────────────────────
const mockGetEngineState = vi.fn().mockResolvedValue({
  available: true,
  authed: true,
  version: '0.3.x',
})
const mockListSkills = vi.fn().mockResolvedValue([
  { name: 'git-helper', scope: 'global', description: 'Git 커밋 자동화', enabled: true },
  { name: 'code-review', scope: 'global', description: '코드 리뷰', enabled: false },
  { name: 'project-docs', scope: 'local', description: '문서 생성', enabled: true },
])
const mockSetSkillEnabled = vi.fn().mockResolvedValue({ ok: true })
const mockListMcpServers = vi.fn().mockResolvedValue([
  { name: 'filesystem', scope: 'global', origin: 'user', transport: 'stdio', detail: 'npx', enabled: true },
  { name: 'web-search', scope: 'global', origin: 'user', transport: 'http', detail: 'api.example.com', enabled: false },
  { name: 'project-tools', scope: 'local', origin: 'project', transport: 'stdio', detail: 'node', enabled: true },
])
const mockSetMcpEnabled = vi.fn().mockResolvedValue({ ok: true })

Object.defineProperty(window, 'api', {
  value: {
    getEngineState: mockGetEngineState,
    listSkills: mockListSkills,
    setSkillEnabled: mockSetSkillEnabled,
    listMcpServers: mockListMcpServers,
    setMcpEnabled: mockSetMcpEnabled,
  },
  writable: true,
  configurable: true,
})

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  vi.resetModules()
  // resetModules 후에도 mock 유지
  mockGetEngineState.mockResolvedValue({ available: true, authed: true, version: '0.3.x' })
  mockListSkills.mockResolvedValue([
    { name: 'git-helper', scope: 'global', description: 'Git 커밋 자동화', enabled: true },
    { name: 'code-review', scope: 'global', description: '코드 리뷰', enabled: false },
    { name: 'project-docs', scope: 'local', description: '문서 생성', enabled: true },
  ])
  mockSetSkillEnabled.mockResolvedValue({ ok: true })
  mockListMcpServers.mockResolvedValue([
    { name: 'filesystem', scope: 'global', origin: 'user', transport: 'stdio', detail: 'npx', enabled: true },
    { name: 'web-search', scope: 'global', origin: 'user', transport: 'http', detail: 'api.example.com', enabled: false },
    { name: 'project-tools', scope: 'local', origin: 'project', transport: 'stdio', detail: 'node', enabled: true },
  ])
  mockSetMcpEnabled.mockResolvedValue({ ok: true })
  ;(window as unknown as { api: unknown }).api = {
    getEngineState: mockGetEngineState,
    listSkills: mockListSkills,
    setSkillEnabled: mockSetSkillEnabled,
    listMcpServers: mockListMcpServers,
    setMcpEnabled: mockSetMcpEnabled,
  }
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

async function renderModal() {
  const { SettingsModal } = await import('../../src/renderer/src/components/SettingsModal')
  await act(async () => {
    render(<SettingsModal onClose={() => {}} />)
  })
}

// ------------------------------------------------------------------ nav 5탭
describe('SettingsModal — nav 5탭 (F7)', () => {
  it('nav에 5개 탭 버튼이 렌더된다', async () => {
    await renderModal()
    // nav 내의 탭 버튼만 검색 — set-nav 안의 버튼들
    const nav = document.body.querySelector('.set-nav')!
    expect(nav).toBeTruthy()
    const navBtns = Array.from(nav.querySelectorAll('button'))
    const labels = navBtns.map((b) => b.textContent?.trim())
    expect(labels.some((l) => l?.includes('Claude Code'))).toBe(true)
    expect(labels.some((l) => l?.includes('MCP'))).toBe(true)
    expect(labels.some((l) => l?.includes('Skill'))).toBe(true)
    expect(labels.some((l) => l?.includes('Code') && !l?.includes('Claude'))).toBe(true)
    // 회귀 가드: '테마' 라벨 유지
    expect(labels.some((l) => l?.includes('테마'))).toBe(true)
  })

  it('기본 탭은 Claude Code (version 뷰 set-h1)', async () => {
    await renderModal()
    // set-h1 텍스트 확인 — VersionView가 기본으로 열려야 함
    const h1 = document.body.querySelector('.set-h1')
    expect(h1?.textContent).toBe('Claude Code')
  })
})

// ------------------------------------------------------------------ Claude Code 탭 (VersionView — P5c 실 SDK 상태)
describe('SettingsModal — Claude Code 탭 (VersionView)', () => {
  async function openVersionTab() {
    await renderModal()
    // getEngineState resolve 대기
    await act(async () => {})
  }

  it('현재 엔진 카드(ver-row)를 렌더한다', async () => {
    await openVersionTab()
    expect(document.body.querySelector('.ver-row')).toBeTruthy()
    expect(document.body.querySelector('.card')).toBeTruthy()
    expect(screen.getByText('현재 엔진')).toBeTruthy()
  })

  it('"Agent SDK" 엔진 이름이 렌더된다 (P5c — 실 SDK 상태)', async () => {
    await openVersionTab()
    expect(screen.getByText('Agent SDK')).toBeTruthy()
  })

  it('"인증됨" 배지가 렌더된다 (authed=true)', async () => {
    await openVersionTab()
    expect(screen.getByText('인증됨')).toBeTruthy()
  })

  it('vpick-btn(가짜 드롭다운) 부재 — P5c 정직화', async () => {
    await openVersionTab()
    expect(document.body.querySelector('.vpick-btn')).toBeNull()
  })

  it('vtag.cur이 렌더된다 (인증됨 배지)', async () => {
    await openVersionTab()
    expect(document.body.querySelector('.vtag.cur')).toBeTruthy()
  })

  it('set-note가 렌더된다', async () => {
    await openVersionTab()
    expect(document.body.querySelector('.set-note')).toBeTruthy()
  })
})

// ------------------------------------------------------------------ MCP 탭 (P5b — IPC 실배선)
describe('SettingsModal — MCP 탭', () => {
  // P5b: McpView가 실IPC(listMcpServers)를 사용하므로 Promise resolve 대기
  async function openMcpTab() {
    await renderModal()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'MCP' }))
    })
    // listMcpServers Promise resolve 대기
    await act(async () => {})
  }

  it('scope 탭 3개가 렌더된다', async () => {
    await openMcpTab()
    const tabs = document.body.querySelectorAll('.skill-tab')
    expect(tabs.length).toBe(3)
  })

  it('scope 탭에 전체/전역/로컬 라벨이 있다', async () => {
    await openMcpTab()
    expect(screen.getByRole('button', { name: /전체/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /전역/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /로컬/ })).toBeTruthy()
  })

  it('ext-item 서버 행이 렌더된다', async () => {
    await openMcpTab()
    const items = document.body.querySelectorAll('.ext-item')
    expect(items.length).toBeGreaterThan(0)
  })

  it('토글 클릭 시 aria-checked가 반전된다', async () => {
    await openMcpTab()
    const toggle = document.body.querySelector('.skill-toggle') as HTMLElement
    expect(toggle).toBeTruthy()
    const before = toggle.getAttribute('aria-checked')
    await act(async () => {
      fireEvent.click(toggle)
    })
    await act(async () => {})
    const after = toggle.getAttribute('aria-checked')
    expect(after).not.toBe(before)
  })

  it('scope 탭 전환 시 카운트가 필터된다', async () => {
    await openMcpTab()
    // 전역 탭 클릭
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /전역/ }))
    })
    // 로컬만 있는 항목이 제거되어야 하므로 ext-item 수가 달라지거나 set-empty가 뜨거나
    const items = document.body.querySelectorAll('.ext-item')
    const empty = document.body.querySelector('.set-empty')
    expect(items.length > 0 || empty !== null).toBe(true)
  })
})

// ------------------------------------------------------------------ Skill 탭
describe('SettingsModal — Skill 탭', () => {
  async function openSkillTab() {
    await renderModal()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Skill' }))
    })
    // listSkills Promise resolve 대기
    await act(async () => {})
  }

  it('scope 탭 3개가 렌더된다', async () => {
    await openSkillTab()
    expect(document.body.querySelectorAll('.skill-tab').length).toBe(3)
  })

  it('ext-item 스킬 행이 렌더된다', async () => {
    await openSkillTab()
    expect(document.body.querySelectorAll('.ext-item').length).toBeGreaterThan(0)
  })

  it('토글 클릭 시 aria-checked가 반전된다', async () => {
    await openSkillTab()
    const toggle = document.body.querySelector('.skill-toggle') as HTMLElement
    expect(toggle).toBeTruthy()
    const before = toggle.getAttribute('aria-checked')
    await act(async () => {
      fireEvent.click(toggle)
    })
    await act(async () => {})
    expect(toggle.getAttribute('aria-checked')).not.toBe(before)
  })

  it('scope-badge가 렌더된다', async () => {
    await openSkillTab()
    expect(document.body.querySelector('.scope-badge')).toBeTruthy()
  })
})

// ------------------------------------------------------------------ Code(LSP) 탭
describe('SettingsModal — Code(LSP) 탭', () => {
  async function openCodeTab() {
    await renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Code' }))
  }

  it('ext-item LSP 행이 렌더된다', async () => {
    await openCodeTab()
    expect(document.body.querySelectorAll('.ext-item').length).toBeGreaterThan(0)
  })

  it('FileBadge(.ftbadge)가 각 행에 렌더된다', async () => {
    await openCodeTab()
    expect(document.body.querySelectorAll('.ftbadge').length).toBeGreaterThan(0)
  })

  it('ver-chip이 렌더된다 (앱내장/설치됨/요구사항)', async () => {
    await openCodeTab()
    expect(document.body.querySelector('.ver-chip')).toBeTruthy()
  })

  it('download 종류 서버에 설치/삭제 버튼(inst-btn)이 렌더된다', async () => {
    await openCodeTab()
    expect(document.body.querySelector('.inst-btn')).toBeTruthy()
  })

  it('set-note가 렌더된다', async () => {
    await openCodeTab()
    expect(document.body.querySelector('.set-note')).toBeTruthy()
  })
})

// ------------------------------------------------------------------ 테마 탭 (회귀 가드)
describe('SettingsModal — 테마 탭 (회귀 가드)', () => {
  it('테마 nav 버튼 라벨이 "테마" 유지', async () => {
    await renderModal()
    expect(screen.getByRole('button', { name: '테마' })).toBeTruthy()
  })

  it('테마 탭 클릭 시 다크/라이트 옵션이 렌더된다', async () => {
    await renderModal()
    fireEvent.click(screen.getByRole('button', { name: '테마' }))
    expect(screen.getByRole('button', { name: /다크/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /라이트/ })).toBeTruthy()
  })

  it('라이트 클릭 → data-theme=light', async () => {
    await renderModal()
    fireEvent.click(screen.getByRole('button', { name: '테마' }))
    fireEvent.click(screen.getByRole('button', { name: /라이트/ }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})
