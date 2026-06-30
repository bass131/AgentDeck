// @vitest-environment jsdom
/**
 * MentionPalette.test.tsx — @멘션 팔레트 하위 컴포넌트 렌더 테스트.
 * Composer.tsx Phase 14 분해: @mention 팔레트 JSX를 MentionPalette.tsx로 추출.
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MentionPalette } from '../../../02.Source/renderer/src/components/01_conversation/MentionPalette'
import type { MentionEntry, MentionResult } from '../../../02.Source/renderer/src/lib/mentions'

const FILE_ENTRIES: MentionEntry[] = [
  { kind: 'file', full: 'src/index.ts', name: 'index.ts', dir: 'src/' },
  { kind: 'file', full: 'src/utils.ts', name: 'utils.ts', dir: 'src/' },
]
const DIR_ENTRY: MentionEntry = { kind: 'dir', full: 'src', name: 'src', dir: '' }
const BROWSE_RESULT: MentionResult = {
  mode: 'browse', base: '', term: '', entries: [DIR_ENTRY, ...FILE_ENTRIES]
}

describe('MentionPalette', () => {
  it('mentionOpen=false → null 렌더', () => {
    const { container } = render(
      <MentionPalette
        mentionOpen={false}
        mentionHits={FILE_ENTRIES}
        safeMentionIdx={0}
        mentionResult={BROWSE_RESULT}
        mentionLocText="루트"
        setMentionIdx={vi.fn()}
        pickMention={vi.fn()}
      />
    )
    expect(container.querySelector('.slash-menu')).toBeFalsy()
  })

  it('mentionOpen=true → .slash-menu[role=listbox] 렌더', () => {
    const { container } = render(
      <MentionPalette
        mentionOpen={true}
        mentionHits={FILE_ENTRIES}
        safeMentionIdx={0}
        mentionResult={BROWSE_RESULT}
        mentionLocText="루트"
        setMentionIdx={vi.fn()}
        pickMention={vi.fn()}
      />
    )
    expect(container.querySelector('.slash-menu[role=listbox]')).toBeTruthy()
  })

  it('mention-loc 헤더(.slash-sec.mention-loc) 표시', () => {
    const { container } = render(
      <MentionPalette
        mentionOpen={true}
        mentionHits={FILE_ENTRIES}
        safeMentionIdx={0}
        mentionResult={BROWSE_RESULT}
        mentionLocText="루트"
        setMentionIdx={vi.fn()}
        pickMention={vi.fn()}
      />
    )
    expect(container.querySelector('.slash-sec.mention-loc')).toBeTruthy()
  })

  it('dir 항목 → .slash-ic.folder 렌더', () => {
    const { container } = render(
      <MentionPalette
        mentionOpen={true}
        mentionHits={[DIR_ENTRY]}
        safeMentionIdx={0}
        mentionResult={BROWSE_RESULT}
        mentionLocText="루트"
        setMentionIdx={vi.fn()}
        pickMention={vi.fn()}
      />
    )
    expect(container.querySelector('.slash-ic.folder')).toBeTruthy()
  })

  it('file 항목 → .slash-ic.ft 렌더', () => {
    const { container } = render(
      <MentionPalette
        mentionOpen={true}
        mentionHits={FILE_ENTRIES}
        safeMentionIdx={0}
        mentionResult={BROWSE_RESULT}
        mentionLocText="루트"
        setMentionIdx={vi.fn()}
        pickMention={vi.fn()}
      />
    )
    expect(container.querySelector('.slash-ic.ft')).toBeTruthy()
  })

  it('safeMentionIdx=1 → 두 번째 항목 .on', () => {
    const { container } = render(
      <MentionPalette
        mentionOpen={true}
        mentionHits={FILE_ENTRIES}
        safeMentionIdx={1}
        mentionResult={BROWSE_RESULT}
        mentionLocText="루트"
        setMentionIdx={vi.fn()}
        pickMention={vi.fn()}
      />
    )
    const opts = container.querySelectorAll('.slash-opt')
    expect(opts[1].classList.contains('on')).toBe(true)
  })
})
