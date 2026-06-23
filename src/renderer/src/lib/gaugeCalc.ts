/**
 * gaugeCalc.ts — 토큰 컨텍스트 게이지 계산 순수 유틸 (M4-1 20d).
 *
 * window.api / Node / fs 0 — Vitest node 환경에서 바로 테스트 가능.
 * MODEL_CONTEXT_WINDOW 단일 출처(ipc-contract) 사용 → 드리프트 방지.
 */
import { MODEL_CONTEXT_WINDOW, DEFAULT_CONTEXT_WINDOW } from '../../../shared/ipc-contract'
import type { TokenUsage } from '../../../shared/agent-events'

export interface GaugeResult {
  /** 사용된 토큰 (inputTokens + outputTokens) */
  used: number
  /** 모델 컨텍스트 윈도우 크기 */
  window: number
  /** 0~100 퍼센트 (clamp) */
  pct: number
}

/**
 * calcGauge — lastUsage + 선택 모델 id로 게이지 수치 계산.
 *
 * @param usage - done 이벤트의 TokenUsage (없으면 게이지 0)
 * @param modelId - picker 선택 모델 id ('opus'|'sonnet'|'fable'|'haiku')
 *                  미지/undefined → DEFAULT_CONTEXT_WINDOW(1M) fallback
 * @param contextWindow - (Phase 21c) SDK가 보고한 실 컨텍스트 윈도우 크기(토큰).
 *                        양수일 때 modelId 룩업보다 우선 적용.
 *                        undefined / 0 / 음수면 modelId 룩업으로 fallback.
 *                        기존 2-arg 호출자는 영향 없음(optional).
 */
export function calcGauge(
  usage: TokenUsage | undefined,
  modelId: string | undefined,
  contextWindow?: number
): GaugeResult {
  const used = usage ? usage.inputTokens + usage.outputTokens : 0

  // contextWindow 우선 적용 — 양수(> 0)일 때만. 0/음수/undefined는 모델 룩업 fallback.
  const win =
    contextWindow !== undefined && contextWindow > 0
      ? contextWindow
      : modelId !== undefined
        ? (MODEL_CONTEXT_WINDOW[modelId] ?? DEFAULT_CONTEXT_WINDOW)
        : DEFAULT_CONTEXT_WINDOW

  const pct = win > 0 ? Math.min(100, Math.round((used / win) * 100)) : 0
  return { used, window: win, pct }
}
