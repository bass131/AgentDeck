/**
 * PaneSplitter.tsx — 패널 드래그 리사이즈 핸들 (#5).
 *
 * chat↔agent 패널 경계에 배치하는 세로 드래그 바.
 * - 드래그 시작: mousedown → 현재 패널 너비 캡처.
 * - 드래그 중: mousemove → calcAgentWidth → CSS 변수 갱신 (setState 없음 → 60fps).
 * - 드래그 종료: mouseup → savePaneWidth → localStorage 영속.
 * - clamp: min=280px, max=min(640px, viewport 50%).
 *
 * 단방향 데이터 흐름:
 *   mousedown → startDrag(ref) → mousemove → CSS var → mouseup → save.
 *
 * CRITICAL: renderer-safe. window.api 0. fs/Node 0.
 * 인라인 색상 0 — CSS 변수 토큰. cursor/width 인라인은 허용.
 */
import { useRef, useCallback, type JSX } from 'react'
import { calcAgentWidth, savePaneWidth } from '../lib/paneResize'
import './PaneSplitter.css'

/** localStorage 키 */
const AGENT_W_KEY = 'agentW'

/** 최소 에이전트 패널 너비(px) */
const AGENT_W_MIN = 280

/** 최대 에이전트 패널 너비(px) — viewport 50%와 min 적용 */
const AGENT_W_MAX = 640

export interface PaneSplitterProps {
  /**
   * CSS 변수 --agent-w를 업데이트할 대상 엘리먼트.
   * null이면 document.documentElement에 설정.
   */
  targetRef?: React.RefObject<HTMLElement | null>
}

/**
 * PaneSplitter — chat와 agent pane 사이의 드래그 핸들.
 *
 * 드래그 로직:
 * 1. mousedown: 현재 --agent-w 값 캡처 + mousedown X 좌표 캡처.
 * 2. mousemove: deltaX = currentX - startX → calcAgentWidth → CSS var 갱신.
 * 3. mouseup: savePaneWidth(localStorage) + 리스너 해제.
 *
 * 렌더 성능: CSS 변수 직접 갱신 (setState 없음) → 60fps 유지.
 */
export function PaneSplitter({ targetRef }: PaneSplitterProps): JSX.Element {
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)

  const getTarget = useCallback((): HTMLElement => {
    return (targetRef?.current ?? document.documentElement) as HTMLElement
  }, [targetRef])

  const getCurrentAgentW = useCallback((): number => {
    const target = getTarget()
    const raw = getComputedStyle(target).getPropertyValue('--agent-w').trim()
    const parsed = parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : 392
  }, [getTarget])

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>): void => {
    e.preventDefault()

    const startW = getCurrentAgentW()
    dragRef.current = { startX: e.clientX, startW }

    const target = getTarget()

    const onMouseMove = (ev: MouseEvent): void => {
      if (!dragRef.current) return
      const deltaX = ev.clientX - dragRef.current.startX
      const maxW = Math.min(AGENT_W_MAX, Math.floor(window.innerWidth * 0.5))
      const newW = calcAgentWidth(dragRef.current.startW, deltaX, AGENT_W_MIN, maxW)
      target.style.setProperty('--agent-w', `${newW}px`)
    }

    const onMouseUp = (): void => {
      if (dragRef.current) {
        const raw = target.style.getPropertyValue('--agent-w')
        const saved = parseInt(raw, 10)
        if (Number.isFinite(saved)) savePaneWidth(AGENT_W_KEY, saved)
        dragRef.current = null
      }
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [getCurrentAgentW, getTarget])

  return (
    <div
      className="pane-splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label="에이전트 패널 너비 조절"
      onMouseDown={onMouseDown}
    />
  )
}

export default PaneSplitter
