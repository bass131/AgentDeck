import type { JSX } from 'react'
import { ZOOM_FACTOR_RANGE, ZOOM_FACTOR_STEP } from '../../../../shared/ipcContract'
import { useZoomFactorPct, stepZoomFactor, resetZoomFactor } from '../../lib/useGlobalZoom'
import './ZoomControl.css'

const MIN_PCT = ZOOM_FACTOR_RANGE.MIN * 100
const MAX_PCT = ZOOM_FACTOR_RANGE.MAX * 100

export function ZoomControl(): JSX.Element {
  const pct = useZoomFactorPct()
  const atMin = pct <= MIN_PCT
  const atMax = pct >= MAX_PCT
  const atReset = pct === 100

  return (
    <div className="zoom-ctl" role="group" aria-label="화면 확대/축소">
      <button
        type="button"
        className="zoom-ctl-btn"
        aria-label="축소"
        disabled={atMin}
        onClick={() => stepZoomFactor(-ZOOM_FACTOR_STEP)}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1 5 L9 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        className="zoom-ctl-pct"
        aria-label={`화면 100%로 초기화 (현재 ${pct}%)`}
        disabled={atReset}
        onClick={resetZoomFactor}
      >
        {pct}%
      </button>
      <button
        type="button"
        className="zoom-ctl-btn"
        aria-label="확대"
        disabled={atMax}
        onClick={() => stepZoomFactor(ZOOM_FACTOR_STEP)}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M5 1 L5 9 M1 5 L9 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

export default ZoomControl
