import { useState, useRef, useCallback, type RefObject } from 'react'

interface UseInputHistoryProps {
  onChange: (v: string) => void
  inputRef: RefObject<HTMLTextAreaElement | null>
  onCaretChange?: (n: number) => void
}

export interface UseInputHistoryReturn {
  histIdx: number | null
  setHistIdx: React.Dispatch<React.SetStateAction<number | null>>
  histDraft: React.MutableRefObject<string>
  applyHistory: (text: string) => void
}

export function useInputHistory({
  onChange,
  inputRef,
  onCaretChange,
}: UseInputHistoryProps): UseInputHistoryReturn {
  const [histIdx, setHistIdx] = useState<number | null>(null)
  const histDraft = useRef('')

  const applyHistory = useCallback(
    (text: string): void => {
      onChange(text)
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        const n = el.value.length
        el.setSelectionRange(n, n)
        onCaretChange?.(n)
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange, inputRef, onCaretChange]
  )

  return { histIdx, setHistIdx, histDraft, applyHistory }
}
