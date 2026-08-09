import { memo, type JSX } from 'react'
import { IconSpark, IconAlert, IconCheck } from '../../components/common/icons'
import './CmdResultCard.css'

export interface CmdResultCardProps {
  id: string
  name: string
  title: string
  sub?: string | null
  running: boolean
  failed?: boolean
  time?: string
}

export const CmdResultCard = memo(function CmdResultCard({
  title,
  sub,
  running,
  failed,
  time,
}: CmdResultCardProps): JSX.Element {
  const cardCls = [
    'cmd-result-card',
    running ? 'cmd-result-card--running' : '',
    failed ? 'cmd-result-card--failed' : '',
    !running && !failed ? 'cmd-result-card--done' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cardCls} data-failed={failed ? 'true' : undefined}>
      <span className="cmd-result-ic" aria-hidden="true">
        {running ? (
          <IconSpark size={16} stroke={1.8} />
        ) : failed ? (
          <IconAlert size={16} />
        ) : (
          <IconCheck size={16} />
        )}
      </span>
      <div className="cmd-result-body">
        <div className="cmd-result-title">{title}</div>
        {sub && <div className="cmd-result-sub">{sub}</div>}
      </div>
      <div className="cmd-result-meta">
        {running && (
          <span className="dots" role="progressbar" aria-label="진행 중" aria-hidden="true">
            <i /><i /><i />
          </span>
        )}
        {time && <span className="cmd-result-time">{time}</span>}
      </div>
    </div>
  )
})

export default CmdResultCard
