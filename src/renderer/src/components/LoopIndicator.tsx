/**
 * LoopIndicator — 앱 레벨 /loop 활성 루프 배너 (드라이버 docs/LOOP_SUPPORT.md, 4단계).
 *
 * running: 반복 아이콘 + 프롬프트 + "N틱 · 간격" + 정지 버튼.
 * stopped: 상한 도달 알림(틱/시간) + 닫기 버튼.
 *
 * UI_GUIDE 준수: glass/네온/그라데이션 금지, CSS 변수 토큰만. 컴포저 위 배너로 마운트.
 * CRITICAL: 표시 전용 — 타이머/상태는 부모(Conversation·PanelView)가 관리.
 */
import type { JSX } from 'react'
import { IconRefresh, IconClose, IconAlert } from './icons'
import { formatLoopInterval, type ActiveLoop } from '../lib/loopCommand'
import './LoopIndicator.css'

export interface LoopIndicatorProps {
  loop: ActiveLoop
  /** 정지(running) — 사용자가 루프 중단. */
  onStop: () => void
  /** 닫기(stopped) — 상한 도달 인디케이터 제거. */
  onDismiss: () => void
}

function stopMessage(reason: ActiveLoop['stopReason'], tickCount: number): string {
  if (reason === 'max-ticks') return `최대 반복 횟수(${tickCount}틱) 상한 도달 — 루프 정지됨`
  if (reason === 'max-duration') return '최대 실행 시간(30분) 상한 도달 — 루프 정지됨'
  return '루프 정지됨'
}

export function LoopIndicator({ loop, onStop, onDismiss }: LoopIndicatorProps): JSX.Element {
  const stopped = loop.status === 'stopped'

  if (stopped) {
    return (
      <div className="loop-indicator stopped" role="status">
        <span className="loop-ic" aria-hidden>
          <IconAlert size={14} />
        </span>
        <span className="loop-text">{stopMessage(loop.stopReason, loop.tickCount)}</span>
        <button type="button" className="loop-btn" aria-label="루프 알림 닫기" onClick={onDismiss}>
          <IconClose size={13} />
        </button>
      </div>
    )
  }

  return (
    <div className="loop-indicator" role="status">
      <span className="loop-ic spin" aria-hidden>
        <IconRefresh size={14} />
      </span>
      <span className="loop-label">반복 중</span>
      <span className="loop-prompt" title={loop.prompt}>
        {loop.prompt}
      </span>
      <span className="loop-meta">
        {loop.tickCount}틱 · {formatLoopInterval(loop.intervalMs)} 간격
      </span>
      <button type="button" className="loop-btn loop-stop" aria-label="루프 정지" onClick={onStop}>
        <IconClose size={13} />
        <span>정지</span>
      </button>
    </div>
  )
}
