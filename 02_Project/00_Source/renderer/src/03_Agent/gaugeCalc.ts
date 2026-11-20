import { DEFAULT_CONTEXT_WINDOW } from '@shared/ipcContract'
import type { TokenUsage } from '@shared/agentEvents'

export interface GaugeResult {
  used: number
  window: number
  pct: number
}

// 창은 턴 결과가 준 contextWindow(main이 주 모델 항목에서 고른 값)를 쓰고, 첫 턴 전에는 기본값 하나다 (M06 G4).
export function calcGauge(usage: TokenUsage | undefined, contextWindow?: number): GaugeResult {
  const used = usage
    ? usage.inputTokens +
      (usage.cacheCreationTokens ?? 0) +
      (usage.cacheReadTokens ?? 0) +
      usage.outputTokens
    : 0

  const win = contextWindow !== undefined && contextWindow > 0 ? contextWindow : DEFAULT_CONTEXT_WINDOW

  const pct = win > 0 ? Math.min(100, Math.round((used / win) * 100)) : 0
  return { used, window: win, pct }
}
