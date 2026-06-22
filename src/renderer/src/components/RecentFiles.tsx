/**
 * RecentFiles.tsx — 코드 패널 위 파일 탭바 (F10-01).
 *
 * 원본 AgentCodeGUI/RecentFiles.tsx 1:1 시각 미러.
 *
 * - .chat-files: cf-tab(FileBadge + cf-name + cf-x)
 * - activePath .on 표시
 * - FLIP 재정렬(useLayoutEffect + 중간점 스왑)
 * - 휠클릭/x 제거
 * - ctx-menu(닫기/다른 탭/오른쪽/모두, 좌표 클램프, 바깥/Esc/resize/blur 닫기)
 * - files 빈 배열 → null
 *
 * ⚠️ 변경 마커(exp-chg N/M): store changedFiles=Set<string>(경로만, tag 없음)
 *    → 마커 미렌더(라이브). tag 기반은 M4 이후.
 *
 * CRITICAL: renderer untrusted — window.api 호출 0(IPC는 store 액션 경유).
 * 인라인 색상 0(FLIP transform 인라인 style은 허용 — 색 아님).
 */
import { memo, useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { FileBadge } from './FileBadge'
import {
  IconChevsRight,
  IconClose,
  IconCloseOthers,
  IconTrash,
  IconX2,
} from './icons'
import './RecentFiles.css'

function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.length ? parts[parts.length - 1] : p
}

// 우클릭 메뉴 화면 가장자리 클램프 추정치
const MENU_W = 178
const MENU_H = 164

export const RecentFiles = memo(function RecentFiles({
  files,
  activePath,
  onOpen,
  onRemove,
  onReorder,
}: {
  /** 최신순 경로 배열 */
  files: string[]
  /** 현재 활성 파일 (액센트 표시) */
  activePath: string | null
  onOpen: (path: string) => void
  onRemove: (paths: string[]) => void
  onReorder: (files: string[]) => void
}): JSX.Element | null {
  // 드래그 중인 탭
  const [dragPath, setDragPath] = useState<string | null>(null)
  // 우클릭 메뉴
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null)

  // FLIP 재정렬
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const prevRects = useRef(new Map<string, number>()) // path → left
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
        el.style.transition = 'transform .18s cubic-bezier(.2,.8,.2,1)'
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
          // 휠클릭 = 목록에서 제거 (IDE 탭 관습)
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
            // 중간점 스왑 규칙
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
