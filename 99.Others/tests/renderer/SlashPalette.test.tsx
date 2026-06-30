// @vitest-environment jsdom
/**
 * SlashPalette.test.tsx — 슬래시 커맨드 팔레트 하위 컴포넌트 렌더 테스트.
 * Composer.tsx Phase 14 분해: 슬래시 메뉴 JSX를 SlashPalette.tsx로 추출.
 * 기존 통합 테스트(composer-trays.test.tsx, composer-slash-ipc.test.tsx)가 거동 커버.
 * 여기서는 독립 렌더 구조만 검증.
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { SlashPalette } from '../../../02.Source/renderer/src/components/01_conversation/SlashPalette'
import type { SlashCommandInfo, SkillInfo } from '../../../02.Source/shared/ipc-contract'

const CMDS: SlashCommandInfo[] = [
  { name: 'ask',  description: '임시 질문', scope: 'builtin' },
  { name: 'init', description: 'CLAUDE.md',  scope: 'builtin' },
]
const SKILLS: SkillInfo[] = [
  { name: 'claude-api', description: 'API 참조', scope: 'global', enabled: true },
]

describe('SlashPalette', () => {
  it('slashOpen=false → null 렌더', () => {
    const { container } = render(
      <SlashPalette
        slashOpen={false}
        cmdHits={CMDS}
        skillHits={SKILLS}
        safeSlashIdx={0}
        setSlashIdx={vi.fn()}
        pickSlash={vi.fn()}
      />
    )
    expect(container.querySelector('.slash-menu')).toBeFalsy()
  })

  it('slashOpen=true → .slash-menu[role=listbox] 렌더', () => {
    const { container } = render(
      <SlashPalette
        slashOpen={true}
        cmdHits={CMDS}
        skillHits={SKILLS}
        safeSlashIdx={0}
        setSlashIdx={vi.fn()}
        pickSlash={vi.fn()}
      />
    )
    expect(container.querySelector('.slash-menu[role=listbox]')).toBeTruthy()
  })

  it('cmdHits에 ask/init → .slash-name 텍스트 포함', () => {
    const { container } = render(
      <SlashPalette
        slashOpen={true}
        cmdHits={CMDS}
        skillHits={[]}
        safeSlashIdx={0}
        setSlashIdx={vi.fn()}
        pickSlash={vi.fn()}
      />
    )
    const names = Array.from(container.querySelectorAll('.slash-name')).map((n) => n.textContent)
    expect(names).toContain('ask')
    expect(names).toContain('init')
  })

  it('skillHits 있으면 스킬 섹션 표시', () => {
    const { container } = render(
      <SlashPalette
        slashOpen={true}
        cmdHits={[]}
        skillHits={SKILLS}
        safeSlashIdx={0}
        setSlashIdx={vi.fn()}
        pickSlash={vi.fn()}
      />
    )
    const secs = Array.from(container.querySelectorAll('.slash-sec')).map((s) => s.textContent)
    expect(secs.some((s) => s?.includes('스킬'))).toBe(true)
  })

  it('safeSlashIdx=1 → 두 번째 항목에 .on 클래스', () => {
    const { container } = render(
      <SlashPalette
        slashOpen={true}
        cmdHits={CMDS}
        skillHits={[]}
        safeSlashIdx={1}
        setSlashIdx={vi.fn()}
        pickSlash={vi.fn()}
      />
    )
    const opts = container.querySelectorAll('.slash-opt')
    expect(opts[1].classList.contains('on')).toBe(true)
  })

  it('커스텀 커맨드(scope=project) → scope 배지 표시', () => {
    const { container } = render(
      <SlashPalette
        slashOpen={true}
        cmdHits={[{ name: 'deploy', description: '배포', scope: 'project' }]}
        skillHits={[]}
        safeSlashIdx={0}
        setSlashIdx={vi.fn()}
        pickSlash={vi.fn()}
      />
    )
    expect(container.querySelector('.slash-scope-badge')).toBeTruthy()
  })
})
