import type { JSX } from 'react'
import { IconClose, IconAlert } from '../../components/common/icons'
import type { LoopStatus } from '../../lib/loopStatus'
import { CMD_CARDS } from '../../lib/cmdCards'
import './LoopStatusBanner.css'

export interface LoopStatusBannerProps {
  status: LoopStatus
  onStopSdk?: () => void
  onDismissStopped?: () => void
  onDismissStale?: () => void
  currentActivity?: string | null
  apiRetry?: { attempt: number; maxRetries: number } | null
  compacting?: 'compacting' | 'requesting' | null
}

export function LoopStatusBanner({
  status,
  onStopSdk,
  onDismissStopped,
  onDismissStale,
  currentActivity,
  apiRetry,
  compacting,
}: LoopStatusBannerProps): JSX.Element | null {
  if (apiRetry) {
    return (
      <div
        className="loop-indicator loop-api-retry"
        role="status"
        aria-label={`과부하로 재시도 중 (${apiRetry.attempt}/${apiRetry.maxRetries})`}
      >
        <div className="loop-head">
          <span className="loop-spinner" aria-hidden />
          <span className="loop-label">과부하로 재시도 중</span>
          <span className="loop-goal-turns">{apiRetry.attempt}/{apiRetry.maxRetries}</span>
        </div>
        <div className="loop-topic">일시적인 과부하예요 — 잠시 후 자동으로 다시 시도해요</div>
      </div>
    )
  }

  if (compacting === 'compacting') {
    return (
      <div className="loop-indicator loop-compacting" role="status" aria-label="컨텍스트 압축 중">
        <div className="loop-head">
          <span className="loop-spinner" aria-hidden />
          <span className="loop-label">컨텍스트를 압축하는 중…</span>
        </div>
      </div>
    )
  }

  if (status.kind === 'none') return null

  if (status.kind === 'stopped') {
    return (
      <div className="loop-indicator loop-stopped" role="status" aria-label="루프 정지됨">
        <div className="loop-head">
          <span className="loop-ic" aria-hidden>
            <IconClose size={14} />
          </span>
          <span className="loop-label">루프 정지됨</span>
          {onDismissStopped && (
            <button
              type="button"
              className="loop-btn loop-dismiss"
              aria-label="알림 닫기"
              title="확인 배너 닫기"
              onClick={onDismissStopped}
            >
              <IconClose size={13} />
            </button>
          )}
        </div>
        <div className="loop-topic">반복 실행이 멈췄어요 — 더 이상 자동 호출되지 않아요</div>
      </div>
    )
  }

  if (status.kind === 'goal-stale') {
    const { detail } = status
    return (
      <div className="loop-indicator loop-goal-stale" role="status" aria-label="목표 진행 신호 없음">
        <div className="loop-head">
          <span className="loop-ic" aria-hidden>
            <IconAlert size={14} />
          </span>
          <span className="loop-label">목표 자율 반복 — 신호 없음</span>
          {onDismissStale && (
            <button
              type="button"
              className="loop-btn loop-dismiss"
              aria-label="알림 닫기"
              title="확인 배너 닫기"
              onClick={onDismissStale}
            >
              <IconClose size={13} />
            </button>
          )}
        </div>
        <div className="loop-topic">일정 시간 진행 신호가 없어요 — 백그라운드에서 계속되고 있을 수 있어요</div>
        {detail && <div className="loop-current">{detail}</div>}
      </div>
    )
  }

  if (status.kind === 'goal') {
    const { turns, detail } = status
    return (
      <div className="loop-indicator loop-goal" role="status" aria-label={`목표 진행중 · ${turns}턴`}>
        <div className="loop-head">
          <span className="loop-spinner" aria-hidden />
          <span className="loop-label">{CMD_CARDS.goal.running}</span>
          <span className="loop-goal-turns">{turns}턴</span>
          {onStopSdk && (
            <button
              type="button"
              className="loop-goal-stop"
              aria-label="목표 반복 정지"
              title="목표 반복 정지 — 세션을 종료해 자율 반복을 멈춥니다"
              onClick={onStopSdk}
            >
              <IconClose size={13} />
              <span>정지</span>
            </button>
          )}
        </div>
        {detail && <div className="loop-topic">{detail}</div>}
        {currentActivity && <div className="loop-current">{currentActivity}</div>}
      </div>
    )
  }

  const { loops } = status
  const first = loops[0]
  const extra = loops.length - 1
  const summaryText = extra > 0 ? `${first.summary} 외 ${extra}` : first.summary

  return (
    <div className="loop-indicator loop-sdk" role="status" aria-label={`루프 ${loops.length}개 진행중`}>
      <div className="loop-head">
        <span className="loop-spinner" aria-hidden />
        <span className="loop-label">loop 진행중</span>
        {onStopSdk && (
          <button
            type="button"
            className="loop-btn loop-sdk-stop"
            aria-label="루프 정지"
            title="루프 정지 — 세션을 종료해 반복 호출을 멈춥니다"
            onClick={onStopSdk}
          >
            <IconClose size={13} />
            <span>정지</span>
          </button>
        )}
      </div>
      <div className="loop-topic" title={summaryText}>
        {summaryText}
      </div>
      {currentActivity && <div className="loop-current">{currentActivity}</div>}
    </div>
  )
}
