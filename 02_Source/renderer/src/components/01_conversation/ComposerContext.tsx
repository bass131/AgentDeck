/**
 * ComposerContext.tsx — ContextStrip 컴포넌트 (컨텍스트 게이지 3칩).
 *
 * Composer.tsx Phase 14 분해: ContextStrip을 별도 파일로 추출.
 * B8 Phase 26: 컨텍스트 윈도우 / 5시간 한도 / 주간 한도 3칩.
 * 색은 CSS 변수 토큰 — 인라인 색상 금지(UI.md).
 */
import { memo, type JSX } from 'react'
import { calcGauge } from '../../lib/gaugeCalc'
import { buildChips } from '../../lib/contextChips'
import type { TokenUsage } from '../../../../shared/agent-events'
import type { UsageInfo } from '../../../../shared/ipc-contract'

interface ContextStripProps {
  /** 마지막 run usage (done 이벤트 수신 후 채워짐) */
  lastUsage?: TokenUsage
  /** 현재 선택된 모델 id (컨텍스트 윈도우 분모) */
  selectedModel?: string
  /**
   * SDK가 보고한 실 컨텍스트 윈도우 크기 (Phase 21c).
   * 양수일 때 MODEL_CONTEXT_WINDOW 룩업보다 우선 적용. 미전달 시 모델 id 룩업 동작 유지.
   */
  lastContextWindow?: number
  /**
   * OAuth 레이트리밋 게이지 (B8 Phase 26).
   * null 필드이면 '—' / '데이터 없음' 표시.
   * 미전달 시 { fiveHour: null, weekly: null } fallback.
   */
  usage?: UsageInfo
}

export const ContextStrip = memo(function ContextStrip({
  lastUsage,
  selectedModel,
  lastContextWindow,
  usage,
}: ContextStripProps): JSX.Element {
  // Phase 21c: lastContextWindow 우선, 없으면 modelId 룩업 fallback
  const gauge = calcGauge(lastUsage, selectedModel, lastContextWindow)

  // B8: 실 usage 연결 (미전달 시 null 필드 fallback → buildChips가 '데이터 없음' 표시)
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
