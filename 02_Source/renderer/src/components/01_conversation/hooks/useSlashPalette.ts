import { useState, useRef, useEffect, useCallback } from 'react'
import type { SlashCommandInfo, SkillInfo } from '../../../../../shared/ipcContract'

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

  const [liveCommands, setLiveCommands] = useState<SlashCommandInfo[] | null>(null)
  const [liveSkills, setLiveSkills] = useState<SkillInfo[] | null>(null)
  const loadedForRoot = useRef<string | null>(null)

  const prevIsRunningRef = useRef<boolean>(isRunning)

  useEffect(() => {
    const prev = prevIsRunningRef.current
    prevIsRunningRef.current = isRunning
    if (prev === true && isRunning === false) {
      loadedForRoot.current = null
    }
  }, [isRunning])

  const slashQuery = parseSlashQuery(value)
  const rootKey = workspaceRoot ?? ''
  const slashOpen = slashQuery !== null && !slashDismissed

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
        setLiveCommands([])
        setLiveSkills([])
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slashOpen, rootKey])

  const allCommands: SlashCommandInfo[] = liveCommands ?? []
  const allSkills: SkillInfo[] = liveSkills ?? []

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
  const safeSlashIdx = totalSlash > 0 ? Math.min(slashIdx, totalSlash - 1) : 0

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
