/**
 * SchedStrip.tsx — 예약 메시지 큐 스트립 하위 컴포넌트 (B10).
 *
 * Composer.tsx Phase 14 분해: sched 큐 JSX 추출.
 * queued prop 기반 순수 렌더 — 내부 state 없음.
 * isRunning 중 입력 → 큐에 적재 → 완료 후 순서대로 전송.
 */
import { type JSX } from 'react'
import { IconClock, IconImage } from '../common/icons'

export interface QueuedMessage {
  id: string
  text: string
  images?: string[]
}

interface SchedStripProps {
  queued: QueuedMessage[]
  onRemoveQueued?: (id: string) => void
}

export function SchedStrip({ queued, onRemoveQueued }: SchedStripProps): JSX.Element | null {
  if (queued.length === 0) return null

  return (
    <div className="sched">
      <div className="sched-head">
        <span className="sched-title">
          <IconClock size={14} />
          예약된 메시지 {queued.length}
        </span>
        <span className="sched-hint">작업이 끝나면 순서대로 전송돼요</span>
      </div>
      <div className="sched-list">
        {queued.map((m, i) => (
          <div className="sched-item" key={m.id}>
            <span className="sched-num">{i + 1}</span>
            <span className="sched-text">
              {m.text.trim() || ((m.images?.length ?? 0) > 0 ? `이미지 ${m.images!.length}장` : '')}
            </span>
            {(m.images?.length ?? 0) > 0 && (
              <span className="sched-img" title={`이미지 ${m.images!.length}장`}>
                <IconImage size={14} />
              </span>
            )}
            <button
              type="button"
              className="sched-x"
              aria-label="예약 취소"
              onClick={() => onRemoveQueued?.(m.id)}
            >
              <span className="sched-x-ic" aria-hidden="true">×</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
