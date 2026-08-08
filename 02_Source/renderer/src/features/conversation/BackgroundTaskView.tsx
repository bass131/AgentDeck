import { memo, useEffect, useRef, type JSX } from 'react'
import type { BgTaskState } from '../../store/reducer'
import './BackgroundTaskView.css'

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'stopped', 'killed'])

const STATUS_LABEL: Record<string, string> = {
  pending: '대기',
  running: '실행 중',
  paused: '일시정지',
  completed: '완료',
  failed: '실패',
  stopped: '정지됨',
  killed: '강제 종료',
}

export interface BackgroundTaskViewProps {
  bgTask: BgTaskState
  runId?: string
}

function BackgroundTaskViewInner({ bgTask, runId }: BackgroundTaskViewProps): JSX.Element {
  const tailRef = useRef<HTMLPreElement>(null)
  const running = !TERMINAL_STATUSES.has(bgTask.status)

  useEffect(() => {
    const el = tailRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [bgTask.tail])

  const stop = (): void => {
    if (!runId) return
    void window.api.agentTaskStop({ runId, taskId: bgTask.taskId }).catch(() => {})
  }

  return (
    <div className={'bgt-block' + (running ? '' : ' ended')}>
      <div className="bgt-head">
        <span className={'bgt-dot' + (running ? ' live' : '')} aria-hidden="true" />
        <span className="bgt-desc">{bgTask.description ?? '백그라운드 작업'}</span>
        <span className="bgt-status">{STATUS_LABEL[bgTask.status] ?? bgTask.status}</span>
        <span className="bgt-sp" />
        {running && (
          <button
            type="button"
            className="bgt-stop"
            data-testid="bg-stop-btn"
            onClick={stop}
            aria-label="백그라운드 작업 정지"
          >
            정지
          </button>
        )}
      </div>
      {bgTask.truncated && (
        <div className="bgt-trunc">이전 로그 일부가 잘렸습니다 (최신 로그만 유지)</div>
      )}
      <pre ref={tailRef} className="bgt-tail" data-testid="bg-tail-view">
        {bgTask.tail}
      </pre>
    </div>
  )
}

export const BackgroundTaskView = memo(BackgroundTaskViewInner)
export default BackgroundTaskView
