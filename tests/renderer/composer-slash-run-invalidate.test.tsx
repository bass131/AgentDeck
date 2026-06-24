// @vitest-environment jsdom
/**
 * composer-slash-run-invalidate.test.tsx — ADR-019 슬래시 캐시 무효화 테스트 (TDD-first).
 *
 * 검증 항목:
 *   - isRunning true→false 전이 후 '/' 팔레트 재열기 시 listSlashCommands 재호출 (캐시 무효화)
 *   - 재호출 결과(캡처된 커맨드 포함 32개)를 팔레트가 반영
 *   - run 전이 없으면(같은 root, isRunning 불변) 재호출 0 (캐시 유지 회귀)
 *   - isRunning false→true 전이는 무효화 없음 (run 시작 시엔 캐시 유지)
 *   - 1차/2차 mock 배열이 팔레트 DOM에 정확히 반영됨
 *
 * CRITICAL: window.api 화이트리스트(listSlashCommands/listSkills)만 사용.
 * renderer untrusted — fs/Node 직접 0.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, waitFor, act } from '@testing-library/react'
import { Composer } from '../../src/renderer/src/components/Composer'
import type { SlashCommandInfo, SkillInfo } from '../../src/shared/ipc-contract'

// ── 샘플 데이터 ────────────────────────────────────────────────────────────────

/** 1차 로드: run 전 stale 8개 커맨드 */
const STALE_COMMANDS: SlashCommandInfo[] = [
  { name: 'ask',     description: '임시 질문',  scope: 'builtin' },
  { name: 'init',    description: 'CLAUDE.md',  scope: 'builtin' },
  { name: 'compact', description: '대화 요약',  scope: 'builtin' },
  { name: 'review',  description: '리뷰',       scope: 'builtin' },
  { name: 'help',    description: '도움말',     scope: 'builtin' },
  { name: 'clear',   description: '초기화',     scope: 'builtin' },
  { name: 'security-review', description: '보안', scope: 'builtin' },
  { name: 'bug',     description: '버그 픽스',  scope: 'builtin' },
]

/** 2차 로드: run 완료 후 캡처된 커맨드 포함 32개(대표 12개로 축약) */
const FRESH_COMMANDS: SlashCommandInfo[] = [
  ...STALE_COMMANDS,
  { name: 'deploy',    description: '배포',          scope: 'project' },
  { name: 'test-all',  description: '전체 테스트',   scope: 'project' },
  { name: 'lint-fix',  description: '린트 자동수정', scope: 'project' },
  { name: 'changelog', description: '변경이력 생성', scope: 'project' },
]

const EMPTY_SKILLS: SkillInfo[] = []

// ── window.api 모킹 ─────────────────────────────────────────────────────────────

const mockListSlashCommands = vi.fn<() => Promise<SlashCommandInfo[]>>()
const mockListSkills = vi.fn<() => Promise<SkillInfo[]>>()

beforeEach(() => {
  // 기본 1차 응답 설정 (처음 호출 시 stale, 두 번째 호출 시 fresh)
  mockListSlashCommands.mockResolvedValueOnce(STALE_COMMANDS)
  mockListSlashCommands.mockResolvedValueOnce(FRESH_COMMANDS)
  mockListSkills.mockResolvedValue(EMPTY_SKILLS)

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
    workspaceRoot: '/proj/test',
    ...over,
  }
}

function getSlashNames(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('.slash-name')).map((n) => n.textContent ?? '')
}

// ── 테스트 ─────────────────────────────────────────────────────────────────────

