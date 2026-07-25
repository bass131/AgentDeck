/**
 * useInputHistory.ts — B9 셸식 입력 히스토리 훅.
 *
 * ↑ 키: 현재 초안 보관 → 이전 메시지로 이동.
 * ↓ 키: 더 최신으로 이동, 최신 넘어서면 초안 복원.
 * 원본 Chat.tsx applyHistory 패턴 미러.
 *
 * 상태 출처 단일화: histIdx·histDraft는 이 훅이 단독 소유.
 * onCaretChange: applyHistory rAF 완료 후 @멘션 팔레트 caret 동기화 콜백(optional).
 * CRITICAL: renderer untrusted — IPC/fs 호출 0. 순수 메모리 상태.
 */
import { useState, useRef, useCallback, type RefObject } from 'react'

interface UseInputHistoryProps {
  onChange: (v: string) => void
  inputRef: RefObject<HTMLTextAreaElement | null>
  /** applyHistory rAF 완료 후 캐럿 위치를 알릴 콜백 (useMentionPalette.setCaret 연결용) */
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
  // null = 히스토리 탐색 안 함(초안 모드). 숫자 = history 배열의 현재 인덱스.
  const [histIdx, setHistIdx] = useState<number | null>(null)
  // 탐색 시작 전 작성 중이던 초안 보관 (ArrowDown 복귀 시 복원)
  const histDraft = useRef('')

  // 원본 Chat.tsx applyHistory 미러: onChange 후 rAF에서 focus + 커서 끝 이동.
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
