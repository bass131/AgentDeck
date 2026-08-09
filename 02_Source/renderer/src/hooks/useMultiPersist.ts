import { useState, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { PanelSessionHookResult } from '../store/panelSession'
import { snapshotForPersist } from '../store/panelSession'
import { DEFAULT_PICKER, SAMPLE_PANELS, type PickerState } from '../lib/multiAgentSampleData'
import type { PersistedPanel, PersistedMultiSession } from '../../../shared/ipcContract'
import { useAppStore } from '../store/appStore'
import { mirrorFromState } from '../store/slices/multiSession'

export const SLOTS = [0, 1, 2, 3, 4, 5]

export interface PanelMeta {
  title: string
  cwd?: string
  sysPrompt?: string
}

function makeDefaultPickers(): PickerState[] {
  return Array.from({ length: 6 }, () => ({ ...DEFAULT_PICKER }))
}

function makeDefaultPanelMetas(): PanelMeta[] {
  return SAMPLE_PANELS.map(() => ({
    title: '',
    cwd: undefined,
    sysPrompt: undefined,
  }))
}

export interface UseMultiPersistResult {
  count: number
  setCount: (n: number) => void
  panelMetas: PanelMeta[]
  setPanelMetas: Dispatch<SetStateAction<PanelMeta[]>>
  panelCwds: Record<number, string | null>
  setPanelCwds: Dispatch<SetStateAction<Record<number, string | null>>>
  pickers: PickerState[]
  setPickers: Dispatch<SetStateAction<PickerState[]>>
}

export function useMultiPersist(
  sessions: PanelSessionHookResult[],
  activeMultiSessionId: string,
): UseMultiPersistResult {
  const [count, setCount] = useState(4)
  const [panelMetas, setPanelMetas] = useState<PanelMeta[]>(makeDefaultPanelMetas)
  const [panelCwds, setPanelCwds] = useState<Record<number, string | null>>({})
  const [pickers, setPickers] = useState<PickerState[]>(makeDefaultPickers)

  const restoredRef = useRef(false)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const buildActiveSessionRef = useRef<(() => PersistedMultiSession) | null>(null)

  const [s0, s1, s2, s3, s4, s5] = sessions

  const buildActiveSession = useCallback((): PersistedMultiSession => {
    const panels: PersistedPanel[] = SLOTS.slice(0, 6).map((slot) => {
      const meta = panelMetas[slot] ?? { title: '' }
      const picker = pickers[slot] ?? DEFAULT_PICKER
      const sessionState = sessions[slot]?.state
      const snapshot = sessionState ? snapshotForPersist(sessionState) : undefined
      const hasSnapshot = snapshot && snapshot.messages.length > 0

      return {
        title: meta.title,
        ...(panelCwds[slot] != null ? { cwd: panelCwds[slot] as string } : meta.cwd ? { cwd: meta.cwd } : {}),
        picker: {
          model: picker.model,
          effort: picker.effort,
          mode: picker.mode,
        },
        ...(meta.sysPrompt ? { sysPrompt: meta.sysPrompt } : {}),
        ...(hasSnapshot ? { snapshot } : {}),
      }
    })

    return {
      id: activeMultiSessionId,
      count,
      panels,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMultiSessionId, count, panelMetas, pickers, panelCwds, s0.state, s1.state, s2.state, s3.state, s4.state, s5.state])

  buildActiveSessionRef.current = buildActiveSession

  const performUpsert = useCallback(async (activeSession: PersistedMultiSession): Promise<void> => {
    if (!activeSession.id) return
    if (typeof window?.api?.multiCmdUpsert !== 'function') return
    try {
      const res = await window.api.multiCmdUpsert(activeSession)
      useAppStore.setState(mirrorFromState(res.state))
    } catch {
    }
  }, [])

  const flushUpsert = useCallback((activeSession: PersistedMultiSession): void => {
    if (!activeSession.id) return
    if (typeof window?.api?.multiCmdUpsert !== 'function') return
    void window.api.multiCmdUpsert(activeSession).catch(() => {
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await window.api.multiSessionLoad()
        if (cancelled) return

        if (res.state && res.state.version === 2 && res.state.sessions.length > 0) {
          const preferredId = activeMultiSessionId || res.state.activeSessionId
          const activeSession = res.state.sessions.find((s) => s.id === preferredId)

          if (activeSession) {
            const restoredCount = Math.min(Math.max(activeSession.count, 2), 6)
            setCount(restoredCount)

            const restoredMetas = makeDefaultPanelMetas()
            const restoredPickersArr = makeDefaultPickers()
            const restoredCwds: Record<number, string | null> = {}

            activeSession.panels.forEach((panel: PersistedPanel, i: number) => {
              if (i >= 6) return
              restoredMetas[i] = {
                title: panel.title,
                cwd: panel.cwd,
                sysPrompt: panel.sysPrompt,
              }
              restoredPickersArr[i] = {
                model: panel.picker.model,
                effort: panel.picker.effort,
                mode: panel.picker.mode,
              }
              if (panel.cwd) {
                restoredCwds[i] = panel.cwd
              }
            })

            setPanelMetas(restoredMetas)
            setPickers(restoredPickersArr)
            setPanelCwds(restoredCwds)

            activeSession.panels.forEach((panel: PersistedPanel, i: number) => {
              if (i >= 6) return
              const live = sessions[i]?.state
              const hasLiveProgress = !!live && (
                live.thread.length > 0 || live.isRunning || live.currentRunId !== null
              )
              if (hasLiveProgress) return
              if (panel.snapshot && panel.snapshot.messages.length > 0) {
                sessions[i].restore(panel.snapshot)
              }
            })
          }
        }
      } catch {
      } finally {
        if (!cancelled) {
          restoredRef.current = true
        }
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!restoredRef.current) return
    if (!activeMultiSessionId) return

    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      const latest = buildActiveSessionRef.current
      if (latest) {
        void performUpsert(latest()).catch(() => {
        })
      }
    }, 500)

    return () => {
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
        const latest = buildActiveSessionRef.current
        if (latest) {
          flushUpsert(latest())
        }
      }
    }
  }, [activeMultiSessionId, buildActiveSession, performUpsert, flushUpsert])

  return {
    count,
    setCount,
    panelMetas,
    setPanelMetas,
    panelCwds,
    setPanelCwds,
    pickers,
    setPickers,
  }
}
