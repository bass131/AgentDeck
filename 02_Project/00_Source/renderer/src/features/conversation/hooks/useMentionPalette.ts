import { useState, useCallback, type RefObject } from 'react'
import { mentionEntries } from '../../../lib/mentions'
import type { MentionEntry } from '../../../lib/mentions'

interface MentionToken {
  term: string
  start: number
  end: number
}

function parseMentionToken(value: string, caret: number): MentionToken | null {
  const before = value.slice(0, caret)
  const atIdx = before.lastIndexOf('@')
  if (atIdx === -1) return null
  const afterAt = before.slice(atIdx + 1)
  if (/\s/.test(afterAt)) return null
  const term = afterAt
  const rest = value.slice(caret)
  const spaceIdx = rest.search(/\s/)
  const end = spaceIdx === -1 ? value.length : caret + spaceIdx
  return { term, start: atIdx, end }
}

interface UseMentionPaletteProps {
  value: string
  mentionFiles: string[]
  onChange: (v: string) => void
  inputRef: RefObject<HTMLTextAreaElement | null>
}

export interface UseMentionPaletteReturn {
  caret: number
  setCaret: React.Dispatch<React.SetStateAction<number>>
  mentionOpen: boolean
  mentionIdx: number
  setMentionIdx: React.Dispatch<React.SetStateAction<number>>
  mentionDismissed: boolean
  setMentionDismissed: React.Dispatch<React.SetStateAction<boolean>>
  mentionHits: MentionEntry[]
  safeMentionIdx: number
  mentionResult: ReturnType<typeof mentionEntries> | null
  mentionLocText: string
  pickMention: (entry: MentionEntry) => void
}

export function useMentionPalette({
  value,
  mentionFiles,
  onChange,
  inputRef,
}: UseMentionPaletteProps): UseMentionPaletteReturn {
  const [caret, setCaret] = useState(() => value.length)
  const [mentionDismissed, setMentionDismissed] = useState(false)
  const [mentionIdx, setMentionIdx] = useState(0)

  const mentionTok = parseMentionToken(value, caret)
  const mentionOpen = mentionTok !== null && !mentionDismissed

  const mentionResult = mentionOpen && mentionTok ? mentionEntries(mentionFiles, mentionTok.term) : null
  const mentionHits: MentionEntry[] = mentionResult?.entries ?? []
  const safeMentionIdx = mentionHits.length > 0 ? Math.min(mentionIdx, mentionHits.length - 1) : 0

  const mentionLocText: string = (() => {
    if (!mentionResult) return ''
    if (mentionResult.mode === 'search') return `'${mentionResult.term}' 검색`
    const baseName = mentionResult.base || '루트'
    return mentionResult.term ? `${baseName} · '${mentionResult.term}'` : baseName
  })()

  const pickMention = useCallback(
    (entry: MentionEntry) => {
      if (!mentionTok) return
      if (entry.kind === 'dir') {
        const inserted = entry.full + '/'
        const newValue =
          value.slice(0, mentionTok.start) + '@' + inserted + value.slice(mentionTok.end)
        onChange(newValue)
        setMentionIdx(0)
        const newCaret = mentionTok.start + 1 + inserted.length
        setCaret(newCaret)
        setTimeout(() => {
          if (inputRef.current) inputRef.current.setSelectionRange(newCaret, newCaret)
        }, 0)
      } else {
        const newValue =
          value.slice(0, mentionTok.start) + '@' + entry.full + ' ' + value.slice(mentionTok.end)
        onChange(newValue)
        setMentionDismissed(true)
        const newCaret = mentionTok.start + 1 + entry.full.length + 1
        setCaret(newCaret)
        setTimeout(() => {
          if (inputRef.current) inputRef.current.setSelectionRange(newCaret, newCaret)
        }, 0)
      }
    },
    [mentionTok, value, onChange, inputRef]
  )

  return {
    caret,
    setCaret,
    mentionOpen,
    mentionIdx,
    setMentionIdx,
    mentionDismissed,
    setMentionDismissed,
    mentionHits,
    safeMentionIdx,
    mentionResult,
    mentionLocText,
    pickMention,
  }
}
