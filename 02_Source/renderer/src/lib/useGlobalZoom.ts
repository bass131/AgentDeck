import { useEffect, useRef, useState } from 'react'
import { getPref, setPref } from './prefs'

export function watchDevicePixelRatio(
  onChange: () => void,
  matchMediaFn: (query: string) => MediaQueryList = (q) => window.matchMedia(q),
): () => void {
  let mql: MediaQueryList | null = null

  const listener = (): void => {
    register()
    onChange()
  }

  function register(): void {
    if (mql) mql.removeEventListener('change', listener)
    mql = matchMediaFn(`(resolution: ${window.devicePixelRatio}dppx)`)
    mql.addEventListener('change', listener)
  }

  register()

  return () => {
    mql?.removeEventListener('change', listener)
    mql = null
  }
}

function hasZoomApi(): boolean {
  return typeof window !== 'undefined' && typeof window.api?.getZoomFactor === 'function'
}

function hasZoomSetApi(): boolean {
  return typeof window !== 'undefined' && typeof window.api?.setZoomFactor === 'function'
}

function readCurrentPct(): number {
  if (!hasZoomApi()) return 100
  return Math.round(window.api.getZoomFactor() * 100)
}

export function useZoomFactorPct(): number {
  const [pct, setPct] = useState<number>(readCurrentPct)

  useEffect(() => {
    if (!hasZoomApi()) return
    const sync = (): void => setPct(readCurrentPct())
    sync()
    return watchDevicePixelRatio(sync)
  }, [])

  return pct
}

export function useGlobalZoomPersist(): void {
  const lastSavedRef = useRef<number | null>(null)

  useEffect(() => {
    if (!hasZoomApi()) return

    lastSavedRef.current = getPref<number | null>('zoomFactor', null)

    const sync = (): void => {
      const factor = window.api.getZoomFactor()
      if (lastSavedRef.current === factor) return
      lastSavedRef.current = factor
      setPref('zoomFactor', factor)
    }

    sync()

    return watchDevicePixelRatio(sync)
  }, [])
}

export function stepZoomFactor(delta: number): void {
  if (!hasZoomApi() || !hasZoomSetApi()) return
  window.api.setZoomFactor(window.api.getZoomFactor() + delta)
}

export function resetZoomFactor(): void {
  if (!hasZoomSetApi()) return
  window.api.setZoomFactor(1)
}
