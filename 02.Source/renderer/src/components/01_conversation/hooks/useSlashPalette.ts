/**
 * useSlashPalette.ts — B6 슬래시 커맨드 팔레트 훅.
 *
 * '/'로 시작하는 값 → 팔레트 열림.
 * P10: 첫 열기 시 window.api.listSlashCommands/listSkills IPC 호출.
 * ADR-019: isRunning true→false 전이 시 캐시 무효화 → 재열기 시 IPC 재호출.
 *
 * 상태 출처 단일화: slashDismissed/slashIdx/liveCommands/liveSkills/loadedForRoot는 이 훅 소유.
 * CRITICAL: window.api 화이트리스트(listSlashCommands/listSkills)만 호출. fs/Node 0.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import type { SlashCommandInfo, SkillInfo } from '../../../../../shared/ipc-contract'

/** value가 '/'로 시작하고 공백 없음 → 슬래시 쿼리 반환. 아니면 null. */
function parseSlashQuery(value: string): string | null {
  if (value.startsWith('/') && !/\s/.test(value)) return value.slice(1)
  return null
}

interface UseSlashPaletteProps {
  value: string
  isRunning: boolean
  workspaceRoot?: string | null
  onChange: (v: string) => void
  onSlashAsk?: () => void
}

export interface UseSlashPaletteReturn {
  slashOpen: boolean
  slashQuery: string | null
  slashIdx: number
  setSlashIdx: React.Dispatch<React.SetStateAction<number>>
  slashDismissed: boolean
  setSlashDismissed: React.Dispatch<React.SetStateAction<boolean>>
  cmdHits: SlashCommandInfo[]
  skillHits: SkillInfo[]
  totalSlash: number
  safeSlashIdx: number
  pickSlash: (name: string) => void
}

export function useSlashPalette({
  value,
  isRunning,
  workspaceRoot,
  onChange,
  onSlashAsk,
}: UseSlashPaletteProps): UseSlashPaletteReturn {
  const [slashDismissed, setSlashDismissed] = useState(false)
  const [slashIdx, setSlashIdx] = useState(0)

  // P10: 실 IPC 슬래시 커맨드·스킬 상태. null = 아직 로드 안 함.
  const [liveCommands, setLiveCommands] = useState<SlashCommandInfo[] | null>(null)
  const [liveSkills, setLiveSkills] = useState<SkillInfo[] | null>(null)
  // 로드된 workspaceRoot 기억 → 중복 IPC 방지 (null = 미로드)
  const loadedForRoot = useRef<string | null>(null)

  // ADR-019: run 완료 감지용 (isRunning true→false 전이 시 캐시 무효화)
  const prevIsRunningRef = useRef<boolean>(isRunning)

  // ADR-019: isRunning true→false 전이 → loadedForRoot 리셋 → 다음 팔레트 열기 시 IPC 재호출
  useEffect(() => {
    const prev = prevIsRunningRef.current
    prevIsRunningRef.current = isRunning
    if (prev === true && isRunning === false) {
      loadedForRoot.current = null
    }
  }, [isRunning])

  // 파생값
  const slashQuery = parseSlashQuery(value)
  const rootKey = workspaceRoot ?? ''
  const slashOpen = slashQuery !== null && !slashDismissed

  // P10: '/' 팔레트 열림 시 또는 workspaceRoot 변경 시 IPC 로드 (같은 root면 캐시)
  useEffect(() => {
    if (!slashOpen) return
    if (loadedForRoot.current === rootKey) return
    loadedForRoot.current = rootKey // 로드 시작 전 마킹 (중복 방지)

    const hasListCmds = typeof window?.api?.listSlashCommands === 'function'
    const hasListSkills = typeof window?.api?.listSkills === 'function'

    if (!hasListCmds && !hasListSkills) {
      setLiveCommands([])
      setLiveSkills([])
      return
    }

    let cancelled = false
    Promise.all([
      hasListCmds
        ? window.api.listSlashCommands()
        : Promise.resolve([] as SlashCommandInfo[]),
      hasListSkills
        ? window.api.listSkills()
        : Promise.resolve([] as SkillInfo[]),
    ])
      .then(([cmds, skills]) => {
        if (cancelled) return
        setLiveCommands(cmds)
        setLiveSkills(skills)
      })
      .catch(() => {
        if (cancelled) return
        // IPC 실패 → 빈 배열 graceful fallback
        setLiveCommands([])
        setLiveSkills([])
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slashOpen, rootKey])

  // IPC 로드 완료 전에는 빈 배열 (팔레트 열린 채 항목 없음)
  const allCommands: SlashCommandInfo[] = liveCommands ?? []
  const allSkills: SkillInfo[] = liveSkills ?? []

  // 🟡-C: 대소문자 무시 필터 (원본 Chat.tsx:1460,1482 패턴)
  const cmdHits =
    slashOpen && slashQuery !== null
      ? allCommands.filter((c) =>
          c.name.toLowerCase().includes(slashQuery.toLowerCase())
        )
      : []
  const skillHits =
    slashOpen && slashQuery !== null
      ? allSkills.filter(
          (s) =>
            s.name.toLowerCase().includes(slashQuery.toLowerCase()) ||
            (s.description ?? '').toLowerCase().includes(slashQuery.toLowerCase())
        )
      : []

  const totalSlash = cmdHits.length + skillHits.length
  // 🟡-B: totalSlash=0이면 clamp → 0
  const safeSlashIdx = totalSlash > 0 ? Math.min(slashIdx, totalSlash - 1) : 0

  // 슬래시 커맨드/스킬 선택: /ask + onSlashAsk 주입 시 모달. 나머지는 '/{name} ' 삽입.
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

  return {
    slashOpen,
    slashQuery,
    slashIdx,
    setSlashIdx,
    slashDismissed,
    setSlashDismissed,
    cmdHits,
    skillHits,
    totalSlash,
    safeSlashIdx,
    pickSlash,
  }
}
