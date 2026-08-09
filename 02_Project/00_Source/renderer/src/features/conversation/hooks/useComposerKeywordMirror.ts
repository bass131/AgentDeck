import { useMemo, useRef, useState, useCallback, useEffect, type RefObject } from 'react'
import {
  segmentComposerHighlights,
  type ComposerHighlightSegment,
} from '../../../lib/composerHighlight'

export type OrchestrationHighlightVariant = 'active' | 'muted'

export interface UseComposerKeywordMirrorReturn {
  segments: ComposerHighlightSegment[]
  ghostActive: boolean
  hasOrchestrationKeyword: boolean
  highlightVariant: OrchestrationHighlightVariant
  mirrorRef: RefObject<HTMLDivElement | null>
  handleScroll: (e: React.UIEvent<HTMLTextAreaElement>) => void
  handleCompositionStart: () => void
  handleCompositionEnd: () => void
}

export function useComposerKeywordMirror(
  value: string,
  inputRef: RefObject<HTMLTextAreaElement | null>,
  orchestrationOn: boolean = true
): UseComposerKeywordMirrorReturn {
  const [isComposing, setIsComposing] = useState(false)
  const mirrorRef = useRef<HTMLDivElement>(null)

  const segments = useMemo(() => segmentComposerHighlights(value), [value])
  const hasKeyword = useMemo(() => segments.some((s) => s.kind !== 'none'), [segments])
  const hasOrchestrationKeyword = useMemo(
    () => segments.some((s) => s.kind === 'orchestration'),
    [segments]
  )
  const ghostActive = hasKeyword && !isComposing
  const highlightVariant: OrchestrationHighlightVariant = orchestrationOn ? 'active' : 'muted'

  const handleScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    const mirror = mirrorRef.current
    if (!mirror) return
    mirror.scrollTop = e.currentTarget.scrollTop
    mirror.scrollLeft = e.currentTarget.scrollLeft
  }, [])

  const handleCompositionStart = useCallback(() => setIsComposing(true), [])
  const handleCompositionEnd = useCallback(() => setIsComposing(false), [])

  useEffect(() => {
    const mirror = mirrorRef.current
    const el = inputRef.current
    if (!mirror || !el) return
    mirror.scrollTop = el.scrollTop
    mirror.scrollLeft = el.scrollLeft
  }, [value, ghostActive, inputRef])

  return {
    segments,
    ghostActive,
    hasOrchestrationKeyword,
    highlightVariant,
    mirrorRef,
    handleScroll,
    handleCompositionStart,
    handleCompositionEnd,
  }
}
