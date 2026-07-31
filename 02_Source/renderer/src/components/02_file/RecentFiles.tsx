import { memo, useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { FileBadge } from './FileBadge'
import {
  IconChevsRight,
  IconClose,
  IconCloseOthers,
  IconTrash,
  IconX2,
} from '../common/icons'
import './RecentFiles.css'

function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : p
}

const MENU_W = 178
const MENU_H = 164

export const RecentFiles = memo(function RecentFiles({
  files,
  activePath,
  onOpen,
  onRemove,
  onReorder,
}: {
  files: string[]
  activePath: string | null
  onOpen: (path: string) => void
  onRemove: (paths: string[]) => void
  onReorder: (files: string[]) => void
}): JSX.Element | null {
  const [dragPath, setDragPath] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null)

  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const prevRects = useRef(new Map<string, number>())
  const animating = useRef(new Set<string>())

  useLayoutEffect(() => {
    const rects = new Map<string, number>()
    for (const [p, el] of tabRefs.current) rects.set(p, el.getBoundingClientRect().left)
    for (const [p, el] of tabRefs.current) {
      const prev = prevRects.current.get(p)
      const cur = rects.get(p)
      if (prev == null || cur == null) continue
      const dx = prev - cur
      if (!dx) continue
      animating.current.add(p)
      el.style.transition = 'none'
      el.style.transform = `translateX(${dx}px)`
      requestAnimationFrame(() => {
        el.style.transition = 'transform .18s var(--ease-out)'
        el.style.transform = ''
        let done = false
        const clear = (): void => {
          if (done) return
          done = true
          animating.current.delete(p)
          el.style.transition = ''
          el.removeEventListener('transitionend', clear)
          el.removeEventListener('transitioncancel', clear)
        }
        el.addEventListener('transitionend', clear)
        el.addEventListener('transitioncancel', clear)
        setTimeout(clear, 240)
      })
    }
    prevRects.current = rects
  }, [files])

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  if (files.length === 0) return null

  const menuIdx = menu ? files.indexOf(menu.path) : -1
  const pick = (paths: string[]): void => {
    onRemove(paths)
    setMenu(null)
  }

  return (
    <div className="chat-files">
      {files.map((p) => (
        <button
          key={p}
          ref={(el) => {
            if (el) tabRefs.current.set(p, el)
            else tabRefs.current.delete(p)
          }}
          className={
            'cf-tab' +
            (p === activePath ? ' on' : '') +
            (p === dragPath ? ' dragging' : '')
          }
          onClick={() => onOpen(p)}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ path: p, x: e.clientX, y: e.clientY })
          }}
          onAuxClick={(e) => {
            if (e.button === 1) {
              e.preventDefault()
              onRemove([p])
            }
          }}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', p)
            setDragPath(p)
          }}
          onDragEnd={() => setDragPath(null)}
          onDragOver={(e) => {
            if (dragPath == null || dragPath === p) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            if (animating.current.has(p)) return
            const from = files.indexOf(dragPath)
            const to = files.indexOf(p)
            if (from < 0 || to < 0 || from === to) return
            const rect = e.currentTarget.getBoundingClientRect()
            const mid = rect.left + rect.width / 2
            if (from < to && e.clientX < mid) return
            if (from > to && e.clientX > mid) return
            const next = [...files]
            next.splice(from, 1)
            next.splice(to, 0, dragPath)
            onReorder(next)
          }}
          onDrop={(e) => e.preventDefault()}
        >
          <FileBadge path={p} size={15} />
          <span className="cf-name">{basename(p)}</span>
          <span
            className="cf-x"
            role="button"
            aria-label="목록에서 제거"
            onClick={(e) => {
              e.stopPropagation()
              onRemove([p])
            }}
          >
            <IconX2 size={10} />
          </span>
        </button>
      ))}

      {menu && menuIdx >= 0 && (
        <div
          className="ctx-menu"
          style={{
            left: Math.max(8, Math.min(menu.x, (typeof window !== 'undefined' ? window.innerWidth : 1280) - MENU_W - 8)),
            top: Math.max(8, Math.min(menu.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - MENU_H - 8)),
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button className="ctx-item" onClick={() => pick([menu.path])}>
            <IconClose size={15} /> 닫기
          </button>
          {files.length > 1 && (
            <button
              className="ctx-item"
              onClick={() => pick(files.filter((p) => p !== menu.path))}
            >
              <IconCloseOthers size={15} /> 다른 탭 닫기
            </button>
          )}
          {menuIdx < files.length - 1 && (
            <button
              className="ctx-item"
              onClick={() => pick(files.slice(menuIdx + 1))}
            >
              <IconChevsRight size={15} /> 오른쪽 탭 닫기
            </button>
          )}
          <div className="ctx-sep" />
          <button className="ctx-item" onClick={() => pick(files)}>
            <IconTrash size={15} /> 모두 닫기
          </button>
        </div>
      )}
    </div>
  )
})

export default RecentFiles
