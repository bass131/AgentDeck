/**
 * SelectionToolbar.tsx — 텍스트 선택 시 떠오르는 툴바 (F14-02).
 *
 * 원본 AgentCodeGUI Chat.tsx SelectionToolbar L616~712 1:1 이식.
 * - mouseup 시 selection이 chat thread 안이면 .sel-bar 표시
 * - 복사: navigator.clipboard(renderer-safe). 더 자세히: onElaborate(콜백, M4).
 * - Esc / selection collapse → 숨김
 *
 * CRITICAL: window.api 0. 복사=navigator.clipboard. 인라인 색상 0(position CSSProperties 허용).
 */
import { useEffect, useRef, useState, type CSSProperties, type JSX } from 'react'
import { IconCheck, IconSearch } from './icons'
import { IconCopy } from './icons'
import './SelectionToolbar.css'

export interface SelectionToolbarProps {
  scrollRef: React.RefObject<HTMLElement | null>
  onElaborate: (text: string) => void
}

export function SelectionToolbar({ scrollRef, onElaborate }: SelectionToolbarProps): JSX.Element | null {
  const barRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ cx: number; top: number; bottom: number; text: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const read = (): { cx: number; top: number; bottom: number; text: string } | null => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
      const text = sel.toString().trim()
      if (!text) return null
      if (!container.contains(sel.anchorNode) || !container.contains(sel.focusNode)) return null
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return null
      return { cx: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom, text }
    }

    const onMouseDown = (e: MouseEvent): void => {
      if (barRef.current?.contains(e.target as Node)) return
      setPos(null)
    }
    const onMouseUp = (e: MouseEvent): void => {
      if (barRef.current?.contains(e.target as Node)) return
      setTimeout(() => {
        setPos(read())
        setCopied(false)
      }, 0)
    }
    const onScroll = (): void => setPos((p) => (p ? read() : p))
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPos(null)
    }

    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mouseup', onMouseUp)
    container.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mouseup', onMouseUp)
      container.removeEventListener('scroll', onScroll)
      window.removeEventListener('keydown', onKey)
    }
  }, [scrollRef])

  if (!pos) return null

  // 선택 상단 근접 시 아래에 배치
  const below = pos.top < 52
  // position은 좌표값(px) — 색 아님, CSSProperties 인라인 허용
  const style: CSSProperties = {
    left: Math.min(Math.max(pos.cx, 92), window.innerWidth - 92),
    top: below ? pos.bottom + 10 : pos.top - 10,
    transform: below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
  }

  const copy = (): void => {
    navigator.clipboard?.writeText(pos.text).then(() => setCopied(true), () => {})
  }

  const elaborate = (): void => {
    onElaborate(pos.text)
    setPos(null)
    window.getSelection()?.removeAllRanges()
  }

  return (
    <div
      className={'sel-bar' + (below ? ' below' : '')}
      ref={barRef}
      style={style}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button className="sel-act" onClick={copy}>
        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
        <span>{copied ? '복사됨' : '복사'}</span>
      </button>
      <span className="sel-div" />
      <button className="sel-act" onClick={elaborate}>
        <IconSearch size={14} />
        <span>더 자세히</span>
      </button>
    </div>
  )
}

export default SelectionToolbar