describe('ADR-019 슬래시 캐시 무효화 — isRunning true→false 전이', () => {

  // ── 핵심: run 완료 후 재열기 시 IPC 재호출 ──────────────────────────────────

  it('[핵심] isRunning true→false 전이 후 "/" 재열기 → listSlashCommands 2번째 호출', async () => {
    // 1단계: isRunning=false, value='/' → 1차 로드
    const { baseElement, rerender } = render(
      <Composer {...mkProps({ value: '/', isRunning: false })} />
    )

    // 1차 IPC 호출 대기
    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
    })

    // 1차 결과 확인 (stale 커맨드만)
    await waitFor(() => {
      const names = getSlashNames(baseElement)
      expect(names).toContain('ask')
      // fresh 커맨드는 아직 없음
      expect(names).not.toContain('deploy')
    })

    // 2단계: run 시작 (value 변경으로 팔레트 닫기 + isRunning=true)
    rerender(<Composer {...mkProps({ value: '', isRunning: true })} />)

    // 3단계: run 완료 (isRunning true→false 전이) — 캐시 무효화 발생 시점
    await act(async () => {
      rerender(<Composer {...mkProps({ value: '', isRunning: false })} />)
    })

    // 4단계: '/' 입력으로 팔레트 재열기 → 무효화된 캐시로 2차 IPC 호출
    rerender(<Composer {...mkProps({ value: '/', isRunning: false })} />)

    // 2차 IPC 호출 확인
    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(2)
    })
  })

  // ── 캡처된 커맨드가 팔레트에 반영됨 ─────────────────────────────────────────

  it('[핵심] run 완료 후 재열기 팔레트에 캡처된 커맨드(deploy 등) 표시', async () => {
    const { baseElement, rerender } = render(
      <Composer {...mkProps({ value: '/', isRunning: false })} />
    )

    // 1차 로드 완료 대기
    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
    })
    // stale 커맨드만 표시
    await waitFor(() => {
      const names = getSlashNames(baseElement)
      expect(names).not.toContain('deploy')
    })

    // run 시작 → 완료 전이
    rerender(<Composer {...mkProps({ value: '', isRunning: true })} />)
    await act(async () => {
      rerender(<Composer {...mkProps({ value: '', isRunning: false })} />)
    })

    // 팔레트 재열기
    rerender(<Composer {...mkProps({ value: '/', isRunning: false })} />)

    // 2차 로드 완료 후 fresh 커맨드 표시 확인
    await waitFor(() => {
      const names = getSlashNames(baseElement)
      expect(names).toContain('deploy')
      expect(names).toContain('test-all')
      expect(names).toContain('lint-fix')
    })
  })

  // ── 회귀: run 전이 없으면 캐시 유지 ─────────────────────────────────────────

  it('[회귀] run 전이 없음 — 같은 root, 팔레트 재열기 → IPC 1회만 호출', async () => {
    const { baseElement, rerender } = render(
      <Composer {...mkProps({ value: '/', isRunning: false })} />
    )

    // 1차 로드 대기
    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
    })

    // 팔레트 닫기 (value 초기화)
    rerender(<Composer {...mkProps({ value: '', isRunning: false })} />)

    // 팔레트 재열기 (isRunning 변경 없음)
    rerender(<Composer {...mkProps({ value: '/', isRunning: false })} />)

    // 50ms 대기 후에도 추가 IPC 호출 없음
    await new Promise((r) => setTimeout(r, 50))
    expect(mockListSlashCommands).toHaveBeenCalledTimes(1)

    void baseElement
  })

  // ── 회귀: false→true 전이는 무효화 안 함 ────────────────────────────────────

  it('[회귀] isRunning false→true 전이는 캐시 무효화 안 함', async () => {
    const { rerender } = render(
      <Composer {...mkProps({ value: '/', isRunning: false })} />
    )

    // 1차 로드 대기
    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
    })

    // run 시작 (false→true) — 무효화 발생하면 안 됨
    await act(async () => {
      rerender(<Composer {...mkProps({ value: '', isRunning: true })} />)
    })

    // 팔레트 재열기 없이 50ms 대기
    await new Promise((r) => setTimeout(r, 50))

    // 추가 IPC 호출 없음 확인 (무효화됐더라도 팔레트 미열림이면 IPC 미호출)
    // 여기서는 단순히 2차 호출 없음만 확인
    expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
  })

  // ── 회귀: workspaceRoot 변경 시 캐시 무효화(기존 P10 동작 유지) ───────────────

  it('[회귀] workspaceRoot 변경 시 IPC 재호출 (P10 기존 동작 유지)', async () => {
    const { rerender } = render(
      <Composer {...mkProps({ value: '/', isRunning: false, workspaceRoot: '/proj/a' })} />
    )

    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
    })

    // workspaceRoot 변경 → 재로드
    rerender(
      <Composer {...mkProps({ value: '/', isRunning: false, workspaceRoot: '/proj/b' })} />
    )

    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(2)
    })
  })

  // ── run 여러 번 완료 시 매번 재로드 ─────────────────────────────────────────

  it('run이 2번 완료되면 "/" 재열기 시 IPC도 2번 재호출', async () => {
    // 3회 응답 mock 추가
    mockListSlashCommands.mockResolvedValueOnce(FRESH_COMMANDS)

    const { baseElement, rerender } = render(
      <Composer {...mkProps({ value: '/', isRunning: false })} />
    )

    // 1차 로드 (stale)
    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
    })

    // 1번째 run 완료
    rerender(<Composer {...mkProps({ value: '', isRunning: true })} />)
    await act(async () => {
      rerender(<Composer {...mkProps({ value: '', isRunning: false })} />)
    })
    rerender(<Composer {...mkProps({ value: '/', isRunning: false })} />)

    // 2차 로드 (fresh)
    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(2)
    })

    // 2번째 run 완료
    rerender(<Composer {...mkProps({ value: '', isRunning: true })} />)
    await act(async () => {
      rerender(<Composer {...mkProps({ value: '', isRunning: false })} />)
    })
    rerender(<Composer {...mkProps({ value: '/', isRunning: false })} />)

    // 3차 로드
    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(3)
    })

    void baseElement
  })
})
