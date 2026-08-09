import { useEffect, useState } from 'react'

export function useWindowState(): boolean {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let active = true
    void window.api.windowIsMaximized().then((r) => {
      if (active) setMaximized(r.maximized)
    })
    const unsubscribe = window.api.onWindowState((payload) => {
      setMaximized(payload.maximized)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return maximized
}
