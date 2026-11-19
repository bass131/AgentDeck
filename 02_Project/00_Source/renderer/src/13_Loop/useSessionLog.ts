import { useEffect, useRef, useState } from 'react'
import type { LoopSessionEventPayload, LoopSessionLog } from '@shared/ipcContract'
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
    let beforeSnapshot: LoopSessionEventPayload[] | null = null
    let ticket = 0
    // 읽는 동안 온 push는 모았다가 스냅숏 위에 잇는다. 못 읽으면 가진 기록 위에 잇는다
    const load = (): void => {
      const mine = ++ticket
      beforeSnapshot ??= []
      const settle = (snap: LoopSessionLog | null): void => {
        if (!alive || mine !== ticket) return
        const queued = beforeSnapshot ?? []
        beforeSnapshot = null
        setMap((m) => fromSnapshot(snap ?? { cwd, sessions: [...m.values()] }, queued))
      }
      ipc.loop
        .sessionLog({ cwd })
        .then(settle)
        .catch(() => settle(null))
    }
    const offEvent = ipc.loop.onSessionEvent((p) => {
      if (!alive || !sameCwd(p.cwd, cwdRef.current)) return
      if (beforeSnapshot !== null) { beforeSnapshot.push(p); return }
      setMap((m) => applyPush(m, p))
    })
    // 새 메인 대화는 main이 메인 세션 기록을 비우고 장 표지를 바꾼다. 마운트 뒤 첫 push도 그 사이 바뀌었을 수 있어 다시 읽는다
    let chapter: string | null = null
    const offMain = ipc.loop.onMainState((v) => {
      if (!alive || !sameCwd(v.cwd, cwdRef.current) || v.chapter === chapter) return
      chapter = v.chapter
      load()
    })
    load()
    return () => {
      alive = false
      offEvent()
      offMain()
    }
  }, [cwd])

  return map
}
