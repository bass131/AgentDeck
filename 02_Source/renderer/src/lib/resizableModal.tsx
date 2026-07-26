/**
 * resizableModal.tsx — 파일 뷰어 리사이즈/최대화 훅 (F15-02).
 *
 * 원본 AgentCodeGUI/resizableModal.tsx 이식. 기본=창모드(defaultMaximized:false).
 * 크기 영속=localStorage(ui-prefs IPC 없음 — M5 이후).
 * MIN_W=520 / MIN_H=300. 핸들: e/w/s/se/sw.
 *
 * CRITICAL: renderer untrusted — fs/Node 직접 0.
 * 인라인 색상 0.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'

const MIN_W = 520
const MIN_H = 300

// localStorage 헬퍼 (ui-prefs IPC 없음)
function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch { /* ignore */ }
  return fallback
}

function savePref<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* ignore */ }
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

/**
 * 파일 뷰어 리사이즈 + 최대화 훅.
 *
 * @param storageKey  localStorage 키 (크기/최대화 상태 영속)
 * @param open        모달 열림 여부 (열릴 때 저장값 재로드)
 * @param opts.defaultMaximized  기본 최대화 여부 (기본 false = 창모드)
 */
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

  // 열릴 때 저장된 상태 재로드
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

  // 카드는 overlay 안에서 위치/크기를 CSS로 제어.
  // e/w 양 방향 이동: 1px → 2px 크기 증가 (양쪽 대칭 성장).
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
        // 드래그 릴리즈 후 클릭 삼키기 (backdrop click 방지)
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

  // 창모드: CSS 기본(우측 도킹). 최대화: 100% 덮기.
  const modalStyle: React.CSSProperties = maximized
    ? { width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%' }
    : size
      ? { width: size.w, height: size.h }
      : {}

  return { ref, maximized, modalStyle, startResize, toggleMaximize, onHeaderDoubleClick }
}

/** 엣지/코너 리사이즈 핸들 — 최대화 중에는 숨김. */
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
