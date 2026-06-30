/**
 * useInputPalettes.ts — 슬래시 커맨드 / @멘션 / 입력 히스토리 팔레트 공용 훅.
 *
 * Composer.tsx의 팔레트 로직(슬래시·멘션·히스토리)을 추출하여
 * Composer와 PanelComposer 양쪽에서 중복 없이 재사용.
 *
 * 단방향 데이터 흐름 유지:
 *   value/caret 입력 → 팔레트 계산 → 상태 반환 → 컴포넌트 리렌더.
 *
 * CRITICAL: window.api 화이트리스트만(listSlashCommands/listSkills). fs/Node 직접 0.
 * IPC 계약은 shared/ipc-contract에서 import.
 */
import { useState, useRef, useEffect, useCallback, useMemo, type MutableRefObject } from 'react'
import type { SlashCommandInfo, SkillInfo } from '../../../shared/ipc-contract'
import { mentionEntries } from '../lib/mentions'
import type { MentionEntry } from '../lib/mentions'

// ── 슬래시 쿼리 파싱 ──────────────────────────────────────────────────────────

/**
 * value가 '/'로 시작하고 공백이 없으면 슬래시 쿼리 반환. 아니면 null.
 * Composer.tsx parseSlashQuery와 동일 로직(단일 진실 공급원).
 */
export function parseSlashQuery(value: string): string | null {
  if (value.startsWith('/') && !/\s/.test(value)) {
    return value.slice(1)
  }
  return null
}

// ── @멘션 토큰 파싱 ───────────────────────────────────────────────────────────

export interface MentionToken {
  term: string
  start: number
  end: number
}

/**
 * caret 위치에서 @토큰을 추출.
 * Composer.tsx parseMentionToken과 동일 로직(단일 진실 공급원).
 */
