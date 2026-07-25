// @vitest-environment jsdom
/**
 * settings-skill-ipc.test.tsx — P5a SkillView IPC 실배선 TDD.
 *
 * 검증 대상:
 *  1. 마운트 시 window.api.listSkills() 호출 → 반환된 skill 렌더(이름/설명/scope 배지).
 *  2. scope 탭 전환 → 필터/카운트 정확.
 *  3. 토글 클릭 → window.api.setSkillEnabled({name, enabled}) 정확한 인자 + state 반영.
 *  4. 빈 배열 반환 → scope별 빈 상태 안내문.
 *  5. 새로고침 버튼 → listSkills 재호출.
 *  6. listSkills 실패(throw) → graceful (빈 목록 표시, 크래시 없음).
 *
 * 신뢰경계: window.api.listSkills/setSkillEnabled mock — fs/Node 직접 0.
 * 기존 SettingsModal 회귀(테마 라벨·nav·aria·set-nav) 영향 없음.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react'
import type { SkillInfo } from '../../../02.Source/shared/ipc-contract'

// ── window.api 최소 mock ────────────────────────────────────────────────────
const mockListSkills = vi.fn<() => Promise<SkillInfo[]>>()
const mockSetSkillEnabled = vi.fn<(req: { name: string; enabled: boolean }) => Promise<{ ok: boolean }>>()
// P5b: McpView IPC 배선 — baseApi에 포함(MCP 탭 진입 시 호출됨)
const mockListMcpServers = vi.fn().mockResolvedValue([])
const mockSetMcpEnabled = vi.fn().mockResolvedValue({ ok: true })

const SAMPLE_SKILLS: SkillInfo[] = [
  { name: 'git-helper', scope: 'global', description: 'Git 커밋·브랜치·PR 자동화', enabled: true },
  { name: 'code-review', scope: 'global', description: '코드 리뷰 체크리스트', enabled: false },
  { name: 'project-docs', scope: 'local', description: '프로젝트 문서 생성', enabled: true },
]

// window.api 전체 mock — SettingsModal이 사용하는 모든 채널 포함
const baseApi = {
  listSkills: mockListSkills,
  setSkillEnabled: mockSetSkillEnabled,
  // P5b: McpView가 실IPC를 사용하므로 포함
  listMcpServers: mockListMcpServers,
  setMcpEnabled: mockSetMcpEnabled,
  // SettingsModal 다른 탭은 정적이지만, 혹시 모를 호출 방지용 stub
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
}

Object.defineProperty(window, 'api', {
  value: baseApi,
  writable: true,
  configurable: true,
})

// ── 헬퍼: Skill 탭 열기 ────────────────────────────────────────────────────
async function openSkillTab(): Promise<void> {
  vi.resetModules()
  const { SettingsModal } = await import('../../../02.Source/renderer/src/components/00_shell/SettingsModal')
  await act(async () => {
    render(<SettingsModal onClose={() => {}} />)
  })
  // Skill 탭 클릭
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Skill' }))
  })
  // listSkills Promise resolve 대기
  await act(async () => {})
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  mockListSkills.mockResolvedValue(SAMPLE_SKILLS)
  mockSetSkillEnabled.mockResolvedValue({ ok: true })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// ══════════════════════════════════════════════════════════════════════════════
// 1. 마운트 시 listSkills 호출 + skill 렌더
// ══════════════════════════════════════════════════════════════════════════════

describe('P5a SkillView — IPC 마운트 로드', () => {
  it('Skill 탭 진입 시 window.api.listSkills()가 1회 호출된다', async () => {
    await openSkillTab()
    expect(mockListSkills).toHaveBeenCalledTimes(1)
  })

  it('listSkills 반환 skill 이름이 렌더된다', async () => {
    await openSkillTab()
    expect(screen.getByText('git-helper')).toBeTruthy()
    expect(screen.getByText('code-review')).toBeTruthy()
    expect(screen.getByText('project-docs')).toBeTruthy()
  })

  it('listSkills 반환 description이 렌더된다', async () => {
    await openSkillTab()
    expect(screen.getByText('Git 커밋·브랜치·PR 자동화')).toBeTruthy()
    expect(screen.getByText('코드 리뷰 체크리스트')).toBeTruthy()
    expect(screen.getByText('프로젝트 문서 생성')).toBeTruthy()
  })

  it('scope 배지(전역/로컬)가 렌더된다', async () => {
    await openSkillTab()
    const badges = document.body.querySelectorAll('.scope-badge')
    expect(badges.length).toBeGreaterThan(0)
    const texts = Array.from(badges).map((b) => b.textContent)
    expect(texts.some((t) => t?.includes('전역'))).toBe(true)
    expect(texts.some((t) => t?.includes('로컬'))).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. scope 탭 필터/카운트
// ══════════════════════════════════════════════════════════════════════════════

describe('P5a SkillView — scope 탭 필터', () => {
  it('전체 탭: 3개 skill이 모두 렌더된다', async () => {
    await openSkillTab()
    // 전체 탭이 기본 활성화
    const items = document.body.querySelectorAll('.ext-item')
    expect(items.length).toBe(3)
  })

  it('전역 탭: global scope(2개)만 렌더된다', async () => {
    await openSkillTab()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /전역/ }))
    })
    const items = document.body.querySelectorAll('.ext-item')
    expect(items.length).toBe(2)
  })

  it('로컬 탭: local scope(1개)만 렌더된다', async () => {
    await openSkillTab()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /로컬/ }))
    })
    const items = document.body.querySelectorAll('.ext-item')
    expect(items.length).toBe(1)
    expect(screen.getByText('project-docs')).toBeTruthy()
  })

  it('전체 탭 카운트 뱃지가 3을 표시한다', async () => {
    await openSkillTab()
    const allTabBadge = document.body.querySelector('.skill-tab.active .skill-tab-n')
    expect(allTabBadge?.textContent).toBe('3')
  })

  it('전역 탭 카운트 뱃지가 2를 표시한다', async () => {
    await openSkillTab()
    const tabBtns = document.body.querySelectorAll('.skill-tab')
    // 전역 탭은 index 1
    const globalTabBadge = tabBtns[1]?.querySelector('.skill-tab-n')
    expect(globalTabBadge?.textContent).toBe('2')
  })

  it('로컬 탭 카운트 뱃지가 1을 표시한다', async () => {
    await openSkillTab()
    const tabBtns = document.body.querySelectorAll('.skill-tab')
    const localTabBadge = tabBtns[2]?.querySelector('.skill-tab-n')
    expect(localTabBadge?.textContent).toBe('1')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. 토글 클릭 → setSkillEnabled 호출 + state 반영
// ══════════════════════════════════════════════════════════════════════════════

describe('P5a SkillView — 토글 IPC', () => {
  it('토글 클릭 시 window.api.setSkillEnabled가 호출된다', async () => {
    await openSkillTab()
    const firstToggle = document.body.querySelector('.skill-toggle') as HTMLElement
    expect(firstToggle).toBeTruthy()
    await act(async () => {
      fireEvent.click(firstToggle)
    })
    expect(mockSetSkillEnabled).toHaveBeenCalledTimes(1)
  })

  it('enabled=true인 skill 토글 → setSkillEnabled({name, enabled: false}) 호출', async () => {
    // git-helper는 enabled: true
    await openSkillTab()
    const toggles = document.body.querySelectorAll('.skill-toggle')
    // git-helper(enabled=true) 토글
    const gitHelperToggle = toggles[0] as HTMLElement
    await act(async () => {
      fireEvent.click(gitHelperToggle)
    })
    expect(mockSetSkillEnabled).toHaveBeenCalledWith({ name: 'git-helper', enabled: false })
  })

  it('enabled=false인 skill 토글 → setSkillEnabled({name, enabled: true}) 호출', async () => {
    // code-review는 enabled: false
    await openSkillTab()
    const toggles = document.body.querySelectorAll('.skill-toggle')
    // code-review(enabled=false)는 두 번째 토글
    const codeReviewToggle = toggles[1] as HTMLElement
    await act(async () => {
      fireEvent.click(codeReviewToggle)
    })
    expect(mockSetSkillEnabled).toHaveBeenCalledWith({ name: 'code-review', enabled: true })
  })

  it('토글 성공 후 aria-checked가 반전된다 (낙관적 갱신)', async () => {
    await openSkillTab()
    const firstToggle = document.body.querySelector('.skill-toggle') as HTMLElement
    const before = firstToggle.getAttribute('aria-checked')
    await act(async () => {
      fireEvent.click(firstToggle)
    })
    // setSkillEnabled resolve 대기
    await act(async () => {})
    const after = firstToggle.getAttribute('aria-checked')
    expect(after).not.toBe(before)
  })

  it('setSkillEnabled 실패 시 graceful — 크래시 없이 state 유지', async () => {
    mockSetSkillEnabled.mockRejectedValue(new Error('IPC error'))
    await openSkillTab()
    const firstToggle = document.body.querySelector('.skill-toggle') as HTMLElement
    // 실패해도 에러가 전파되지 않아야 함
    await act(async () => {
      fireEvent.click(firstToggle)
    })
    await act(async () => {})
    // 실패 시 원래 상태로 롤백되거나 UI가 남아 있어야 함 (크래시 없음)
    expect(document.body.querySelector('.skill-toggle')).toBeTruthy()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 4. 빈 배열 → scope별 빈 상태 안내문
// ══════════════════════════════════════════════════════════════════════════════

describe('P5a SkillView — 빈 상태', () => {
  it('listSkills 빈 배열 → "설치된 Skill이 없습니다" 안내문 (전체 탭)', async () => {
    mockListSkills.mockResolvedValue([])
    await openSkillTab()
    expect(screen.getByText('설치된 Skill이 없습니다.')).toBeTruthy()
  })

  it('listSkills global만 있을 때 로컬 탭 → 로컬 안내문', async () => {
    mockListSkills.mockResolvedValue([
      { name: 'g1', scope: 'global', description: 'g1 desc', enabled: true },
    ])
    await openSkillTab()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /로컬/ }))
    })
    expect(screen.getByText('이 프로젝트의 .claude/skills 에 Skill이 없습니다.')).toBeTruthy()
  })

  it('listSkills local만 있을 때 전역 탭 → 전역 안내문', async () => {
    mockListSkills.mockResolvedValue([
      { name: 'l1', scope: 'local', description: 'l1 desc', enabled: true },
    ])
    await openSkillTab()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /전역/ }))
    })
    expect(screen.getByText('~/.claude/skills 에 Skill이 없습니다.')).toBeTruthy()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 5. 새로고침 버튼 → listSkills 재호출
// ══════════════════════════════════════════════════════════════════════════════

describe('P5a SkillView — 새로고침', () => {
  it('새로고침 버튼 클릭 → window.api.listSkills 재호출 (총 2회)', async () => {
    await openSkillTab()
    expect(mockListSkills).toHaveBeenCalledTimes(1)

    const refreshBtn = document.body.querySelector('.skill-refresh') as HTMLElement
    expect(refreshBtn).toBeTruthy()
    await act(async () => {
      fireEvent.click(refreshBtn)
    })
    await act(async () => {})
    expect(mockListSkills).toHaveBeenCalledTimes(2)
  })

  it('새로고침 후 갱신된 데이터가 반영된다', async () => {
    await openSkillTab()
    // 첫 로드: 3개

    // 새 데이터로 갱신
    const updatedSkills: SkillInfo[] = [
      { name: 'new-skill', scope: 'global', description: '새로운 스킬', enabled: true },
    ]
    mockListSkills.mockResolvedValue(updatedSkills)

    const refreshBtn = document.body.querySelector('.skill-refresh') as HTMLElement
    await act(async () => {
      fireEvent.click(refreshBtn)
    })
    await act(async () => {})

    await waitFor(() => {
      expect(screen.getByText('new-skill')).toBeTruthy()
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 6. listSkills 실패 → graceful (빈 목록, 크래시 없음)
// ══════════════════════════════════════════════════════════════════════════════

describe('P5a SkillView — IPC 실패 graceful', () => {
  it('listSkills throw → 빈 목록(ext-item 0) + 크래시 없음', async () => {
    mockListSkills.mockRejectedValue(new Error('Network error'))
    await openSkillTab()
    const items = document.body.querySelectorAll('.ext-item')
    expect(items.length).toBe(0)
    // 빈 상태 안내문 표시
    expect(document.body.querySelector('.set-empty')).toBeTruthy()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 7. 기존 SettingsModal 회귀 가드
// ══════════════════════════════════════════════════════════════════════════════

describe('P5a 회귀 가드 — 기존 테스트 계약 유지', () => {
  it('테마 nav 버튼 라벨이 "테마" 유지', async () => {
    vi.resetModules()
    mockListSkills.mockResolvedValue(SAMPLE_SKILLS)
    const { SettingsModal } = await import('../../../02.Source/renderer/src/components/00_shell/SettingsModal')
    await act(async () => {
      render(<SettingsModal onClose={() => {}} />)
    })
    expect(screen.getByRole('button', { name: '테마' })).toBeTruthy()
  })

  it('set-nav / set-nav-item 클래스 유지', async () => {
    vi.resetModules()
    mockListSkills.mockResolvedValue(SAMPLE_SKILLS)
    const { SettingsModal } = await import('../../../02.Source/renderer/src/components/00_shell/SettingsModal')
    await act(async () => {
      render(<SettingsModal onClose={() => {}} />)
    })
    expect(document.body.querySelector('.set-nav')).toBeTruthy()
    expect(document.body.querySelector('.set-nav-item')).toBeTruthy()
  })

  it('기본 탭은 Claude Code (VersionView)', async () => {
    vi.resetModules()
    mockListSkills.mockResolvedValue(SAMPLE_SKILLS)
    const { SettingsModal } = await import('../../../02.Source/renderer/src/components/00_shell/SettingsModal')
    await act(async () => {
      render(<SettingsModal onClose={() => {}} />)
    })
    const h1 = document.body.querySelector('.set-h1')
    expect(h1?.textContent).toBe('Claude Code')
  })

  it('MCP 탭 IPC 배선(P5b) 정상 렌더 — scope 탭 3개 + 서버 행 존재', async () => {
    vi.resetModules()
    mockListSkills.mockResolvedValue(SAMPLE_SKILLS)
    // P5b: McpView가 실IPC를 사용하므로 서버 데이터 설정
    mockListMcpServers.mockResolvedValue([
      { name: 'filesystem', scope: 'global', origin: 'user', transport: 'stdio', detail: 'npx', enabled: true },
      { name: 'web-search', scope: 'global', origin: 'user', transport: 'http', detail: 'api.example.com', enabled: false },
    ])
    const { SettingsModal } = await import('../../../02.Source/renderer/src/components/00_shell/SettingsModal')
    await act(async () => {
      render(<SettingsModal onClose={() => {}} />)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'MCP' }))
    })
    // listMcpServers Promise resolve 대기
    await act(async () => {})
    expect(document.body.querySelectorAll('.skill-tab').length).toBe(3)
    expect(document.body.querySelectorAll('.ext-item').length).toBeGreaterThan(0)
  })
})
