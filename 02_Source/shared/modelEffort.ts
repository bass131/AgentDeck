import type { KnownModel } from './knownModels'

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export const EFFORT_LEVELS: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']

export const MODEL_EFFORT_LEVELS: Record<KnownModel, readonly EffortLevel[]> = {
  'claude-opus-5': EFFORT_LEVELS,
  'claude-opus-4-8': EFFORT_LEVELS,
  'claude-fable-5': EFFORT_LEVELS,
  'claude-sonnet-5': EFFORT_LEVELS,
  'claude-haiku-4-5': []
}

export type EffortLevelTable = Record<string, readonly EffortLevel[]>

export function supportsEffort(
  model: string,
  table: EffortLevelTable = MODEL_EFFORT_LEVELS
): boolean {
  return (table[model]?.length ?? 0) > 0
}

export function clampEffort(
  model: string,
  requested: EffortLevel,
  table: EffortLevelTable = MODEL_EFFORT_LEVELS
): EffortLevel | undefined {
  const allowed = table[model]
  if (allowed === undefined || allowed.length === 0) return undefined
  if (allowed.includes(requested)) return requested
  for (let i = EFFORT_LEVELS.indexOf(requested) - 1; i >= 0; i--) {
    const candidate = EFFORT_LEVELS[i]
    if (allowed.includes(candidate)) return candidate
  }
  return undefined
}
