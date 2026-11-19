import { useEffect, useRef, useState } from 'react'
import type { LoopSessionEventPayload } from '@shared/ipcContract'
import { ipc } from '@renderer/01_Ipc'
import { sameCwd } from './loopModel'
import { applyPush, fromSnapshot, type SessionMap } from './sessionLogModel'

const EMPTY: SessionMap = new Map()

export function useSessionLog(cwd: string | null): SessionMap {
  const [map, setMap] = useState<SessionMap>(EMPTY)
  const cwdRef = useRef(cwd)

  useEffect(() => {
    cwdRef.current = cwd
    setMap(EMPTY)
    if (cwd === null) return
    let alive = true
    let beforeSnapshot: LoopSessionEventPayload[] | null = []
    const off = ipc.loop.onSessionEvent((p) => {
      if (!alive || !sameCwd(p.cwd, cwdRef.current)) return
      if (beforeSnapshot !== null) { beforeSnapshot.push(p); return }
      setMap((m) => applyPush(m, p))
    })
    const settle = (snap: Parameters<typeof fromSnapshot>[0]): void => {
      if (!alive) return
      const queued = beforeSnapshot ?? []
      beforeSnapshot = null
      setMap(fromSnapshot(snap, queued))
    }
    ipc.loop
      .sessionLog({ cwd })
      .then(settle)
      .catch(() => settle({ cwd, sessions: [] }))
    return () => {
      alive = false
      off()
    }
  }, [cwd])

  return map
}
