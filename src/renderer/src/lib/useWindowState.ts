/**
 * useWindowState.ts — 창 최대화 상태 구독 훅 (F1-b).
 *
 * 초기 상태는 window.api.windowIsMaximized()로 1회 조회, 이후 변경은
 * onWindowState push로 추종 → Shell의 `.win.max` 토글에 사용.
 */
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
