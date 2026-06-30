/**
 * useMentionPalette.ts — @멘션 팔레트 훅.
 *
 * caret 위치의 @토큰을 파싱 → 팔레트 열림 여부 계산.
 * mentionEntries로 파일 browse/search 결과 반환.
 * pickMention: dir → 드릴다운(@dir/), file → 삽입 + dismiss.
 *
 * 상태 출처 단일화: caret·mentionDismissed·mentionIdx는 이 훅이 단독 소유.
 * setCaret은 Composer의 textarea onChange/onSelect/applyHistory에서 호출.
 * CRITICAL: renderer untrusted — IPC 0. 파일 목록은 mentionFiles prop으로만 수신.
 */
import { useState, useCallback, type RefObject } from 'react'
import { mentionEntries } from '../../../lib/mentions'
import type { MentionEntry } from '../../../lib/mentions'

/** Composer 로컬 @토큰 타입 (mentions.ts MentionToken과 필드명 다름 — term vs query) */
interface MentionToken {
  term: string  // @ 뒤 텍스트
  start: number // value 내 @토큰 시작 인덱스
  end: number   // value 내 @토큰 끝 인덱스 (exclusive)
}

/**
 * caret 위치에서 @토큰을 추출.
 * @ 뒤 공백 전까지가 토큰. @ 자체가 없으면 null.
 */
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
  // value.length 초기화: 외부 value 주입 시 caret이 끝에 있는 것이 자연스럽다 (원본 패턴)
  const [caret, setCaret] = useState(() => value.length)
  const [mentionDismissed, setMentionDismissed] = useState(false)
  const [mentionIdx, setMentionIdx] = useState(0)

  // 파생값: 매 렌더 재계산 (value·caret·dismissed 변화 반영)
  const mentionTok = parseMentionToken(value, caret)
  const mentionOpen = mentionTok !== null && !mentionDismissed

  // M4-2: mentionEntries(파일 목록, @토큰 query) → browse/search 결과
  const mentionResult = mentionOpen && mentionTok ? mentionEntries(mentionFiles, mentionTok.term) : null
  const mentionHits: MentionEntry[] = mentionResult?.entries ?? []
  const safeMentionIdx = mentionHits.length > 0 ? Math.min(mentionIdx, mentionHits.length - 1) : 0

  // mention-loc 헤더 텍스트 (browse 모드: 경로, search 모드: 검색어)
  const mentionLocText: string = (() => {
    if (!mentionResult) return ''
    if (mentionResult.mode === 'search') return `'${mentionResult.term}' 검색`
    const baseName = mentionResult.base || '루트'
    return mentionResult.term ? `${baseName} · '${mentionResult.term}'` : baseName
  })()

  // 멘션 항목 선택: dir → 드릴다운(@dir/), file → 삽입 + dismiss
  const pickMention = useCallback(
    (entry: MentionEntry) => {
      if (!mentionTok) return
      if (entry.kind === 'dir') {
        // 드릴다운: @{full}/ 삽입. mentionEntries가 새 query로 재계산 → 팔레트 자동 갱신.
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
        // 파일 선택: @path 삽입 후 공백 + dismiss
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
