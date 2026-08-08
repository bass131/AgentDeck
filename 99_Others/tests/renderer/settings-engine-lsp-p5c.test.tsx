// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

const mockGetEngineState = vi.fn()
const mockListSkills = vi.fn().mockResolvedValue([])
const mockSetSkillEnabled = vi.fn().mockResolvedValue({ ok: true })
const mockListMcpServers = vi.fn().mockResolvedValue([])
const mockSetMcpEnabled = vi.fn().mockResolvedValue({ ok: true })

const baseApi = {
  getEngineState: mockGetEngineState,
  listSkills: mockListSkills,
  setSkillEnabled: mockSetSkillEnabled,
  listMcpServers: mockListMcpServers,
  setMcpEnabled: mockSetMcpEnabled,
}

Object.defineProperty(window, 'api', {
  value: baseApi,
  writable: true,
  configurable: true,
})

async function renderModal(): Promise<void> {
  vi.resetModules()
  const { SettingsModal } = await import('../../../02_Source/renderer/src/features/shell/SettingsModal')
  await act(async () => {
    render(<SettingsModal onClose={() => {}} />)
  })
  await act(async () => {})
}

async function openVersionTab(): Promise<void> {
  await renderModal()
  const nav = document.body.querySelector('.set-nav')!
  const versionBtn = Array.from(nav.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Claude Code'),
  ) as HTMLElement
  if (versionBtn) {
    await act(async () => { fireEvent.click(versionBtn) })
    await act(async () => {})
  }
}

async function openCodeTab(): Promise<void> {
  await renderModal()
  const nav = document.body.querySelector('.set-nav')!
  const codeBtn = Array.from(nav.querySelectorAll('button')).find(
    (b) => b.textContent?.includes('Code') && !b.textContent?.includes('Claude'),
  ) as HTMLElement
  await act(async () => { fireEvent.click(codeBtn) })
  await act(async () => {})
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  mockGetEngineState.mockResolvedValue({
    available: true,
    authed: true,
    version: '0.3.x',
  })
  mockListSkills.mockResolvedValue([])
  mockListMcpServers.mockResolvedValue([])
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
  vi.clearAllMocks()
})

describe('P5c VersionView — getEngineState IPC 호출', () => {
  it('Claude Code 탭 진입 시 window.api.getEngineState()가 1회 호출된다', async () => {
    await openVersionTab()
    expect(mockGetEngineState).toHaveBeenCalledTimes(1)
  })
})

describe('P5c VersionView — 인증됨 상태 표시', () => {
  it('엔진 이름 "Agent SDK"가 렌더된다', async () => {
    await openVersionTab()
    expect(screen.getByText('Agent SDK')).toBeTruthy()
  })

  it('버전 "v0.3.x"가 렌더된다', async () => {
    await openVersionTab()
    expect(screen.getByText('v0.3.x')).toBeTruthy()
  })

  it('"인증됨" 배지가 렌더된다', async () => {
    await openVersionTab()
    expect(screen.getByText('인증됨')).toBeTruthy()
  })
})

describe('P5c VersionView — 미인증 상태', () => {
  it('authed=false → "미인증" 배지가 렌더된다', async () => {
    mockGetEngineState.mockResolvedValue({ available: true, authed: false, version: '0.3.x' })
    await openVersionTab()
    expect(screen.getByText('미인증')).toBeTruthy()
  })

  it('authed=false → "인증됨" 배지 부재', async () => {
    mockGetEngineState.mockResolvedValue({ available: true, authed: false, version: '0.3.x' })
    await openVersionTab()
    expect(screen.queryByText('인증됨')).toBeNull()
  })
})

describe('P5c VersionView — available=false', () => {
  it('available=false → "SDK 로드 실패" 표시', async () => {
    mockGetEngineState.mockResolvedValue({ available: false, authed: false, version: null })
    await openVersionTab()
    expect(screen.getByText('SDK 로드 실패')).toBeTruthy()
  })
})

