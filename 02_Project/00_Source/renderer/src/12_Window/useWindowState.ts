import { useEffect, useState } from 'react'
import { ipc } from '@renderer/01_Ipc'

export function useWindowState(): boolean {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let active = true
    void ipc.window.isMaximized().then((r) => {
      if (active) setMaximized(r.maximized)
    })
    const unsubscribe = ipc.window.onState((payload) => {
      setMaximized(payload.maximized)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return maximized
}
