import { memo, type JSX } from 'react'
import { calcGauge } from '../../lib/gaugeCalc'
import { buildChips } from '../../lib/contextChips'
import type { TokenUsage } from '../../../../shared/agentEvents'
import type { UsageInfo } from '../../../../shared/ipcContract'

interface ContextStripProps {
  lastUsage?: TokenUsage
  selectedModel?: string
  lastContextWindow?: number
  usage?: UsageInfo
}

export const ContextStrip = memo(function ContextStrip({
  lastUsage,
  selectedModel,
  lastContextWindow,
  usage,
}: ContextStripProps): JSX.Element {
  const gauge = calcGauge(lastUsage, selectedModel, lastContextWindow)

  const effectiveUsage: UsageInfo = usage ?? { fiveHour: null, weekly: null }
  const chips = buildChips(gauge, effectiveUsage)

  return (
    <div className="ctx-strip">
      {chips.map((chip) => (
        <div className="ctx-chip" key={chip.label}>
          <span className="cc-ring" style={{ ['--p' as string]: chip.pct ?? 0 }} aria-hidden="true" />
          <span className="cc-text">
            <span className="cc-top">
              <span className="cc-label">{chip.label}</span>
              <span className="cc-pct">{chip.pct != null ? chip.pct + '%' : '—'}</span>
            </span>
            <span className="cc-detail">{chip.detail}</span>
          </span>
        </div>
      ))}
    </div>
  )
})
