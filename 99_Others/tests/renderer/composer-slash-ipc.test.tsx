// @vitest-environment jsdom
/**
 * composer-slash-ipc.test.tsx — P10 슬래시 커맨드 자동완성 IPC 배선 테스트.
 *
 * TDD 먼저: 이 파일은 구현 전 먼저 작성된 실패 테스트.
 *
 * 검증 항목:
 *   - '/' 입력 시 window.api.listSlashCommands + window.api.listSkills 호출
 *   - 빌트인 + 커스텀 커맨드 렌더
 *   - 스킬 섹션 렌더
 *   - argHint 표시
 *   - 커스텀 커맨드(scope='user'|'project') 렌더
 *   - 필터 (name 부분일치)
 *   - 선택 시 '/{name} ' 삽입 (pickSlash 기존 동작 보존)
 *   - 빈 결과 graceful
 *   - 키보드 내비(↑↓/Enter/Tab/Esc) 회귀 없음
 *   - @멘션 우선순위 회귀 없음
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { Composer } from '../../../02.Source/renderer/src/components/01_conversation/Composer'
import type { SlashCommandInfo, SkillInfo } from '../../../02.Source/shared/ipc-contract'
import { SAMPLE_MENTION_TREE } from '../../../02.Source/renderer/src/lib/composerSampleData'

// ── 샘플 데이터 ────────────────────────────────────────────────────────────────

const SAMPLE_COMMANDS: SlashCommandInfo[] = [
  { name: 'ask',            description: '본 대화와 분리된 임시 질문', scope: 'builtin' },
  { name: 'init',           description: 'CLAUDE.md 생성',            scope: 'builtin' },
  { name: 'compact',        description: '대화 요약',                  scope: 'builtin', argHint: '[focus]' },
  { name: 'deploy',         description: '배포 커스텀 커맨드',          scope: 'project' },
  { name: 'review',         description: '사용자 커스텀 리뷰',          scope: 'user' },
  { name: 'security-review',description: '보안 취약점 검토',            scope: 'builtin' },
]

const SAMPLE_SKILLS: SkillInfo[] = [
  { name: 'claude-api', description: 'Anthropic API 참조', scope: 'global', enabled: true },
  { name: 'tdd-guard',  description: 'TDD 실패-우선 훅',   scope: 'local',  enabled: true },
]

const SAMPLE_FILES = SAMPLE_MENTION_TREE
  .filter((e) => e.kind === 'file')
  .map((e) => e.full)

// ── window.api 모킹 ─────────────────────────────────────────────────────────────

const mockListSlashCommands = vi.fn<() => Promise<SlashCommandInfo[]>>()
const mockListSkills = vi.fn<() => Promise<SkillInfo[]>>()

beforeEach(() => {
  mockListSlashCommands.mockResolvedValue(SAMPLE_COMMANDS)
  mockListSkills.mockResolvedValue(SAMPLE_SKILLS)

  // window.api 화이트리스트 모킹 — 기존 window 객체를 교체하지 않고 api 프로퍼티만 주입.
  // (window 교체 시 jsdom document 연결이 끊겨 waitFor container 오류 발생)
  // CRITICAL: renderer untrusted — IPC 화이트리스트 채널만 노출.
  ;(window as unknown as Record<string, unknown>).api = {
    listSlashCommands: mockListSlashCommands,
    listSkills: mockListSkills,
    pathForFile: vi.fn(() => ''),
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// ── 헬퍼 ───────────────────────────────────────────────────────────────────────

function mkProps(over: Partial<Parameters<typeof Composer>[0]> = {}) {
  return {
    value: '',
    onChange: vi.fn(),
    onSend: vi.fn(),
    onAbort: vi.fn(),
    isRunning: false,
    ...over,
  }
}

// slashName 목록을 DOM에서 추출
function getSlashNames(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('.slash-name')).map((n) => n.textContent ?? '')
}

// ── 테스트 ─────────────────────────────────────────────────────────────────────

describe('Composer 슬래시 팔레트 IPC 배선 (P10)', () => {

  // ── 1. '/' 입력 시 IPC 호출 ─────────────────────────────────────────────────

  it('"/" 입력 시 listSlashCommands + listSkills IPC 호출', async () => {
    const { baseElement } = render(<Composer {...mkProps({ value: '/' })} />)
    // 팔레트가 열리면 IPC 로드 시작
    expect(baseElement.querySelector('.slash-menu')).toBeTruthy()
    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
      expect(mockListSkills).toHaveBeenCalledTimes(1)
    })
  })

  // ── 2. 빌트인 커맨드 렌더 ───────────────────────────────────────────────────

  it('IPC 응답 후 빌트인 커맨드(ask/init/compact/security-review) 렌더', async () => {
    const { baseElement } = render(<Composer {...mkProps({ value: '/' })} />)
    await waitFor(() => {
      const names = getSlashNames(baseElement)
      expect(names).toContain('ask')
      expect(names).toContain('init')
      expect(names).toContain('compact')
      expect(names).toContain('security-review')
    })
  })

  // ── 3. 커스텀 커맨드 렌더 (scope='user'|'project') ─────────────────────────

  it('커스텀 커맨드(deploy/review) 렌더', async () => {
    const { baseElement } = render(<Composer {...mkProps({ value: '/' })} />)
    await waitFor(() => {
      const names = getSlashNames(baseElement)
      expect(names).toContain('deploy')
      expect(names).toContain('review')
    })
  })

  // ── 4. 스킬 섹션 렌더 ────────────────────────────────────────────────────────

  it('스킬 섹션 표시 + 스킬 이름 렌더', async () => {
    const { baseElement } = render(<Composer {...mkProps({ value: '/' })} />)
    await waitFor(() => {
      const secs = Array.from(baseElement.querySelectorAll('.slash-sec')).map((s) => s.textContent)
      expect(secs.some((s) => s?.includes('스킬'))).toBe(true)
      const names = getSlashNames(baseElement)
      expect(names).toContain('claude-api')
      expect(names).toContain('tdd-guard')
    })
  })

  // ── 5. argHint 표시 ──────────────────────────────────────────────────────────

  it('argHint 있는 커맨드(compact [focus]) 팔레트에 hint 텍스트 표시', async () => {
    const { baseElement } = render(<Composer {...mkProps({ value: '/comp' })} />)
    await waitFor(() => {
      const menu = baseElement.querySelector('.slash-menu')
      expect(menu?.textContent).toContain('[focus]')
    })
  })

  // ── 6. 필터: name 부분일치 ───────────────────────────────────────────────────

  it('"/ask" 입력 → ask만 표시', async () => {
    const { baseElement } = render(<Composer {...mkProps({ value: '/ask' })} />)
    await waitFor(() => {
      const menu = baseElement.querySelector('.slash-menu')
      if (!menu) return
      const names = Array.from(menu.querySelectorAll('.slash-name')).map((n) => n.textContent)
      expect(names.every((n) => n?.includes('ask'))).toBe(true)
    })
  })

  it('"/dep" 입력 → deploy 표시', async () => {
    const { baseElement } = render(<Composer {...mkProps({ value: '/dep' })} />)
    await waitFor(() => {
      const menu = baseElement.querySelector('.slash-menu')
      if (!menu) return
      const names = Array.from(menu.querySelectorAll('.slash-name')).map((n) => n.textContent)
      expect(names).toContain('deploy')
    })
  })

  // ── 7. 선택 시 '/{name} ' 삽입 (pickSlash 동작 보존) ─────────────────────────

  it('커스텀 커맨드 mouseDown → onChange("/{name} ") 호출', async () => {
    const onChange = vi.fn()
    const { baseElement } = render(<Composer {...mkProps({ value: '/', onChange })} />)
    // deploy 항목이 로드될 때까지 대기
    await waitFor(() => {
      const names = getSlashNames(baseElement)
      expect(names).toContain('deploy')
    })
    // deploy 항목 클릭
    const opts = baseElement.querySelectorAll('.slash-opt')
    const deployOpt = Array.from(opts).find(
      (o) => o.querySelector('.slash-name')?.textContent === 'deploy'
    ) as HTMLButtonElement | undefined
    if (deployOpt) {
      fireEvent.mouseDown(deployOpt)
      expect(onChange).toHaveBeenCalledWith('/deploy ')
    }
  })

  // ── 8. /ask + onSlashAsk 특수처리 기존 보존 ─────────────────────────────────

  it('/ask + onSlashAsk → onSlashAsk() 호출(onChange 미호출)', async () => {
    const onChange = vi.fn()
    const onSlashAsk = vi.fn()
    const { baseElement } = render(<Composer {...mkProps({ value: '/', onChange, onSlashAsk })} />)
    await waitFor(() => {
      const names = getSlashNames(baseElement)
      expect(names).toContain('ask')
    })
    const opts = baseElement.querySelectorAll('.slash-opt')
    const askOpt = Array.from(opts).find(
      (o) => o.querySelector('.slash-name')?.textContent === 'ask'
    ) as HTMLButtonElement | undefined
    if (askOpt) {
      fireEvent.mouseDown(askOpt)
      expect(onSlashAsk).toHaveBeenCalled()
      expect(onChange).not.toHaveBeenCalled()
    }
  })

  // ── 9. 빈 결과 graceful ───────────────────────────────────────────────────────

  it('IPC가 빈 배열 반환 시 팔레트는 열리되 항목 없음 (graceful)', async () => {
    mockListSlashCommands.mockResolvedValue([])
    mockListSkills.mockResolvedValue([])
    const { baseElement } = render(<Composer {...mkProps({ value: '/' })} />)
    expect(baseElement.querySelector('.slash-menu')).toBeTruthy()
    await waitFor(() => {
      expect(baseElement.querySelectorAll('.slash-opt').length).toBe(0)
    })
  })

  // ── 10. IPC 실패 graceful ─────────────────────────────────────────────────────

  it('IPC 실패 시 빈 배열 fallback (crash 없음)', async () => {
    mockListSlashCommands.mockRejectedValue(new Error('IPC error'))
    mockListSkills.mockRejectedValue(new Error('IPC error'))
    const { baseElement } = render(<Composer {...mkProps({ value: '/' })} />)
    expect(baseElement.querySelector('.slash-menu')).toBeTruthy()
    await waitFor(() => {
      expect(baseElement.querySelectorAll('.slash-opt').length).toBe(0)
    })
  })

  // ── 11. 키보드 내비 회귀 없음 ────────────────────────────────────────────────

  it('IPC 로드 후 ↓ 키 → 두 번째 항목 .on (slashIdx 이동 보존)', async () => {
    const { baseElement } = render(<Composer {...mkProps({ value: '/' })} />)
    const ta = baseElement.querySelector('textarea') as HTMLTextAreaElement
    await waitFor(() => {
      const opts = baseElement.querySelectorAll('.slash-opt')
      expect(opts.length).toBeGreaterThan(1)
    })
    fireEvent.keyDown(ta, { key: 'ArrowDown' })
    const opts = baseElement.querySelectorAll('.slash-opt')
    expect(opts[0].classList.contains('on')).toBe(false)
    expect(opts[1].classList.contains('on')).toBe(true)
  })

  it('IPC 로드 후 ↑ 키 → 마지막 항목 wrap', async () => {
    const { baseElement } = render(<Composer {...mkProps({ value: '/' })} />)
    const ta = baseElement.querySelector('textarea') as HTMLTextAreaElement
    await waitFor(() => {
      const opts = baseElement.querySelectorAll('.slash-opt')
      expect(opts.length).toBeGreaterThan(1)
    })
    fireEvent.keyDown(ta, { key: 'ArrowUp' })
    const opts = baseElement.querySelectorAll('.slash-opt')
    expect(opts[opts.length - 1].classList.contains('on')).toBe(true)
  })

  it('Esc → 팔레트 닫힘', async () => {
    const { baseElement } = render(<Composer {...mkProps({ value: '/' })} />)
    const ta = baseElement.querySelector('textarea') as HTMLTextAreaElement
    await waitFor(() => {
      expect(baseElement.querySelector('.slash-menu')).toBeTruthy()
    })
    fireEvent.keyDown(ta, { key: 'Escape' })
    expect(baseElement.querySelector('.slash-menu')).toBeFalsy()
  })

  // ── 12. @멘션 우선순위 회귀 없음 ─────────────────────────────────────────────

  it('@멘션 값("@")에서는 listSlashCommands가 호출되지 않음', async () => {
    render(<Composer {...mkProps({ value: '@', mentionFiles: SAMPLE_FILES })} />)
    // mention 팔레트가 열려 있는 동안 slash IPC가 호출되지 않아야 함
    // (value가 '/'로 시작하지 않으므로 parseSlashQuery → null)
    await new Promise((r) => setTimeout(r, 50))
    expect(mockListSlashCommands).not.toHaveBeenCalled()
  })

  // ── 13. 캐시: 같은 workspace root에서 재열기 시 IPC 1회만 호출 ───────────────

  it('팔레트가 이미 로드된 상태에서 재렌더 시 IPC 추가 호출 없음 (캐시)', async () => {
    const { baseElement, rerender } = render(<Composer {...mkProps({ value: '/' })} />)
    // 첫 로드 대기
    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
    })
    // 같은 workspaceRoot(null)에서 rerender → 캐시 히트, 추가 IPC 호출 없음
    rerender(<Composer {...mkProps({ value: '/' })} />)
    await new Promise((r) => setTimeout(r, 50))
    expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
    void baseElement
  })

  // ── 14. 공백 있으면 팔레트 없음 (기존 동작 보존) ────────────────────────────

  it('"/ask some text" → 팔레트 없음, IPC 미호출', () => {
    const { baseElement } = render(<Composer {...mkProps({ value: '/ask some text' })} />)
    expect(baseElement.querySelector('.slash-menu')).toBeFalsy()
    expect(mockListSlashCommands).not.toHaveBeenCalled()
  })

  // ── 🟡-A: workspace root 변경 시 재로드 ───────────────────────────────────────

  it('🟡-A: workspaceRoot 변경 시 IPC 재호출 (다른 root)', async () => {
    const { rerender } = render(<Composer {...mkProps({ value: '/', workspaceRoot: '/proj/a' })} />)
    // 첫 로드 대기
    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
    })
    // workspaceRoot 변경 → 캐시 미스 → 재로드
    rerender(<Composer {...mkProps({ value: '/', workspaceRoot: '/proj/b' })} />)
    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(2)
    })
  })

  it('🟡-A: 같은 workspaceRoot 재렌더 → IPC 추가 호출 없음', async () => {
    const { rerender } = render(<Composer {...mkProps({ value: '/', workspaceRoot: '/proj/a' })} />)
    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
    })
    rerender(<Composer {...mkProps({ value: '/', workspaceRoot: '/proj/a' })} />)
    await new Promise((r) => setTimeout(r, 50))
    expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
  })

  // ── 🟡-B: 빈 결과에서 ArrowDown/Up → NaN 방지 ───────────────────────────────

  it('🟡-B: 빈 결과(totalSlash=0)에서 ArrowDown → slashIdx NaN 안 됨', async () => {
    mockListSlashCommands.mockResolvedValue([])
    mockListSkills.mockResolvedValue([])
    const { baseElement } = render(<Composer {...mkProps({ value: '/' })} />)
    const ta = baseElement.querySelector('textarea') as HTMLTextAreaElement

    // 빈 배열 로드 완료 대기
    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
    })
    await new Promise((r) => setTimeout(r, 20))

    // ArrowDown → crash 없이 정상 처리
    expect(() => {
      fireEvent.keyDown(ta, { key: 'ArrowDown' })
    }).not.toThrow()

    // ArrowUp → crash 없이 정상 처리
    expect(() => {
      fireEvent.keyDown(ta, { key: 'ArrowUp' })
    }).not.toThrow()

    // Enter → crash 없이 정상 처리
    expect(() => {
      fireEvent.keyDown(ta, { key: 'Enter' })
    }).not.toThrow()
  })

  it('🟡-B: 빈 결과에서 팔레트 열림 유지 + .slash-opt 0개 (graceful)', async () => {
    mockListSlashCommands.mockResolvedValue([])
    mockListSkills.mockResolvedValue([])
    const { baseElement } = render(<Composer {...mkProps({ value: '/' })} />)
    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
    })
    await new Promise((r) => setTimeout(r, 20))
    // 팔레트는 열린 채 → 빈 상태
    expect(baseElement.querySelector('.slash-menu')).toBeTruthy()
    expect(baseElement.querySelectorAll('.slash-opt').length).toBe(0)
  })

  // ── 🟡-C: 대소문자 무시 필터 ─────────────────────────────────────────────────

  it('🟡-C: 대문자 쿼리 "/ASK" → 소문자 커맨드 "ask" 매칭', async () => {
    const { baseElement } = render(<Composer {...mkProps({ value: '/ASK' })} />)
    await waitFor(() => {
      const names = Array.from(baseElement.querySelectorAll('.slash-name')).map((n) => n.textContent)
      expect(names).toContain('ask')
    })
  })

  it('🟡-C: 혼합 대소문자 쿼리 "/Deploy" → 소문자 커맨드 "deploy" 매칭', async () => {
    const { baseElement } = render(<Composer {...mkProps({ value: '/Deploy' })} />)
    await waitFor(() => {
      const names = Array.from(baseElement.querySelectorAll('.slash-name')).map((n) => n.textContent)
      expect(names).toContain('deploy')
    })
  })

  it('🟡-C: 소문자 쿼리 "/security" → "security-review" 매칭', async () => {
    const { baseElement } = render(<Composer {...mkProps({ value: '/security' })} />)
    await waitFor(() => {
      const names = Array.from(baseElement.querySelectorAll('.slash-name')).map((n) => n.textContent)
      expect(names).toContain('security-review')
    })
  })
})
