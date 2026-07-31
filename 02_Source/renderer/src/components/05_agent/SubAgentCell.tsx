import { memo, type JSX } from 'react'
import type { SubAgentInfo } from '../../lib/agentSampleData'
import { SubAgentChatStream, SA_STATUS_LABEL, panelStatusCls } from './SubAgentChatStream'
import { IconEye, IconEyeOff } from '../common/icons'
import '../00_shell/MultiWorkspace.css'
import './SubAgentCell.css'

const FrozenChatStream = memo(
  function FrozenChatStream({ agent }: { agent: SubAgentInfo; frozen: boolean }): JSX.Element {
    return <SubAgentChatStream agent={agent} />
  },
  (prev, next) => prev.frozen && next.frozen
)

export function SubAgentCell({
  agent,
  disabled,
  onToggle,
}: {
  agent: SubAgentInfo
  disabled: boolean
  onToggle: () => void
}): JSX.Element {
  const displayLabel = agent.displayName ?? agent.name
  const dotCls = panelStatusCls(agent.status)

  const toolsTotal = agent.tools.length
  const toolsDone = agent.tools.filter((t) => t.status !== 'running').length

  return (
    <div
      className={'ma-panel sac-panel' + (disabled ? ' sac-off' : '')}
      data-subagent-id={agent.id}
    >
      <div className="ma-p-head">
        <div className="ma-p-row1">
          <span
            className={'ma-p-dot' + (dotCls ? ' ' + dotCls : '')}
            aria-hidden="true"
          />
          <span className="ma-p-title sac-name">{displayLabel}</span>
          <span className="ma-spacer" />
          <span className={'ma-status' + (dotCls ? ' ' + dotCls : '')}>
            <span>{SA_STATUS_LABEL[agent.status]}</span>
          </span>
          <button
            type="button"
            className="ma-p-act sac-toggle"
            aria-label={disabled ? '창 활성화' : '창 비활성화'}
            aria-pressed={!disabled}
            onClick={onToggle}
          >
            {disabled ? <IconEyeOff size={15} /> : <IconEye size={15} />}
          </button>
        </div>
      </div>

      {toolsTotal > 0 && (
        <div className="ma-p-scope" aria-label="도구 사용 현황">
          <span className="ma-p-scope-item">도구 {toolsDone}/{toolsTotal}</span>
        </div>
      )}

      <FrozenChatStream agent={agent} frozen={disabled} />
    </div>
  )
}

export default SubAgentCell
