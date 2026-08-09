import { useEffect, type JSX } from 'react'
import type { SubAgentInfo } from '../../lib/agentSampleData'
import { IconCheck, IconClose, IconSearch, IconFile, IconBot } from '../../components/common/icons'
import { mcpToolLabel } from '../../lib/toolKind'

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

export function SubAgentModal({
  agent,
  onClose,
}: {
  agent: SubAgentInfo | null
  onClose: () => void
}): JSX.Element | null {
  useEffect(() => {
    if (!agent) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [agent, onClose])

  if (!agent) return null

  const displayLabel = agent.displayName ?? agent.name
  const doneCount = agent.tools.filter((t) => t.status !== 'running').length

  return (
    <div className="sa-overlay" onMouseDown={onClose}>
      <div className="sa-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sa-card-head">
          <span className={'sa-card-ic ' + agent.status}>{saIcon(displayLabel, 18)}</span>
          <div className="sa-card-titles">
            <div className="sa-card-name">{displayLabel}</div>
            {agent.role && <div className="sa-card-role">{agent.role}</div>}
          </div>
          <span className={'sa-card-status ' + agent.status}>
            {SA_STATUS_LABEL[agent.status]}
          </span>
          <button className="sa-card-close" onClick={onClose} aria-label="닫기">
            <IconClose size={18} />
          </button>
        </div>

        <div className="sa-card-body">
          {agent.activity && (
            <div className="sa-card-sec">
              <div className="sa-card-lbl">
                {agent.status === 'done' ? '결과' : '설명'}
              </div>
              <div className="sa-card-md">{agent.activity}</div>
            </div>
          )}

          <div className="sa-card-sec">
            <div className="sa-card-lbl">
              도구 {doneCount}/{agent.tools.length}
            </div>
            {agent.tools.length ? (
              <div className="sa-tools">
                {agent.tools.map((t) => (
                  <div className={'sa-tool ' + t.status} key={t.id}>
                    <span className="sa-tool-verb">{mcpToolLabel(t.verb)}</span>
                    <span className="sa-tool-target">{t.target}</span>
                    <span className="sa-tool-st">
                      {t.status === 'running' ? (
                        <span className="spin" />
                      ) : t.status === 'done' ? (
                        <IconCheck size={12} />
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ag-empty">사용한 도구가 없어요</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SubAgentModal
