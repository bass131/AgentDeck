// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, waitFor, act } from '@testing-library/react'
import { Composer } from '../../../02_Source/renderer/src/components/01_conversation/Composer'
import type { SlashCommandInfo, SkillInfo } from '../../../02_Source/shared/ipcContract'

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

const FRESH_COMMANDS: SlashCommandInfo[] = [
  ...STALE_COMMANDS,
  { name: 'deploy',    description: '배포',          scope: 'project' },
  { name: 'test-all',  description: '전체 테스트',   scope: 'project' },
  { name: 'lint-fix',  description: '린트 자동수정', scope: 'project' },
  { name: 'changelog', description: '변경이력 생성', scope: 'project' },
]

const EMPTY_SKILLS: SkillInfo[] = []

const mockListSlashCommands = vi.fn<() => Promise<SlashCommandInfo[]>>()
const mockListSkills = vi.fn<() => Promise<SkillInfo[]>>()

beforeEach(() => {
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

describe('ADR-019 슬래시 캐시 무효화 — isRunning true→false 전이', () => {

  it('[핵심] isRunning true→false 전이 후 "/" 재열기 → listSlashCommands 2번째 호출', async () => {
    const { baseElement, rerender } = render(
      <Composer {...mkProps({ value: '/', isRunning: false })} />
    )

    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      const names = getSlashNames(baseElement)
      expect(names).toContain('ask')
      expect(names).not.toContain('deploy')
    })

    rerender(<Composer {...mkProps({ value: '', isRunning: true })} />)

    await act(async () => {
      rerender(<Composer {...mkProps({ value: '', isRunning: false })} />)
    })

    rerender(<Composer {...mkProps({ value: '/', isRunning: false })} />)

    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(2)
    })
  })

  it('[핵심] run 완료 후 재열기 팔레트에 캡처된 커맨드(deploy 등) 표시', async () => {
    const { baseElement, rerender } = render(
      <Composer {...mkProps({ value: '/', isRunning: false })} />
    )

    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      const names = getSlashNames(baseElement)
      expect(names).not.toContain('deploy')
    })

    rerender(<Composer {...mkProps({ value: '', isRunning: true })} />)
    await act(async () => {
      rerender(<Composer {...mkProps({ value: '', isRunning: false })} />)
    })

    rerender(<Composer {...mkProps({ value: '/', isRunning: false })} />)

    await waitFor(() => {
      const names = getSlashNames(baseElement)
      expect(names).toContain('deploy')
      expect(names).toContain('test-all')
      expect(names).toContain('lint-fix')
    })
  })

  it('[회귀] run 전이 없음 — 같은 root, 팔레트 재열기 → IPC 1회만 호출', async () => {
    const { baseElement, rerender } = render(
      <Composer {...mkProps({ value: '/', isRunning: false })} />
    )

    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
    })

    rerender(<Composer {...mkProps({ value: '', isRunning: false })} />)

    rerender(<Composer {...mkProps({ value: '/', isRunning: false })} />)

    await new Promise((r) => setTimeout(r, 50))
    expect(mockListSlashCommands).toHaveBeenCalledTimes(1)

    void baseElement
  })

  it('[회귀] isRunning false→true 전이는 캐시 무효화 안 함', async () => {
    const { rerender } = render(
      <Composer {...mkProps({ value: '/', isRunning: false })} />
    )

    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      rerender(<Composer {...mkProps({ value: '', isRunning: true })} />)
    })

    await new Promise((r) => setTimeout(r, 50))

    expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
  })

  it('[회귀] workspaceRoot 변경 시 IPC 재호출 (P10 기존 동작 유지)', async () => {
    const { rerender } = render(
      <Composer {...mkProps({ value: '/', isRunning: false, workspaceRoot: '/proj/a' })} />
    )

    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
    })

    rerender(
      <Composer {...mkProps({ value: '/', isRunning: false, workspaceRoot: '/proj/b' })} />
    )

    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(2)
    })
  })

  it('run이 2번 완료되면 "/" 재열기 시 IPC도 2번 재호출', async () => {
    mockListSlashCommands.mockResolvedValueOnce(FRESH_COMMANDS)

    const { baseElement, rerender } = render(
      <Composer {...mkProps({ value: '/', isRunning: false })} />
    )

    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(1)
    })

    rerender(<Composer {...mkProps({ value: '', isRunning: true })} />)
    await act(async () => {
      rerender(<Composer {...mkProps({ value: '', isRunning: false })} />)
    })
    rerender(<Composer {...mkProps({ value: '/', isRunning: false })} />)

    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(2)
    })

    rerender(<Composer {...mkProps({ value: '', isRunning: true })} />)
    await act(async () => {
      rerender(<Composer {...mkProps({ value: '', isRunning: false })} />)
    })
    rerender(<Composer {...mkProps({ value: '/', isRunning: false })} />)

    await waitFor(() => {
      expect(mockListSlashCommands).toHaveBeenCalledTimes(3)
    })

    void baseElement
  })
})