describe('P5c VersionView — 가짜 UI 제거 단언', () => {
  it('vpick-btn(드롭다운 picker) 부재', async () => {
    await openVersionTab()
    expect(document.body.querySelector('.vpick-btn')).toBeNull()
  })

  it('vpick-menu 부재', async () => {
    await openVersionTab()
    expect(document.body.querySelector('.vpick-menu')).toBeNull()
  })

  it('vpick-opt(버전 목록 행) 부재', async () => {
    await openVersionTab()
    expect(document.body.querySelector('.vpick-opt')).toBeNull()
  })

  it('설치/삭제/사용 버튼 부재 (inst-btn 없음)', async () => {
    await openVersionTab()
    const instBtns = document.body.querySelectorAll('.inst-btn')
    expect(instBtns.length).toBe(0)
  })
})

describe('P5c VersionView — set-note 정직화', () => {
  it('set-note가 렌더된다', async () => {
    await openVersionTab()
    expect(document.body.querySelector('.set-note')).toBeTruthy()
  })

  it('가짜 경로 문구("~/.agentdeck/engines")가 없다', async () => {
    await openVersionTab()
    const note = document.body.querySelector('.set-note')?.textContent ?? ''
    expect(note).not.toContain('~/.agentdeck/engines')
  })

  it('"내장" 또는 "내장되어" 언급이 있다 (정직 안내)', async () => {
    await openVersionTab()
    const note = document.body.querySelector('.set-note')?.textContent ?? ''
    expect(note).toMatch(/내장/)
  })
})

describe('P5c VersionView — 시각 구조 유지', () => {
  it('.card / .ver-row 구조 유지', async () => {
    await openVersionTab()
    expect(document.body.querySelector('.card')).toBeTruthy()
    expect(document.body.querySelector('.ver-row')).toBeTruthy()
  })

  it('set-h1이 "Claude Code"인 채로 유지', async () => {
    await openVersionTab()
    const h1 = document.body.querySelector('.set-h1')
    expect(h1?.textContent).toBe('Claude Code')
  })
})

describe('P5c VersionView — IPC 실패 graceful', () => {
  it('getEngineState throw → "SDK 로드 실패" 표시, 크래시 없음', async () => {
    mockGetEngineState.mockRejectedValue(new Error('IPC error'))
    await openVersionTab()
    expect(screen.getByText('SDK 로드 실패')).toBeTruthy()
    expect(document.body.querySelector('.set-h1')).toBeTruthy()
  })
})

describe('P5c LspView — TS/Py 앱 내장', () => {
  it('TS/Py 항목에 "앱 내장" 배지가 렌더된다', async () => {
    await openCodeTab()
    const chips = Array.from(document.body.querySelectorAll('.ver-chip'))
    const bundledChips = chips.filter((c) => c.textContent?.includes('앱 내장'))
    expect(bundledChips.length).toBeGreaterThanOrEqual(2)
  })

  it('FileBadge(.ftbadge)가 각 행에 렌더된다', async () => {
    await openCodeTab()
    expect(document.body.querySelectorAll('.ftbadge').length).toBeGreaterThan(0)
  })
})

