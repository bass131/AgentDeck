/**
 * LoopRunningIndicator — 루프 진행중 표시기 (5c, REPL 지속세션).
 *
 * 백엔드 loops 이벤트(AppState.activeLoops)를 소비해 채팅창 우측 상단에
 * "loop 진행중 - {summary}" 텍스트 + 회전 아이콘을 표시.
 *
 * 위치: 채팅창(.chat-scroll) 또는 대화 패널 우측 상단(position:absolute).
 * 루프 없음(loops.length===0) → null 반환(미렌더).
 *
 * UI_GUIDE 준수:
 *   - 기존 --accent/--accent-soft/--accent-line 토큰만 사용(새 색 발명 0).
 *   - 은은한 pill 형태(과하지 않게). 글로우/그라데이션 텍스트/네온 금지.
 *   - 회전 기능적(진행 표시) — prefers-reduced-motion: reduce에서 정지(접근성).
 *   - summary 길면 ellipsis(max-width + text-overflow).
 *   - 여러 루프: 첫 summary + "외 N".
 *
 * CRITICAL(신뢰경계): renderer untrusted — window.api/fs/Node 직접 0.
 *   표시 전용. 데이터는 AppState.activeLoops(loops IPC 이벤트 → reducer).
 */
import type { JSX } from 'react'
import type { LoopInfo } from '../../../shared/agent-events'
import { IconRefresh } from './icons'
import './LoopRunningIndicator.css'

export interface LoopRunningIndicatorProps {
  /** 활성 루프 전체 목록. 빈 배열이면 미렌더. */
  loops: LoopInfo[]
  /**
   * 정지 버튼 클릭 핸들러(선택). 루프(크론)는 세션 스코프라 세션을 abort하면 크론이 죽어
   * LLM 호출이 멈춘다 → 호출부가 세션 abort를 연결한다. 미전달 시 정지 버튼 미표시.
   */
  onStop?: () => void
}

/**
 * LoopRunningIndicator — 루프 진행중 표시기 컴포넌트.
 *
 * loops 빈 배열 → null(표시 제거).
 * loops 1개 → "loop 진행중 - {summary}".
 * loops N개(N>1) → "loop 진행중 - {loops[0].summary} 외 {N-1}".
 * aria-label="루프 N개 진행중"으로 스크린리더 접근성 제공.
 */
export function LoopRunningIndicator({ loops, onStop }: LoopRunningIndicatorProps): JSX.Element | null {
  if (loops.length === 0) return null

  const first = loops[0]
  const extra = loops.length - 1

  const summaryText = extra > 0
    ? `${first.summary} 외 ${extra}`
    : first.summary

  return (
    <div
      className="loop-running-indicator"
      role="status"
      aria-label={`루프 ${loops.length}개 진행중`}
    >
      <span className="lri-label">loop 진행중</span>
      <span className="lri-sep" aria-hidden="true">-</span>
      <span className="lri-summary" title={summaryText}>
        {summaryText}
      </span>
      {/* 회전 아이콘 — 장식(aria-hidden), 기능: 진행 표시 */}
      <span className="lri-spin" aria-hidden="true">
        <IconRefresh size={13} />
      </span>
      {/* 정지 버튼 — 세션 abort로 크론 종료(LLM 호출 중단). onStop 있을 때만 표시. */}
      {onStop && (
        <button
          type="button"
          className="lri-stop"
          aria-label="루프 정지"
          title="루프 정지 — 세션을 종료해 반복 호출을 멈춥니다"
          onClick={onStop}
        >
          ✕
        </button>
      )}
    </div>
  )
}
