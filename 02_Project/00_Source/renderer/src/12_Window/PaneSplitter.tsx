import { useRef, useCallback, type JSX } from 'react'
import { calcAgentWidth, savePaneWidth } from '../../lib/paneResize'
import './PaneSplitter.css'

const AGENT_W_KEY = 'agentW'

const AGENT_W_MIN = 280

const AGENT_W_MAX = 640

const AGENT_W_FALLBACK = 392

const AGENT_W_VIEWPORT_RATIO = 0.5

export interface PaneSplitterProps {
  targetRef?: React.RefObject<HTMLElement | null>
  cssVar?: string
  storageKey?: string
  minWidth?: number
  maxWidth?: number
  fallbackWidth?: number
  maxViewportRatio?: number
  ariaLabel?: string
}

export function PaneSplitter({
  targetRef,
  cssVar = '--agent-w',
  storageKey = AGENT_W_KEY,
  minWidth = AGENT_W_MIN,
  maxWidth = AGENT_W_MAX,
  fallbackWidth = AGENT_W_FALLBACK,
  maxViewportRatio = AGENT_W_VIEWPORT_RATIO,
  ariaLabel = '에이전트 패널 너비 조절',
}: PaneSplitterProps): JSX.Element {
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)

  const getTarget = useCallback((): HTMLElement => {
    return (targetRef?.current ?? document.documentElement) as HTMLElement
  }, [targetRef])

  const getCurrentAgentW = useCallback((): number => {
    const target = getTarget()
    const raw = getComputedStyle(target).getPropertyValue(cssVar).trim()
    const parsed = parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : fallbackWidth
  }, [getTarget, cssVar, fallbackWidth])

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>): void => {
    e.preventDefault()

    const startW = getCurrentAgentW()
    dragRef.current = { startX: e.clientX, startW }

    const target = getTarget()

    const onMouseMove = (ev: MouseEvent): void => {
      if (!dragRef.current) return
      const deltaX = ev.clientX - dragRef.current.startX
      const maxW = Math.min(maxWidth, Math.floor(window.innerWidth * maxViewportRatio))
      const newW = calcAgentWidth(dragRef.current.startW, deltaX, minWidth, maxW)
      target.style.setProperty(cssVar, `${newW}px`)
    }

    const onMouseUp = (): void => {
      if (dragRef.current) {
        const raw = target.style.getPropertyValue(cssVar)
        const saved = parseInt(raw, 10)
        if (Number.isFinite(saved)) savePaneWidth(storageKey, saved)
        dragRef.current = null
      }
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [getCurrentAgentW, getTarget, cssVar, storageKey, minWidth, maxWidth, maxViewportRatio])

  return (
    <div
      className="pane-splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      onMouseDown={onMouseDown}
    />
  )
}

export default PaneSplitter
