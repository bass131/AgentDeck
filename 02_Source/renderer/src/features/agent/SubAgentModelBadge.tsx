import { type CSSProperties, type JSX } from 'react'
import { modelLabel, modelFamilyColor, isBareModelAlias } from '../../lib/modelLabel'
import './SubAgentModelBadge.css'

export function SubAgentModelBadge({
  model,
  running,
  compact,
}: {
  model: string | undefined
  running?: boolean
  compact?: boolean
}): JSX.Element | null {
  if (isBareModelAlias(model)) return null
  const label = modelLabel(model)
  if (!label) return null
  const color = modelFamilyColor(model)

  return (
    <span
      className={'sa-model-badge' + (running ? ' running' : '') + (compact ? ' compact' : '')}
    >
      <span
        className="sa-model-dot"
        aria-hidden="true"
        style={color ? ({ background: color } as CSSProperties) : undefined}
      />
      <span className="sa-model-txt">{label}</span>
    </span>
  )
}

export default SubAgentModelBadge
