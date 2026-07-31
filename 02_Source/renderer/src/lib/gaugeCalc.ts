import { MODEL_CONTEXT_WINDOW, DEFAULT_CONTEXT_WINDOW } from '../../../shared/ipcContract'
import { normalizeModel } from '../../../shared/knownModels'
import type { TokenUsage } from '../../../shared/agentEvents'

export interface GaugeResult {
  used: number
  window: number
  pct: number
}

export function calcGauge(
  usage: TokenUsage | undefined,
  modelId: string | undefined,
  contextWindow?: number
): GaugeResult {
  const used = usage
    ? usage.inputTokens +
      (usage.cacheCreationTokens ?? 0) +
      (usage.cacheReadTokens ?? 0) +
      usage.outputTokens
    : 0

  const normalized = modelId !== undefined ? normalizeModel(modelId) : undefined
  const win =
    contextWindow !== undefined && contextWindow > 0
      ? contextWindow
      : normalized !== undefined
        ? MODEL_CONTEXT_WINDOW[normalized]
        : DEFAULT_CONTEXT_WINDOW

  const pct = win > 0 ? Math.min(100, Math.round((used / win) * 100)) : 0
  return { used, window: win, pct }
}
