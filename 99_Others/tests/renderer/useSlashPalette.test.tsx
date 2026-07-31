// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSlashPalette } from '../../../02_Source/renderer/src/components/01_conversation/hooks/useSlashPalette'
import type { SlashCommandInfo, SkillInfo } from '../../../02_Source/shared/ipcContract'

const SAMPLE_COMMANDS: SlashCommandInfo[] = [
  { name: 'ask',    description: '임시 질문', scope: 'builtin' },
  { name: 'init',   description: 'CLAUDE.md',  scope: 'builtin' },
  { name: 'deploy', description: '배포 커맨드', scope: 'project' },
]
const SAMPLE_SKILLS: SkillInfo[] = [
  { name: 'claude-api', description: 'API 참조', scope: 'global', enabled: true },
]

beforeEach(() => {
  (window as unknown as Record<string, unknown>).api = {
    listSlashCommands: vi.fn().mockResolvedValue(SAMPLE_COMMANDS),
    listSkills: vi.fn().mockResolvedValue(SAMPLE_SKILLS),
  }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useSlashPalette', () => {
  it('"/" value → slashOpen=true', async () => {
    const { result } = renderHook(() =>
      useSlashPalette({ value: '/', isRunning: false, onChange: vi.fn() })
    )
    await waitFor(() => expect(result.current.slashOpen).toBe(true))
  })

  it('공백 포함 value("/ask text") → slashOpen=false', () => {
    const { result } = renderHook(() =>
      useSlashPalette({ value: '/ask text', isRunning: false, onChange: vi.fn() })
    )
    expect(result.current.slashOpen).toBe(false)
  })

  it('slashDismissed=true 후 → slashOpen=false', async () => {
    const { result } = renderHook(() =>
      useSlashPalette({ value: '/', isRunning: false, onChange: vi.fn() })
    )
    await waitFor(() => expect(result.current.slashOpen).toBe(true))
    act(() => {
      result.current.setSlashDismissed(true)
    })
    expect(result.current.slashOpen).toBe(false)
  })

  it('IPC 로드 후 cmdHits에 ask/init/deploy 포함', async () => {
    const { result } = renderHook(() =>
      useSlashPalette({ value: '/', isRunning: false, onChange: vi.fn() })
    )
    await waitFor(() => {
      expect(result.current.cmdHits.length).toBeGreaterThan(0)
    })
    const names = result.current.cmdHits.map((c) => c.name)
    expect(names).toContain('ask')
    expect(names).toContain('init')
    expect(names).toContain('deploy')
  })

  it('"/ask" 필터 → cmdHits에 ask만', async () => {
    const { result } = renderHook(() =>
      useSlashPalette({ value: '/ask', isRunning: false, onChange: vi.fn() })
    )
    await waitFor(() => {
      expect(result.current.cmdHits.length).toBeGreaterThan(0)
    })
    expect(result.current.cmdHits.every((c) => c.name.includes('ask'))).toBe(true)
  })

  it('pickSlash("deploy") → onChange("/deploy ") 호출', async () => {
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useSlashPalette({ value: '/', isRunning: false, onChange })
    )
    await waitFor(() => {
      expect(result.current.cmdHits.length).toBeGreaterThan(0)
    })
    act(() => {
      result.current.pickSlash('deploy')
    })
    expect(onChange).toHaveBeenCalledWith('/deploy ')
  })

  it('pickSlash("ask") + onSlashAsk → onSlashAsk 호출, onChange 미호출', async () => {
    const onChange = vi.fn()
    const onSlashAsk = vi.fn()
    const { result } = renderHook(() =>
      useSlashPalette({ value: '/', isRunning: false, onChange, onSlashAsk })
    )
    await waitFor(() => {
      expect(result.current.cmdHits.length).toBeGreaterThan(0)
    })
    act(() => {
      result.current.pickSlash('ask')
    })
    expect(onSlashAsk).toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('CP1 P03 회귀가드: workspaceRoot가 있어도 listSlashCommands/listSkills는 무인자 호출 유지 (단일챗 전역 폴백)', async () => {
    const mockList = (window as unknown as Record<string, unknown>).api as Record<string, ReturnType<typeof vi.fn>>
    renderHook(() =>
      useSlashPalette({ value: '/', isRunning: false, workspaceRoot: '/some/workspace', onChange: vi.fn() })
    )
    await waitFor(() => expect(mockList.listSlashCommands).toHaveBeenCalled())
    expect(mockList.listSlashCommands).toHaveBeenCalledWith()
    expect(mockList.listSkills).toHaveBeenCalledWith()
  })

  it('isRunning true→false 전이 후 "/" 재열기 → IPC 재호출', async () => {
    const mockList = (window as unknown as Record<string, unknown>).api as Record<string, ReturnType<typeof vi.fn>>
    const { rerender } = renderHook(
      ({ value, isRunning }: { value: string; isRunning: boolean }) =>
        useSlashPalette({ value, isRunning, onChange: vi.fn(), workspaceRoot: '/proj' }),
      { initialProps: { value: '/', isRunning: false } }
    )
    await waitFor(() => expect(mockList.listSlashCommands).toHaveBeenCalledTimes(1))
    rerender({ value: '', isRunning: true })
    await act(async () => {
      rerender({ value: '', isRunning: false })
    })
    rerender({ value: '/', isRunning: false })
    await waitFor(() => expect(mockList.listSlashCommands).toHaveBeenCalledTimes(2))
  })
})