export function parseMentionToken(value: string, caret: number): MentionToken | null {
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

// ── 훅 인터페이스 ─────────────────────────────────────────────────────────────

export interface UseInputPalettesOptions {
  value: string
  caret: number
  mentionFiles?: string[]
  workspaceRoot?: string | null
  history?: string[]
  isRunning?: boolean
  onChange: (v: string) => void
  onSlashAsk?: () => void
}

export interface SlashPaletteState {
  open: boolean
  query: string | null
  cmdHits: SlashCommandInfo[]
  skillHits: SkillInfo[]
  totalSlash: number
  safeSlashIdx: number
  slashIdx: number
  setSlashIdx: (i: number) => void
  dismiss: () => void
  pick: (name: string) => void
}

export interface MentionPaletteState {
  open: boolean
  mentionTok: MentionToken | null
  mentionHits: MentionEntry[]
  safeMentionIdx: number
  mentionIdx: number
  locText: string
  mode: 'browse' | 'search' | null
  setMentionIdx: (i: number) => void
  dismiss: () => void
  pick: (entry: MentionEntry) => void
}

export interface HistoryState {
  histIdx: number | null
  histDraftRef: MutableRefObject<string>
  applyHistory: (text: string) => void
  resetHistIdx: () => void
}

export interface UseInputPalettesResult {
  slash: SlashPaletteState
  mention: MentionPaletteState
  history: HistoryState
  onValueChange: (newValue: string, newCaret: number) => void
  onFocus: () => void
  onBlur: () => void
  handlePaletteKey: (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    inputRef: React.RefObject<HTMLTextAreaElement | null>
  ) => boolean
}

// ── 훅 구현 ──────────────────────────────────────────────────────────────────

export function useInputPalettes({
  value,
  caret,
  mentionFiles = [],
  workspaceRoot,
  history = [],
  isRunning = false,
  onChange,
  onSlashAsk,
}: UseInputPalettesOptions): UseInputPalettesResult {

  // ── 슬래시 팔레트 상태 ────────────────────────────────────────────────────
  const [slashDismissed, setSlashDismissed] = useState(false)
  const [slashIdx, setSlashIdx] = useState(0)

  // ── P10: 실 IPC 슬래시 커맨드·스킬 상태 ─────────────────────────────────
  const [liveCommands, setLiveCommands] = useState<SlashCommandInfo[] | null>(null)
  const [liveSkills, setLiveSkills] = useState<SkillInfo[] | null>(null)
  const loadedForRoot = useRef<string | null>(null)

  // ── isRunning 전이 시 캐시 무효화 ────────────────────────────────────────
  const prevIsRunningRef = useRef<boolean>(isRunning)
  useEffect(() => {
    const prev = prevIsRunningRef.current
    prevIsRunningRef.current = isRunning
    if (prev === true && isRunning === false) {
      loadedForRoot.current = null
    }
  }, [isRunning])

  // ── @멘션 팔레트 상태 ─────────────────────────────────────────────────────
  const [mentionDismissed, setMentionDismissed] = useState(false)
  const [mentionIdx, setMentionIdx] = useState(0)

  // ── B9: 입력 히스토리 상태 ────────────────────────────────────────────────
  const [histIdx, setHistIdx] = useState<number | null>(null)
  const histDraftRef = useRef('')

  // ── 슬래시 계산 ───────────────────────────────────────────────────────────
  const slashQuery = parseSlashQuery(value)
  const slashOpen = slashQuery !== null && !slashDismissed
  const rootKey = workspaceRoot ?? ''

  // IPC 로드
  useEffect(() => {
    if (!slashOpen) return
    if (loadedForRoot.current === rootKey) return

    loadedForRoot.current = rootKey

    const hasListCmds = typeof window?.api?.listSlashCommands === 'function'
    const hasListSkills = typeof window?.api?.listSkills === 'function'

    if (!hasListCmds && !hasListSkills) {
      setLiveCommands([])
      setLiveSkills([])
      return
    }

    let cancelled = false
    Promise.all([
      hasListCmds ? window.api.listSlashCommands() : Promise.resolve([] as SlashCommandInfo[]),
      hasListSkills ? window.api.listSkills() : Promise.resolve([] as SkillInfo[]),
    ]).then(([cmds, skills]) => {
      if (cancelled) return
      setLiveCommands(cmds)
      setLiveSkills(skills)
    }).catch(() => {
      if (cancelled) return
      setLiveCommands([])
      setLiveSkills([])
    })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slashOpen, rootKey])

  // useMemo로 안정화 — useCallback deps에 배열 직접 전달 시 매 렌더 새 참조로 재생성 방지.
  const allCommands = useMemo<SlashCommandInfo[]>(() => liveCommands ?? [], [liveCommands])
  const allSkills = useMemo<SkillInfo[]>(() => liveSkills ?? [], [liveSkills])

  const cmdHits = useMemo(
    () =>
      slashOpen && slashQuery !== null
        ? allCommands.filter((c) => c.name.toLowerCase().includes(slashQuery.toLowerCase()))
        : [],
    [slashOpen, slashQuery, allCommands]
  )
  const skillHits = useMemo(
    () =>
      slashOpen && slashQuery !== null
        ? allSkills.filter(
            (s) =>
              s.name.toLowerCase().includes(slashQuery.toLowerCase()) ||
              (s.description ?? '').toLowerCase().includes(slashQuery.toLowerCase())
          )
        : [],
    [slashOpen, slashQuery, allSkills]
  )
  const totalSlash = cmdHits.length + skillHits.length
  const safeSlashIdx = totalSlash > 0 ? Math.min(slashIdx, totalSlash - 1) : 0

  // ── @멘션 계산 ────────────────────────────────────────────────────────────
  const mentionTok = parseMentionToken(value, caret)
  const mentionOpen = mentionTok !== null && !mentionDismissed
  const mentionResult = mentionOpen && mentionTok ? mentionEntries(mentionFiles, mentionTok.term) : null
  const mentionHits = useMemo<MentionEntry[]>(() => mentionResult?.entries ?? [], [mentionResult])
  const safeMentionIdx = mentionHits.length > 0 ? Math.min(mentionIdx, mentionHits.length - 1) : 0

  const mentionLocText: string = (() => {
    if (!mentionResult) return ''
    if (mentionResult.mode === 'search') {
      return `'${mentionResult.term}' 검색`
    }
    const baseName = mentionResult.base || '루트'
    return mentionResult.term ? `${baseName} · '${mentionResult.term}'` : baseName
  })()

  // ── 슬래시 선택 ───────────────────────────────────────────────────────────
  const pickSlash = useCallback(
    (name: string) => {
      if (name === 'ask' && onSlashAsk) {
        setSlashDismissed(true)
        setSlashIdx(0)
        onSlashAsk()
        return
      }
      onChange('/' + name + ' ')
      setSlashDismissed(true)
      setSlashIdx(0)
    },
    [onChange, onSlashAsk]
  )

  // ── 멘션 선택 (inputRef 포함 버전) ───────────────────────────────────────
  const pickMentionWithRef = useCallback(
    (entry: MentionEntry, inputRef: React.RefObject<HTMLTextAreaElement | null>) => {
      if (!mentionTok) return
      if (entry.kind === 'dir') {
        const inserted = entry.full + '/'
        const newValue =
          value.slice(0, mentionTok.start) + '@' + inserted + value.slice(mentionTok.end)
        onChange(newValue)
        setMentionIdx(0)
        const newCaret = mentionTok.start + 1 + inserted.length
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.setSelectionRange(newCaret, newCaret)
          }
        }, 0)
      } else {
        const newValue =
          value.slice(0, mentionTok.start) + '@' + entry.full + ' ' + value.slice(mentionTok.end)
        onChange(newValue)
        setMentionDismissed(true)
        const newCaret = mentionTok.start + 1 + entry.full.length + 1
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.setSelectionRange(newCaret, newCaret)
          }
        }, 0)
      }
    },
    [mentionTok, value, onChange]
  )

  // ── 멘션 선택 (noRef 버전 — mention.pick 외부 노출용) ────────────────────
  const pickMentionNoRef = useCallback(
    (entry: MentionEntry) => {
      const dummyRef = { current: null } as React.RefObject<HTMLTextAreaElement | null>
      pickMentionWithRef(entry, dummyRef)
    },
    [pickMentionWithRef]
  )

  // ── B9: 히스토리 적용 (inputRef 포함 — rAF focus/cursor) ─────────────────
  const applyHistoryWithRef = useCallback(
    (text: string, inputRef: React.RefObject<HTMLTextAreaElement | null>) => {
      onChange(text)
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        const n = el.value.length
        el.setSelectionRange(n, n)
      })
    },
    [onChange]
  )

  // ── B9: 히스토리 적용 (noRef 버전 — history.applyHistory 외부 노출용) ────
  const applyHistoryNoRef = useCallback(
    (text: string) => {
      onChange(text)
    },
    [onChange]
  )

  const resetHistIdx = useCallback(() => {
    setHistIdx(null)
  }, [])

  // ── 키 핸들러 ─────────────────────────────────────────────────────────────
  const handlePaletteKey = useCallback(
    (
      e: React.KeyboardEvent<HTMLTextAreaElement>,
      inputRef: React.RefObject<HTMLTextAreaElement | null>
    ): boolean => {
      // 슬래시 팔레트 우선
      if (slashOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          if (totalSlash > 0) {
            setSlashIdx((i) => (i + 1) % totalSlash)
          }
          return true
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          if (totalSlash > 0) {
            setSlashIdx((i) => (i - 1 + totalSlash) % totalSlash)
          }
          return true
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          if (totalSlash > 0) {
            const idx = safeSlashIdx
            if (idx < cmdHits.length) {
              pickSlash(cmdHits[idx].name)
            } else {
              const s = skillHits[idx - cmdHits.length]
              if (s) pickSlash(s.name)
            }
          }
          return true
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setSlashDismissed(true)
          return true
        }
      }

      // 멘션 팔레트
      if (mentionOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setMentionIdx((i) => (i + 1) % (mentionHits.length || 1))
          return true
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setMentionIdx((i) => (i - 1 + (mentionHits.length || 1)) % (mentionHits.length || 1))
          return true
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          const entry = mentionHits[safeMentionIdx]
          if (entry) pickMentionWithRef(entry, inputRef)
          return true
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setMentionDismissed(true)
          return true
        }
      }

      // B9: 히스토리 탐색 (팔레트 닫힘 상태에서만)
      if (history.length > 0 && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const pos = e.currentTarget.selectionStart ?? value.length
        const onFirstLine = !value.slice(0, pos).includes('\n')
        const onLastLine = !value.slice(pos).includes('\n')

        if (e.key === 'ArrowUp' && onFirstLine) {
          e.preventDefault()
          if (histIdx === null) histDraftRef.current = value
          const next = histIdx === null ? history.length - 1 : Math.max(0, histIdx - 1)
          setHistIdx(next)
          applyHistoryWithRef(history[next], inputRef)
          return true
        }

        if (e.key === 'ArrowDown' && onLastLine && histIdx !== null) {
          e.preventDefault()
          if (histIdx >= history.length - 1) {
            setHistIdx(null)
            applyHistoryWithRef(histDraftRef.current, inputRef)
          } else {
            const next = histIdx + 1
            setHistIdx(next)
            applyHistoryWithRef(history[next], inputRef)
          }
          return true
        }
      }

      return false
    },
    [
      slashOpen,
      mentionOpen,
      totalSlash,
      safeSlashIdx,
      cmdHits,
      skillHits,
      mentionHits,
      safeMentionIdx,
      pickSlash,
      pickMentionWithRef,
      history,
      histIdx,
      value,
      applyHistoryWithRef,
    ]
  )

  // ── onChange 래퍼 ─────────────────────────────────────────────────────────
  const onValueChange = useCallback((newValue: string, _newCaret: number) => {
    onChange(newValue)
    setMentionDismissed(false)
    setSlashDismissed(false)
    setHistIdx(null)
  }, [onChange])

  const onFocus = useCallback(() => {
    setSlashDismissed(false)
    setMentionDismissed(false)
  }, [])

  const onBlur = useCallback(() => {
    setSlashDismissed(true)
    setMentionDismissed(true)
  }, [])

  return {
    slash: {
      open: slashOpen,
      query: slashQuery,
      cmdHits,
      skillHits,
      totalSlash,
      safeSlashIdx,
      slashIdx,
      setSlashIdx,
      dismiss: () => setSlashDismissed(true),
      pick: pickSlash,
    },
    mention: {
      open: mentionOpen,
      mentionTok,
      mentionHits,
      safeMentionIdx,
      mentionIdx,
      locText: mentionLocText,
      mode: mentionResult?.mode ?? null,
      setMentionIdx,
      dismiss: () => setMentionDismissed(true),
      pick: pickMentionNoRef,
    },
    history: {
      histIdx,
      histDraftRef,
      applyHistory: applyHistoryNoRef,
      resetHistIdx,
    },
    onValueChange,
    onFocus,
    onBlur,
    handlePaletteKey,
  }
}
