import { useCallback } from 'react'
import type { UseSlashPaletteReturn } from './useSlashPalette'
import type { UseMentionPaletteReturn } from './useMentionPalette'
import type { UseInputHistoryReturn } from './useInputHistory'

interface UseComposerKeyHandlerProps {
  disabled: boolean
  slash: UseSlashPaletteReturn
  mention: UseMentionPaletteReturn
  hist: UseInputHistoryReturn
  history: string[]
  value: string
  doSend: () => void
}

export function useComposerKeyHandler({
  disabled,
  slash,
  mention,
  hist,
  history,
  value,
  doSend,
}: UseComposerKeyHandlerProps): (e: React.KeyboardEvent<HTMLTextAreaElement>) => void {
  return useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (disabled) {
        e.preventDefault()
        return
      }

      if (slash.slashOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          if (slash.totalSlash > 0) slash.setSlashIdx((i) => (i + 1) % slash.totalSlash)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          if (slash.totalSlash > 0)
            slash.setSlashIdx((i) => (i - 1 + slash.totalSlash) % slash.totalSlash)
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          if (slash.totalSlash > 0) {
            const idx = slash.safeSlashIdx
            if (idx < slash.cmdHits.length) {
              slash.pickSlash(slash.cmdHits[idx].name)
            } else {
              const s = slash.skillHits[idx - slash.cmdHits.length]
              if (s) slash.pickSlash(s.name)
            }
          }
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          slash.setSlashDismissed(true)
          return
        }
      }

      if (mention.mentionOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          mention.setMentionIdx((i) => (i + 1) % (mention.mentionHits.length || 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          mention.setMentionIdx(
            (i) =>
              (i - 1 + (mention.mentionHits.length || 1)) % (mention.mentionHits.length || 1)
          )
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          const entry = mention.mentionHits[mention.safeMentionIdx]
          if (entry) mention.pickMention(entry)
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          mention.setMentionDismissed(true)
          return
        }
      }

      if (history.length > 0 && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const pos = e.currentTarget.selectionStart ?? value.length
        const onFirstLine = !value.slice(0, pos).includes('\n')
        const onLastLine = !value.slice(pos).includes('\n')

        if (e.key === 'ArrowUp' && onFirstLine) {
          e.preventDefault()
          if (hist.histIdx === null) hist.histDraft.current = value
          const next =
            hist.histIdx === null ? history.length - 1 : Math.max(0, hist.histIdx - 1)
          hist.setHistIdx(next)
          hist.applyHistory(history[next])
          return
        }
        if (e.key === 'ArrowDown' && onLastLine && hist.histIdx !== null) {
          e.preventDefault()
          if (hist.histIdx >= history.length - 1) {
            hist.setHistIdx(null)
            hist.applyHistory(hist.histDraft.current)
          } else {
            const next = hist.histIdx + 1
            hist.setHistIdx(next)
            hist.applyHistory(history[next])
          }
          return
        }
      }

      if (e.key === 'Enter' && !e.shiftKey && !slash.slashOpen && !mention.mentionOpen) {
        e.preventDefault()
        hist.setHistIdx(null)
        doSend()
      }
    },
    [disabled, slash, mention, hist, history, value, doSend]
  )
}
