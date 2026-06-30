/**
 * MentionPalette.tsx — @멘션 팔레트 하위 컴포넌트.
 *
 * Composer.tsx Phase 14 분해: @mention 팔레트 JSX 추출.
 * M4-2: dir 드릴다운 + file 삽입 선택.
 * UI.md: 색은 상태 전달에만. 인라인 색상 0.
 */
import { type JSX } from 'react'
import { IconFolder, IconSearch, IconChevRight } from '../common/icons'
import { FileBadge } from '../02_file/FileBadge'
import type { MentionEntry, MentionResult } from '../../lib/mentions'

interface MentionPaletteProps {
  mentionOpen: boolean
  mentionHits: MentionEntry[]
  safeMentionIdx: number
  mentionResult: MentionResult | null
  mentionLocText: string
  setMentionIdx: (i: number) => void
  pickMention: (entry: MentionEntry) => void
}

export function MentionPalette({
  mentionOpen,
  mentionHits,
  safeMentionIdx,
  mentionResult,
  mentionLocText,
  setMentionIdx,
  pickMention,
}: MentionPaletteProps): JSX.Element | null {
  if (!mentionOpen) return null

  return (
    <div className="slash-menu scroll" role="listbox">
      <div className="slash-sec mention-loc">
        {mentionResult?.mode === 'browse' ? (
          <>
            <IconFolder size={11} />
            <span>{mentionLocText || '루트'}</span>
          </>
        ) : (
          <>
            <IconSearch size={11} />
            <span>{mentionLocText || '루트'}</span>
          </>
        )}
      </div>
      {mentionHits.map((e, i) => (
        <button
          key={e.kind + ':' + e.full}
          type="button"
          role="option"
          aria-selected={i === safeMentionIdx}
          className={'slash-opt' + (i === safeMentionIdx ? ' on' : '')}
          onMouseEnter={() => setMentionIdx(i)}
          onMouseDown={(ev) => {
            ev.preventDefault()
            pickMention(e)
          }}
        >
          {e.kind === 'dir' ? (
            <>
              <span className="slash-ic folder">
                <IconFolder size={16} />
              </span>
              <span className="slash-name">{e.name}</span>
              <span className="slash-desc into">
                <IconChevRight size={15} />
              </span>
            </>
          ) : (
            <>
              <span className="slash-ic ft">
                <FileBadge path={e.full} size={22} />
              </span>
              <span className="slash-name path">{e.name}</span>
              {e.dir !== undefined && (
                <span className="slash-desc">{e.dir ? e.dir.replace(/\/$/, '') : '루트'}</span>
              )}
            </>
          )}
        </button>
      ))}
    </div>
  )
}
