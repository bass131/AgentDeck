import {
  clampEffort,
  readEffortLevel,
  type EffortLevel
} from '@shared/03_Agent/models/modelEffort'
import { normalizeModel } from '@shared/03_Agent/models/knownModels'
import { findModelRow, type ModelRow } from '@shared/03_Agent/models/modelList'
import { START_MODE_TO_SDK } from './permissionModes'
import { currentModelRows } from './modelListProvider'

export interface QueryOptionsPatch {
  model?: string
  permissionMode?: string
  effort?: EffortLevel
}

// effort는 SDK 목록 행의 supportedEffortLevels 안으로만 보낸다 (M06 G4).
// 저장값은 readEffortLevel로 읽는다(옛 「최소」는 low) — 선택기가 보여 주는 값과 같다. 사고 끄기 경로는 없다.
// 모델이 목록 어느 행과도 맞지 않으면 effort를 붙이지 않는다(받는지 모르는 값을 보내지 않는다).
function reasoningEffort(effort: string, model: string | undefined, rows: readonly ModelRow[]): EffortLevel | undefined {
  const requested: EffortLevel = readEffortLevel(effort)
  if (model === undefined) return requested
  const row = findModelRow(rows, model)
  if (row === undefined) return undefined
  return clampEffort(row.supportedEffortLevels, requested)
}

export function buildQueryOptions(
  opts: {
    model?: string
    effort?: string
    mode?: string
  },
  rows: readonly ModelRow[] = currentModelRows()
): QueryOptionsPatch {
  const result: QueryOptionsPatch = {}

  const model = normalizeModel(opts.model, rows)
  if (model !== undefined) result.model = model

  if (opts.effort !== undefined) {
    const effort = reasoningEffort(opts.effort, model, rows)
    if (effort !== undefined) result.effort = effort
  }

  if (opts.mode !== undefined) {
    const mapped = START_MODE_TO_SDK[opts.mode]
    if (mapped !== undefined) result.permissionMode = mapped
  }

  return result
}

export function resolveSetModelRequest(
  req: {
    runId?: unknown
    model?: unknown
  },
  rows: readonly ModelRow[] = currentModelRows()
): { runId: string; model: string } | null {
  if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') return null
  const model = normalizeModel(req.model, rows)
  if (model === undefined) return null
  return { runId: req.runId, model }
}

// 실행 중 run이 쓰는 모델 값 검사 — main의 현재 목록 기준이다.
export function normalizeRunModel(value: unknown): string | undefined {
  return normalizeModel(value, currentModelRows())
}
