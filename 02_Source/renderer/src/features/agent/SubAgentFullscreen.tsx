import type { JSX } from 'react'
import type { SubAgentInfo } from '../../lib/agentSampleData'
import { FullscreenOverlay } from '../../components/common/FullscreenOverlay'
import { SubAgentModelBadge } from './SubAgentModelBadge'
import { SubAgentChatStream, SA_STATUS_LABEL, panelStatusCls } from './SubAgentChatStream'
import '../../features/shell/MultiWorkspace.css'
import './SubAgentFullscreen.css'

export function SubAgentFullscreen({
  agent,
  onClose,
}: {
  agent: SubAgentInfo | null
  onClose: () => void
}): JSX.Element | null {
  if (!agent) return null

  const displayLabel = agent.displayName ?? agent.name
  const title = displayLabel
  const dotCls = panelStatusCls(agent.status)

  const toolsTotal = agent.tools.length
  const toolsDone = agent.tools.filter((t) => t.status !== 'running').length

  return (
    <FullscreenOverlay onClose={onClose} title={title}>
      <div className="ma-panel saf-panel">
        <div className="ma-p-head saf-head">
          <div className="ma-p-row1">
            <span
              className={'ma-p-dot' + (dotCls ? ' ' + dotCls : '')}
              aria-hidden="true"
            />
            <span className="ma-p-title saf-name">{displayLabel}</span>
            <span className="ma-spacer" />
            <span className={'ma-status' + (dotCls ? ' ' + dotCls : '')}>
              <span>{SA_STATUS_LABEL[agent.status]}</span>
            </span>
          </div>
          {(agent.role || agent.model) && (
            <div className="ma-p-row2">
              {agent.role && <span className="saf-role">{agent.role}</span>}
              <SubAgentModelBadge model={agent.model} running={agent.status === 'running'} />
            </div>
          )}
        </div>

        {toolsTotal > 0 && (
          <div className="ma-p-scope" aria-label="도구 사용 현황">
            <span className="ma-p-scope-item">도구 {toolsDone}/{toolsTotal}</span>
          </div>
        )}

        <SubAgentChatStream agent={agent} />
      </div>
    </FullscreenOverlay>
  )
}

export default SubAgentFullscreen