describe('P5c LspView — C#/C++ 비활성화 정직화', () => {
  it('C#/C++ 항목 버튼이 disabled 상태이다', async () => {
    await openCodeTab()
    const instBtns = Array.from(document.body.querySelectorAll('.inst-btn'))
    expect(instBtns.length).toBeGreaterThan(0)
    instBtns.forEach((btn) => {
      expect((btn as HTMLButtonElement).disabled).toBe(true)
    })
  })

  it('C#/C++ 버튼에 "M5 예정" 또는 "준비 중" 라벨이 포함된다', async () => {
    await openCodeTab()
    const instBtns = Array.from(document.body.querySelectorAll('.inst-btn'))
    instBtns.forEach((btn) => {
      const text = btn.textContent ?? ''
      expect(text.includes('M5 예정') || text.includes('준비 중')).toBe(true)
    })
  })

  it('비활성 버튼 클릭 후 inst-btn 수가 변하지 않는다 (가짜 토글 0)', async () => {
    await openCodeTab()
    const before = document.body.querySelectorAll('.inst-btn').length
    const firstBtn = document.body.querySelector('.inst-btn') as HTMLElement
    fireEvent.click(firstBtn)
    const after = document.body.querySelectorAll('.inst-btn').length
    expect(after).toBe(before)
  })

  it('비활성 버튼 클릭 후 "앱 내장" 배지 수가 변하지 않는다', async () => {
    await openCodeTab()
    const chips = Array.from(document.body.querySelectorAll('.ver-chip'))
    const bundledBefore = chips.filter((c) => c.textContent?.includes('앱 내장')).length
    const firstBtn = document.body.querySelector('.inst-btn') as HTMLElement
    fireEvent.click(firstBtn)
    const chipsAfter = Array.from(document.body.querySelectorAll('.ver-chip'))
    const bundledAfter = chipsAfter.filter((c) => c.textContent?.includes('앱 내장')).length
    expect(bundledAfter).toBe(bundledBefore)
  })
})

describe('P5c LspView — set-note 정직화', () => {
  it('set-note가 렌더된다', async () => {
    await openCodeTab()
    expect(document.body.querySelector('.set-note')).toBeTruthy()
  })

  it('set-note에 "최초 1회 내려받아" 가짜 동작 암시 문구가 없다', async () => {
    await openCodeTab()
    const noteText = document.body.querySelector('.set-note')?.textContent ?? ''
    expect(noteText).not.toContain('최초 1회 내려받아')
  })

  it('set-note에 M5 또는 향후 업데이트 언급이 있다 (정직 안내)', async () => {
    await openCodeTab()
    const noteText = document.body.querySelector('.set-note')?.textContent ?? ''
    expect(noteText).toMatch(/M5|향후/)
  })
})

describe('P5c LspView — 기타 구조 유지', () => {
  it('ext-item LSP 행이 렌더된다', async () => {
    await openCodeTab()
    expect(document.body.querySelectorAll('.ext-item').length).toBeGreaterThan(0)
  })

  it('ver-chip이 렌더된다', async () => {
    await openCodeTab()
    expect(document.body.querySelector('.ver-chip')).toBeTruthy()
  })
})

describe('P5c 회귀 가드 — 기존 계약 유지', () => {
  it('테마 nav 버튼 라벨이 "테마" 유지', async () => {
    await renderModal()
    expect(screen.getByRole('button', { name: '테마' })).toBeTruthy()
  })

  it('set-nav / set-nav-item 클래스 유지', async () => {
    await renderModal()
    expect(document.body.querySelector('.set-nav')).toBeTruthy()
    expect(document.body.querySelector('.set-nav-item')).toBeTruthy()
  })

  it('기본 탭은 Claude Code (set-h1)', async () => {
    await renderModal()
    const h1 = document.body.querySelector('.set-h1')
    expect(h1?.textContent).toBe('Claude Code')
  })

  it('MCP 탭 정상 렌더 (회귀)', async () => {
    mockListMcpServers.mockResolvedValue([
      { name: 'fs', scope: 'global', origin: 'user', transport: 'stdio', detail: 'npx', enabled: true },
    ])
    await renderModal()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'MCP' }))
    })
    await act(async () => {})
    expect(document.body.querySelectorAll('.skill-tab').length).toBe(3)
  })

  it('Skill 탭 정상 렌더 (회귀)', async () => {
    mockListSkills.mockResolvedValue([
      { name: 'git-helper', scope: 'global', description: 'Git 자동화', enabled: true },
    ])
    await renderModal()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Skill' }))
    })
    await act(async () => {})
    expect(document.body.querySelectorAll('.skill-tab').length).toBe(3)
  })
})
