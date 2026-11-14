import { type JSX } from 'react'
import { IconClock, IconImage } from '../../components/common/icons'

export interface QueuedMessageView {
  id: string
  text: string
  images?: string[]
}

interface SchedStripProps {
  queued: QueuedMessageView[]
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
