import { memo, type JSX } from 'react'
import { calcGauge } from '@renderer/03_Agent/gaugeCalc'
import { buildChips } from './contextChips'
import type { TokenUsage } from '@shared/agentEvents'
import type { UsageInfo } from '@shared/ipcContract'

export interface AutoCompactInfo {
  enabled: boolean
  thresholdTokens?: number
}

interface ContextStripProps {
  lastUsage?: TokenUsage
  lastContextWindow?: number
  usage?: UsageInfo
  autoCompact?: AutoCompactInfo | null
}

// 계기 창은 모델이 아니라 턴 결과의 contextWindow에서 온다.
// SDK 자동 압축 상태 한 마디 — 실행이 알리기 전에는 보이지 않는다
function autoCompactText(ac: AutoCompactInfo): string {
  if (!ac.enabled) return '자동 압축 꺼짐'
  if (ac.thresholdTokens === undefined) return '자동 압축 켜짐'
  const k = Math.round(ac.thresholdTokens / 1000)
  return `자동 압축 ${k >= 1000 ? (k / 1000).toFixed(1) + 'M' : k + 'K'}`
}

export const ContextStrip = memo(function ContextStrip({
  lastUsage,
  lastContextWindow,
  usage,
  autoCompact,
}: ContextStripProps): JSX.Element {
  const gauge = calcGauge(lastUsage, lastContextWindow)

  const effectiveUsage: UsageInfo = usage ?? { fiveHour: null, weekly: null }
  const chips = buildChips(gauge, effectiveUsage)

  return (
    <div className="ctx-strip">
      {chips.map((chip, i) => (
        <div className="ctx-chip" key={chip.label}>
          <span className="cc-ring" style={{ ['--p' as string]: chip.pct ?? 0 }} aria-hidden="true" />
          <span className="cc-text">
            <span className="cc-top">
              <span className="cc-label">{chip.label}</span>
              <span className="cc-pct">{chip.pct != null ? chip.pct + '%' : '—'}</span>
            </span>
            <span className="cc-detail">{chip.detail}</span>
            {i === 0 && autoCompact && <span className="cc-detail" data-auto-compact>{autoCompactText(autoCompact)}</span>}
          </span>
        </div>
      ))}
    </div>
  )
})
