import type { UsageInfo } from '../../../shared/ipcContract'
import type { GaugeResult } from './gaugeCalc'
import { resetText } from './resetText'

export interface ChipData {
  label: string
  pct: number | null
  detail: string
}

function fmtWindow(tokens: number): string {
  const k = Math.round(tokens / 1000)
  return k >= 1000 ? (k % 1000 === 0 ? k / 1000 + 'M' : (k / 1000).toFixed(1) + 'M') : k + 'K'
}

function fmtTok(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1000) return Math.round(n / 1000) + 'K'
  return String(n)
}

export function buildChips(gauge: GaugeResult, usage: UsageInfo): ChipData[] {
  const ctxDetail = `${fmtTok(gauge.used)} / ${fmtWindow(gauge.window)} 토큰`

  return [
    {
      label: '현재 컨텍스트',
      pct: gauge.pct,
      detail: ctxDetail,
    },
    {
      label: '5시간 한도',
      pct: usage.fiveHour?.pct ?? null,
      detail: usage.fiveHour
        ? resetText(usage.fiveHour.resetsAt, false)
        : '데이터 없음',
    },
    {
      label: '주간 한도',
      pct: usage.weekly?.pct ?? null,
      detail: usage.weekly
        ? resetText(usage.weekly.resetsAt, true)
        : '데이터 없음',
    },
  ]
}
