// @vitest-environment jsdom
/**
 * settings-engine-lsp-p5c.test.tsx — P5c VersionView(엔진) + LspView(Code) 정직화 TDD.
 *
 * 검증 대상:
 *  VersionView:
 *   1. 마운트 시 window.api.getEngineState() 1회 호출.
 *   2. available=true, authed=true, version='0.3.x' → "Agent SDK"·버전·"인증됨" 표시.
 *   3. available=true, authed=false → "미인증" 표시.
 *   4. available=false → "SDK 로드 실패" 표시.
 *   5. vpick 드롭다운 picker 부재 단언 (.vpick-btn 없음).
 *   6. 설치/삭제/사용 버튼 부재 단언.
 *   7. ENGINE_VERSIONS 목록 행(.vpick-opt) 부재 단언.
 *   8. set-note 렌더(안내 문구 정직 — "내장" 언급).
 *   9. .card/.ver-row 시각 구조 유지(기존 스타일).
 *   10. getEngineState 실패(throw) → graceful (SDK 로드 실패 표시, 크래시 없음).
 *
 *  LspView(Code 탭):
 *   11. TS/Py "앱 내장" 배지 표시.
 *   12. C#/C++ 버튼 비활성(disabled 속성) 단언.
 *   13. C#/C++ 버튼에 "M5 예정" 또는 "준비 중" 라벨 단언.
 *   14. C#/C++ 버튼 클릭 후 상태 불변 단언 (가짜 토글 0).
 *   15. set-note 정직화 — "최초 1회 내려받아" 가짜 암시 문구 부재.
 *   16. FileBadge(.ftbadge) + ver-chip 유지.
 *
 *  기존 테스트 회귀 가드:
 *   17. 테마 nav 라벨 "테마" 유지.
 *   18. set-nav / set-nav-item 클래스 유지.
 *   19. 기본 탭 Claude Code (set-h1).
 *
 * 신뢰경계:
 *   - window.api.getEngineState mock — fs/Node 직접 0.
 *   - authed boolean만 소비 — 토큰/키 값 취급 0.
 *   - 채널명 문자열 하드코딩 0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

// ── window.api mock ────────────────────────────────────────────────────────────
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

// ── 헬퍼: 모달 렌더 ────────────────────────────────────────────────────────────
async function renderModal(): Promise<void> {
  vi.resetModules()
  const { SettingsModal } = await import('../../../02.Source/renderer/src/components/00_shell/SettingsModal')
  await act(async () => {
    render(<SettingsModal onClose={() => {}} />)
  })
  // getEngineState Promise resolve 대기
  await act(async () => {})
}

async function openVersionTab(): Promise<void> {
  await renderModal()
  // 기본이 Claude Code 탭이지만, 명시적으로 클릭
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
  // 기본: available=true, authed=true, version 포함
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

// ══════════════════════════════════════════════════════════════════════════════
// 1. getEngineState 호출
// ══════════════════════════════════════════════════════════════════════════════

describe('P5c VersionView — getEngineState IPC 호출', () => {
  it('Claude Code 탭 진입 시 window.api.getEngineState()가 1회 호출된다', async () => {
    await openVersionTab()
    expect(mockGetEngineState).toHaveBeenCalledTimes(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. available=true, authed=true, version 있음
// ══════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// 3. authed=false → "미인증"
// ══════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// 4. available=false → "SDK 로드 실패"
// ══════════════════════════════════════════════════════════════════════════════

describe('P5c VersionView — available=false', () => {
  it('available=false → "SDK 로드 실패" 표시', async () => {
    mockGetEngineState.mockResolvedValue({ available: false, authed: false, version: null })
    await openVersionTab()
    expect(screen.getByText('SDK 로드 실패')).toBeTruthy()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 5~7. 가짜 picker/버튼/목록 부재
// ══════════════════════════════════════════════════════════════════════════════

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
    // VersionView에 inst-btn이 없어야 함 (LspView와 혼동 방지)
    const instBtns = document.body.querySelectorAll('.inst-btn')
    // VersionView 탭 기준으로 inst-btn 0개여야 함
    expect(instBtns.length).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 8. set-note 정직화
// ══════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// 9. 기존 카드 시각 구조 유지
// ══════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// 10. getEngineState 실패 → graceful
// ══════════════════════════════════════════════════════════════════════════════

describe('P5c VersionView — IPC 실패 graceful', () => {
  it('getEngineState throw → "SDK 로드 실패" 표시, 크래시 없음', async () => {
    mockGetEngineState.mockRejectedValue(new Error('IPC error'))
    await openVersionTab()
    expect(screen.getByText('SDK 로드 실패')).toBeTruthy()
    // 크래시 없음 — set-h1 유지
    expect(document.body.querySelector('.set-h1')).toBeTruthy()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 11. LspView — TS/Py "앱 내장" 배지
// ══════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// 12~14. LspView — C#/C++ 버튼 비활성 + 클릭 후 상태 불변
// ══════════════════════════════════════════════════════════════════════════════

describe('P5c LspView — C#/C++ 비활성화 정직화', () => {
  it('C#/C++ 항목 버튼이 disabled 상태이다', async () => {
    await openCodeTab()
    // download 종류 버튼들 — 모두 disabled여야 함
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

// ══════════════════════════════════════════════════════════════════════════════
// 15. LspView set-note 정직화 — 가짜 다운로드 암시 제거
// ══════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// 16. LspView 기타 구조 유지
// ══════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// 17~19. 기존 테스트 회귀 가드
// ══════════════════════════════════════════════════════════════════════════════

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
