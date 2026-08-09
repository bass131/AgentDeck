import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'

const MIN_W = 520
const MIN_H = 300

function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch { }
  return fallback
}

function savePref<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { }
}

export type ModalSize = { w: number; h: number }

const RESIZE_CURSOR: Record<string, string> = {
  e: 'ew-resize', w: 'ew-resize', s: 'ns-resize', se: 'nwse-resize', sw: 'nesw-resize',
}
const HANDLES = ['e', 'w', 's', 'se', 'sw']

function loadSize(key: string): ModalSize | null {
  const v = loadPref<{ w?: unknown; h?: unknown } | null>(key, null)
  if (v && typeof v.w === 'number' && typeof v.h === 'number') return { w: v.w, h: v.h }
  return null
}

export function useResizableModal(
  storageKey: string,
  open: boolean,
  opts?: { defaultMaximized?: boolean }
) {
  const ref = useRef<HTMLDivElement>(null)
  const maxKey = storageKey + '.max'
  const defaultMax = opts?.defaultMaximized ?? false

  const [size, setSize] = useState<ModalSize | null>(() => loadSize(storageKey))
  const [maximized, setMaximized] = useState<boolean>(() => loadPref<boolean>(maxKey, defaultMax))

  useEffect(() => {
    if (open) {
      setSize(loadSize(storageKey))
      setMaximized(loadPref<boolean>(maxKey, defaultMax))
    }
  }, [open, storageKey, maxKey, defaultMax])

  const toggleMaximize = useCallback(() => {
    setMaximized((m) => {
      const next = !m
      savePref(maxKey, next)
      return next
    })
  }, [maxKey])

  const startResize = useCallback(
    (edge: string) => (e: React.MouseEvent): void => {
      if (e.button !== 0) return
      const el = ref.current
      if (!el) return
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startY = e.clientY
      const baseW = el.offsetWidth
      const baseH = el.offsetHeight
      const maxW = window.innerWidth
      const maxH = window.innerHeight
      let next: ModalSize = { w: baseW, h: baseH }

      const onMove = (ev: MouseEvent): void => {
        let w = baseW
        let h = baseH
        if (edge.includes('e')) w = baseW + (ev.clientX - startX) * 2
        if (edge.includes('w')) w = baseW - (ev.clientX - startX) * 2
        if (edge.includes('s')) h = baseH + (ev.clientY - startY) * 2
        w = Math.max(MIN_W, Math.min(maxW, w))
        h = Math.max(MIN_H, Math.min(maxH, h))
        next = { w, h }
        el.style.width = w + 'px'
        el.style.height = h + 'px'
      }
      const onUp = (): void => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        document.body.classList.remove('rzm-resizing')
        document.body.style.cursor = ''
        const swallow = (ce: MouseEvent): void => {
          ce.stopPropagation()
          window.removeEventListener('click', swallow, true)
        }
        window.addEventListener('click', swallow, true)
        setSize(next)
        savePref(storageKey, next)
      }
      document.body.classList.add('rzm-resizing')
      document.body.style.cursor = RESIZE_CURSOR[edge] || ''
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [storageKey]
  )

  const onHeaderDoubleClick = useCallback(
    (e: React.MouseEvent): void => {
      if ((e.target as HTMLElement).closest('button')) return
      toggleMaximize()
    },
    [toggleMaximize]
  )

  const modalStyle: React.CSSProperties = maximized
    ? { width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%' }
    : size
      ? { width: size.w, height: size.h }
      : {}

  return { ref, maximized, modalStyle, startResize, toggleMaximize, onHeaderDoubleClick }
}

export function ModalResizeHandles({
  onStart,
}: {
  onStart: (edge: string) => (e: React.MouseEvent) => void
}): JSX.Element {
  return (
    <>
      {HANDLES.map((edge) => (
        <div key={edge} className={'rzm-h rzm-h-' + edge} onMouseDown={onStart(edge)} />
      ))}
    </>
  )
}
