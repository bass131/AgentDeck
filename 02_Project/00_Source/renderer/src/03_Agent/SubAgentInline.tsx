import { memo, type JSX } from 'react'
import type { SubAgentInfo } from '../../lib/agentSampleData'
import { IconCheck, IconChevRight, IconSearch, IconFile, IconBot } from '../../components/common/icons'
import { SubAgentModelBadge } from './SubAgentModelBadge'
import { mcpToolLabel } from '../../lib/toolKind'
import './SubAgentInline.css'

const SA_STATUS_LABEL: Record<SubAgentInfo['status'], string> = {
  queued: '대기 중',
  running: '실행 중',
  done: '완료',
}

function saIcon(name: string, size: number): JSX.Element {
  const n = name.toLowerCase()
  if (n.includes('explore') || n.includes('search') || n.includes('탐색'))
    return <IconSearch size={size} />
  if (n.includes('verify') || n.includes('test') || n.includes('검증'))
    return <IconCheck size={size} />
  if (n.includes('build') || n.includes('구현') || n.includes('code') || n.includes('file'))
    return <IconFile size={size} />
  return <IconBot size={size} />
}

export const SubAgentInline = memo(function SubAgentInline({
  agent,
  onOpen,
}: {
  agent: SubAgentInfo | undefined
  onOpen: (id: string) => void
}): JSX.Element | null {
  if (!agent) return null

  const displayLabel = agent.displayName ?? agent.name
  const toolsDone = agent.tools.filter((t) => t.status !== 'running').length
  const runningTool = agent.tools.find((t) => t.status === 'running')
  const activity = runningTool
    ? `${mcpToolLabel(runningTool.verb)}${runningTool.target ? ' ' + runningTool.target : ''}`.trim()
    : (agent.activity ?? '')

  return (
    <button
      type="button"
      className={'sa-inline ' + agent.status}
      onClick={() => onOpen(agent.id)}
      aria-busy={agent.status === 'running' ? 'true' : undefined}
      title="클릭하여 대화 상세 보기"
    >
      <span className="sa-inline-ic" aria-hidden="true">
        {agent.status === 'running' ? <span className="spin" /> : saIcon(displayLabel, 15)}
      </span>
      <div className="sa-inline-main">
        <div className="sa-inline-head">
          <span className="sa-inline-name">{displayLabel}</span>
          {agent.role && <span className="sa-inline-role">{agent.role}</span>}
          <SubAgentModelBadge model={agent.model} running={agent.status === 'running'} compact />
          <span className={'sa-inline-status ' + agent.status}>
            {agent.status === 'done' && <IconCheck size={11} />}
            {SA_STATUS_LABEL[agent.status]}
          </span>
        </div>
        {activity && <div className="sa-inline-activity">{activity}</div>}
        {agent.tools.length > 0 && (
          <div className="sa-inline-tools">도구 {toolsDone}/{agent.tools.length}</div>
        )}
      </div>
      <IconChevRight className="sa-inline-chev" size={15} />
    </button>
  )
})

export default SubAgentInline
