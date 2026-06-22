/**
 * zoom.ts — Ctrl+휠 줌 훅 + ZoomBadge 컴포넌트 (F14-02).
 *
 * 원본 AgentCodeGUI zoom.tsx 1:1 이식.
 * - useZoom: Ctrl+wheel clamp(0.5~3, step 0.1) + localStorage 영속 + flash badge.
 * - ZoomBadge: "N%" 일시 pill (.zoom-badge / .zoom-badge.on).
 * - mergeRefs: 복수 ref 합성 유틸.
 *
 * CRITICAL: renderer-safe(localStorage/dom). window.api 호출 0.
 * 인라인 색상 0 (zoom CSS factor 인라인 허용, 색 아님).
 */
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'

const MIN = 0.5   // 50%
const MAX = 3     // 300%
const STEP = 0.1  // 10% per wheel notch

const ZOOM_KEY_PREFIX = 'agentdeck.zoom.'

/** snap to 10% steps so repeated wheeling can't drift to fractional values */
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
    /* localStorage 접근 불가(테스트/샌드박스) → 기본값 */
  }
  return 1
}

function saveZoom(key: string, v: number): void {
  try {
    localStorage.setItem(key, String(v))
  } catch {
    /* 영속 실패 무시 */
  }
}

/**
 * Ctrl + mouse-wheel 줌. 스크롤 viewport에 ref를 붙이고 내부 콘텐츠에 zoom factor 적용.
 * flash는 변경 직후 잠깐 true — ZoomBadge가 fade-in/out.
 * React onWheel은 passive라 preventDefault 불가 → native non-passive listener.
 */
export function useZoom(storageKey: string, active = true) {
  const fullKey = ZOOM_KEY_PREFIX + storageKey
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const ref = useCallback((node: HTMLDivElement | null) => setEl(node), [])
  const [zoom, setZoom] = useState(() => loadZoom(fullKey))
  const [flash, setFlash] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // storageKey/active 변경 시 storage 재동기
  useEffect(() => {
    if (active) setZoom(loadZoom(fullKey))
  }, [active, fullKey])

  // wheel listener — el 또는 active 변경 시 재바인딩
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

/** 복수 ref(객체/콜백)를 한 엘리먼트에 합성 */
export function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (el: T | null): void => {
    for (const r of refs) {
      if (!r) continue
      if (typeof r === 'function') r(el)
      else (r as React.MutableRefObject<T | null>).current = el
    }
  }
}

/** 일시 줌레벨 pill ("120%" 등) — flash=true면 .on(visible), false면 opacity:0. */
export function ZoomBadge({ pct, show }: { pct: number; show: boolean }): JSX.Element {
  return (
    <div className={'zoom-badge' + (show ? ' on' : '')} aria-hidden="true">
      {pct}%
    </div>
  )
}
