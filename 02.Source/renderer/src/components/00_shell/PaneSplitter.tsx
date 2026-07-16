/**
 * PaneSplitter.tsx — 패널 드래그 리사이즈 핸들 (#5).
 *
 * chat↔agent 패널 경계에 배치하는 세로 드래그 바.
 * - 드래그 시작: mousedown → 현재 패널 너비 캡처.
 * - 드래그 중: mousemove → calcAgentWidth → CSS 변수 갱신 (setState 없음 → 60fps).
 * - 드래그 종료: mouseup → savePaneWidth → localStorage 영속.
 * - clamp(기본): min=280px, max=min(640px, viewport 50%).
 *
 * GAP1 P14: 조절 대상(CSS 변수·영속 키·클램프)을 옵셔널 props로 일반화 — 기본값은
 * 기존 --agent-w/agentW/280~640 그대로(기존 소비처·테스트 무회귀). 스플릿 그리드
 * 도크(SubAgentSplitView)가 --split-w/splitW로 재사용한다.
 *
 * 단방향 데이터 흐름:
 *   mousedown → startDrag(ref) → mousemove → CSS var → mouseup → save.
 *
 * CRITICAL: renderer-safe. window.api 0. fs/Node 0.
 * 인라인 색상 0 — CSS 변수 토큰. cursor/width 인라인은 허용.
 */
import { useRef, useCallback, type JSX } from 'react'
import { calcAgentWidth, savePaneWidth } from '../../lib/paneResize'
import './PaneSplitter.css'

/** localStorage 키 (기본값) */
const AGENT_W_KEY = 'agentW'

/** 최소 에이전트 패널 너비(px, 기본값) */
const AGENT_W_MIN = 280

/** 최대 에이전트 패널 너비(px, 기본값) — viewport 비율과 min 적용 */
const AGENT_W_MAX = 640

/** 폭 미설정 시 폴백(px, 기본값) — shell.css --agent-w 기본과 동일 */
const AGENT_W_FALLBACK = 392

/** 최대 폭의 viewport 상한 비율(기본값) */
const AGENT_W_VIEWPORT_RATIO = 0.5

export interface PaneSplitterProps {
  /**
   * CSS 변수를 업데이트할 대상 엘리먼트.
   * null이면 document.documentElement에 설정.
   */
  targetRef?: React.RefObject<HTMLElement | null>
  /** 조절할 CSS 변수명 (기본 '--agent-w') */
  cssVar?: string
  /** localStorage 영속 키 (기본 'agentW') */
  storageKey?: string
  /** 최소 너비 px (기본 280) */
  minWidth?: number
  /** 최대 너비 px (기본 640 — viewport 비율과 함께 클램프) */
  maxWidth?: number
  /** CSS 변수 미설정 시 시작 폭 px (기본 392) */
  fallbackWidth?: number
  /** 최대 너비의 viewport 상한 비율 (기본 0.5) */
  maxViewportRatio?: number
  /** 접근성 라벨 (기본 '에이전트 패널 너비 조절') */
  ariaLabel?: string
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
