/**
 * contextChips.ts — ContextStrip 3칩 데이터 계산 순수 유틸 (B8 Phase 26).
 *
 * 원본: AgentCodeGUI Chat.tsx L922~957 ContextStrip 구조 미러.
 *
 * CRITICAL: 순수 함수 — 부수효과 없음. window.api 호출 0. 인라인 색상 0.
 */
import type { UsageInfo } from '../../../shared/ipc-contract'
import type { GaugeResult } from './gaugeCalc'
import { resetText } from './resetText'

export interface ChipData {
  /** 칩 라벨 */
  label: string
  /** 0~100 퍼센트, null이면 데이터 없음 */
  pct: number | null
  /** 상세 텍스트 (토큰 정보 또는 리셋 시간) */
  detail: string
}

/**
 * fmtWindow — 컨텍스트 윈도우 크기(토큰) → 표시 문자열.
 * 원본 Chat.tsx fmtWindow 미러.
 */
function fmtWindow(tokens: number): string {
  const k = Math.round(tokens / 1000)
  return k >= 1000 ? (k % 1000 === 0 ? k / 1000 + 'M' : (k / 1000).toFixed(1) + 'M') : k + 'K'
}

/**
 * fmtTok — 사용 토큰 수 → 표시 문자열.
 * 원본 Chat.tsx fmtTok 미러.
 */
function fmtTok(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1000) return Math.round(n / 1000) + 'K'
  return String(n)
}

/**
 * buildChips — 게이지 결과 + usage 정보로 3칩 데이터 계산.
 *
 * @param gauge - calcGauge 결과 (현재 컨텍스트 게이지)
 * @param usage - OAuth 레이트리밋 게이지 (null 가능)
 * @returns 3개 ChipData 배열 [현재 컨텍스트, 5시간 한도, 주간 한도]
 */
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
