import {
  MODEL_EFFORT_LEVELS,
  EFFORT_LEVELS,
  clampEffort,
  supportsEffort,
  type EffortLevel
} from '../../shared/modelEffort'
import { normalizeModel, type KnownModel } from '../../shared/knownModels'

const MODE_TO_PERMISSION: Record<string, string> = {
  normal: 'default',
  plan: 'plan',
  acceptEdits: 'acceptEdits',
  auto: 'acceptEdits',
  bypass: 'bypassPermissions'
}

type ReasoningPatch =
  | { effort: EffortLevel; thinking?: never }
  | { thinking: { type: 'disabled' }; effort?: never }
  | Record<string, never>

export interface QueryOptionsPatch {
  model?: string
  permissionMode?: string
  effort?: EffortLevel
  thinking?: { type: 'disabled' }
}

function reasoningPatch(effort: string, model: KnownModel | undefined): ReasoningPatch {
  if (model !== undefined && !supportsEffort(model)) return {}

  if (effort === 'minimal') {
    if (model === 'claude-fable-5') return {}
    return { thinking: { type: 'disabled' } }
  }

  if (!(EFFORT_LEVELS as readonly string[]).includes(effort)) return {}
  const requested = effort as EffortLevel

  if (model === undefined) return { effort: requested }

  const clamped = clampEffort(model, requested)
  return clamped === undefined ? {} : { effort: clamped }
}

export function buildQueryOptions(opts: {
  model?: string
  effort?: string
  mode?: string
}): QueryOptionsPatch {
  const result: QueryOptionsPatch = {}

  const model = normalizeModel(opts.model)
  if (model !== undefined) result.model = model

  if (opts.effort !== undefined) {
    const patch = reasoningPatch(opts.effort, model)
    if ('effort' in patch && patch.effort !== undefined) result.effort = patch.effort
    if ('thinking' in patch && patch.thinking !== undefined) result.thinking = patch.thinking
  }

  if (opts.mode !== undefined) {
    const mapped = MODE_TO_PERMISSION[opts.mode]
    if (mapped !== undefined) result.permissionMode = mapped
  }

  return result
}

export function resolveSetModelRequest(req: {
  runId?: unknown
  model?: unknown
}): { runId: string; model: KnownModel } | null {
  if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') return null
  const model = typeof req.model === 'string' ? normalizeModel(req.model) : undefined
  if (model === undefined) return null
  return { runId: req.runId, model }
}

export { MODEL_EFFORT_LEVELS, normalizeModel }
export { KNOWN_MODELS, PICKER_MODELS } from '../../shared/knownModels'
export type { KnownModel } from '../../shared/knownModels'
