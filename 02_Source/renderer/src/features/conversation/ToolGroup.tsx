import { memo, type JSX } from 'react'
import type { ThreadItem } from '../../store/threadTypes'
import type { FileDiffEntry } from '../../store/reducer'
import { ToolCallCard } from './ToolCallCard'
import { IconClaude } from '../../components/common/icons'
import './ToolGroup.css'

export interface ToolGroupProps {
  group: Extract<ThreadItem, { kind: 'toolgroup' }>
  lead?: boolean
  fileDiffs: Record<string, FileDiffEntry>
  runId?: string
  bare?: boolean
}

export const ToolGroup = memo(function ToolGroup({ group, lead, fileDiffs, runId, bare = false }: ToolGroupProps): JSX.Element | null {
  if (group.tools.length === 0) return null

  const showLeadHeader = lead && !bare

  return (
    <div className={'toollog' + (showLeadHeader ? ' lead' : '')}>
      {showLeadHeader && (
        <>
          <div className="ava ai lead-ava" aria-hidden="true">
            <IconClaude size={16} />
          </div>
          <div className="lead-meta">
            <span className="name">Claude</span>
          </div>
        </>
      )}
      {group.tools.map((card) => (
        <ToolCallCard key={card.id} card={card} fileDiffs={fileDiffs} runId={runId} />
      ))}
    </div>
  )
})

export default ToolGroup
