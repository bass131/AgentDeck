import { useCallback, useEffect, useRef, useState, type JSX } from 'react'

const MIN = 0.5
const MAX = 3
const STEP = 0.1

const ZOOM_KEY_PREFIX = 'agentdeck.zoom.'

function clamp(v: number): number {
  return Math.min(MAX, Math.max(MIN, Math.round(v * 10) / 10))
}

function loadZoom(key: string): number {
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null) {
      const v = parseFloat(raw)
      if (Number.isFinite(v)) return clamp(v)
    }
  } catch {
  }
  return 1
}

function saveZoom(key: string, v: number): void {
  try {
    localStorage.setItem(key, String(v))
  } catch {
  }
}

export function useZoom(storageKey: string, active = true) {
  const fullKey = ZOOM_KEY_PREFIX + storageKey
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const ref = useCallback((node: HTMLDivElement | null) => setEl(node), [])
  const [zoom, setZoom] = useState(() => loadZoom(fullKey))
  const [flash, setFlash] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (active) setZoom(loadZoom(fullKey))
  }, [active, fullKey])

  useEffect(() => {
    if (!el || !active) return
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom((z) => {
        const next = clamp(z + (e.deltaY < 0 ? STEP : -STEP))
        if (next !== z) saveZoom(fullKey, next)
        return next
      })
      setFlash(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setFlash(false), 1100)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      clearTimeout(timer.current)
    }
  }, [el, fullKey, active])

  return { ref, zoom, pct: Math.round(zoom * 100), flash }
}

export function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (el: T | null): void => {
    for (const r of refs) {
      if (!r) continue
      if (typeof r === 'function') r(el)
      else (r as React.MutableRefObject<T | null>).current = el
    }
  }
}

export function ZoomBadge({ pct, show }: { pct: number; show: boolean }): JSX.Element {
  return (
    <div className={'zoom-badge' + (show ? ' on' : '')} aria-hidden="true">
      {pct}%
    </div>
  )
}
