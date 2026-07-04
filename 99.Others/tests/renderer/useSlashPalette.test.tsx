// @vitest-environment jsdom
/**
 * useSlashPalette.test.tsx — B6 슬래시 팔레트 훅 단위 테스트.
 *
 * Composer.tsx 리팩토링 Phase 14: IPC 슬래시 커맨드 로드·필터·선택 훅화 검증.
 *
 * 검증:
 *   1. '/'로 시작 + 공백 없음 → slashOpen=true
 *   2. 공백 포함 value → slashOpen=false
 *   3. slashDismissed=true → slashOpen=false
 *   4. pickSlash → onChange('/{name} ') 호출
 *   5. pickSlash('ask') + onSlashAsk → onSlashAsk 호출, onChange 미호출
 *   6. IPC 로드 → cmdHits/skillHits 필터 반영
 *   7. isRunning true→false 전이 → 캐시 무효화(loadedForRoot 리셋)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSlashPalette } from '../../../02.Source/renderer/src/components/01_conversation/hooks/useSlashPalette'
import type { SlashCommandInfo, SkillInfo } from '../../../02.Source/shared/ipc-contract'

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
    // 단일챗은 root 파라미터를 배선하지 않는다(CP1 P03 범위 밖) — workspaceRoot는
    // 캐시 키로만 쓰이고 실제 IPC 인자는 여전히 무인자여야 한다.
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
    // 1차 IPC 로드
    await waitFor(() => expect(mockList.listSlashCommands).toHaveBeenCalledTimes(1))
    // run 시작
    rerender({ value: '', isRunning: true })
    // run 완료(무효화 발생)
    await act(async () => {
      rerender({ value: '', isRunning: false })
    })
    // 팔레트 재열기
    rerender({ value: '/', isRunning: false })
    // 2차 IPC 호출 확인
    await waitFor(() => expect(mockList.listSlashCommands).toHaveBeenCalledTimes(2))
  })
})
