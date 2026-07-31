import { useState, type JSX } from 'react'
import { IconTerminal, IconChevDown, IconAlert, IconCheck } from '../common/icons'
import './HookTimeline.css'

export interface HookRunView {
  hookId: string
  hookName: string
  hookEvent: string
  status: 'running' | 'success' | 'error' | 'cancelled'
  exitCode?: number
  stdout?: string
  stderr?: string
  output?: string
  time?: string
}

export interface HookTimelineProps {
  hookRuns: HookRunView[]
}

const STATUS_LABEL: Record<HookRunView['status'], string> = {
  running: '실행 중',
  success: '완료',
  error: '오류',
  cancelled: '취소',
}

export function HookTimeline({ hookRuns }: HookTimelineProps): JSX.Element | null {
  const [open, setOpen] = useState(false)

  if (hookRuns.length === 0) return null

  const runningCount = hookRuns.filter((r) => r.status === 'running').length
  const errorCount = hookRuns.filter((r) => r.status === 'error').length

  return (
    <div className="hook-timeline" data-testid="hook-timeline">
      <button
        type="button"
        className="hook-timeline-summary"
        data-testid="hook-timeline-summary"
        aria-expanded={open}
        aria-label={`훅 타임라인 ${hookRuns.length}건${open ? ' 접기' : ' 펼치기'}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="hook-timeline-ic" aria-hidden="true">
          <IconTerminal size={13} />
        </span>
        <span className="hook-timeline-label">훅 {hookRuns.length}건</span>
        {runningCount > 0 && (
          <span className="hook-timeline-count hook-timeline-count-running">실행중 {runningCount}</span>
        )}
        {errorCount > 0 && (
          <span className="hook-timeline-count hook-timeline-count-error">오류 {errorCount}</span>
        )}
        <span
          className={`hook-timeline-toggle${open ? ' open' : ''}`}
          data-testid="hook-timeline-toggle"
          aria-hidden="true"
        >
          <IconChevDown size={12} />
        </span>
      </button>

      {open && (
        <div className="hook-timeline-detail" data-testid="hook-timeline-detail">
          {hookRuns.map((run) => (
            <div key={run.hookId} className={`hook-timeline-row hook-timeline-row-${run.status}`}>
              <span className="hook-timeline-row-ic" aria-hidden="true">
                {run.status === 'running' ? (
                  <span className="hook-timeline-spin" aria-label="실행중" />
                ) : run.status === 'error' ? (
                  <IconAlert size={12} />
                ) : (
                  <IconCheck size={12} />
                )}
              </span>
              <span className="hook-timeline-name">{run.hookName}</span>
              <span className="hook-timeline-event">{run.hookEvent}</span>
              <span className="hook-timeline-status">{STATUS_LABEL[run.status]}</span>
              {run.exitCode !== undefined && (
                <span className="hook-timeline-exit">exit {run.exitCode}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default HookTimeline
