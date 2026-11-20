// 모델 목록 (M06 G4) — 앱에 든 Agent SDK의 `supportedModels()`가 원천이다.
// main 공급자가 받아 캐시하고 IPC로 넘긴다. 선택기·effort 메뉴·실행 인자 검사가 모두 이 모양을 쓴다.
import { isEffortLevel, type EffortLevel } from './modelEffort'

export interface ModelRow {
  value: string
  resolvedModel?: string
  displayName: string
  description: string
  // 없으면 빈 배열 — SDK가 단계를 알리지 않은 모델은 effort를 받지 않는다(실측: 단계 필드 자체가 없다).
  supportedEffortLevels: EffortLevel[]
}

export type ModelListSource = 'sdk' | 'cache' | 'builtin'

export interface ModelListResponse {
  models: ModelRow[]
  source: ModelListSource
  fetchedAt?: string
}

// 대화에 저장하는 정식 ID — 별칭 행은 풀린 ID(resolvedModel), 명시 행은 value 그대로다.
export function canonicalModelId(row: ModelRow): string {
  return row.resolvedModel ?? row.value
}

// 대조용으로 끝의 「[…]」 표기와 8자리 날짜 접미를 벗긴다. 저장값 자체는 바꾸지 않는다.
export function stripModelSuffixes(id: string): string {
  return id.replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '')
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

// 캐시 파일·SDK 응답의 모델 값 꼴 — 별칭(opus·default)과 정식 ID, 끝의 「[…]」 표기만 받는다(M06 Backlog 18)
const ROW_MODEL_SHAPE = /^[a-z0-9][a-z0-9.-]*(?:\[[a-z0-9]+\])?$/
const MAX_ROW_MODEL_LENGTH = 128

function isModelValue(v: unknown): v is string {
  return typeof v === 'string' && v.length <= MAX_ROW_MODEL_LENGTH && ROW_MODEL_SHAPE.test(v)
}

// SDK 응답이나 캐시 파일 같은 신뢰 밖 원자료를 행 목록으로 거른다. 모양이 틀린 행은 버린다.
export function sanitizeModelRows(raw: unknown): ModelRow[] {
  if (!Array.isArray(raw)) return []
  const rows: ModelRow[] = []
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (!isModelValue(o['value'])) continue
    const levels = Array.isArray(o['supportedEffortLevels'])
      ? (o['supportedEffortLevels'] as unknown[]).filter(isEffortLevel)
      : []
    const row: ModelRow = {
      value: o['value'],
      displayName: isNonEmptyString(o['displayName']) ? o['displayName'] : o['value'],
      description: typeof o['description'] === 'string' ? o['description'] : '',
      supportedEffortLevels: levels,
    }
    if (isModelValue(o['resolvedModel'])) row.resolvedModel = o['resolvedModel']
    rows.push(row)
  }
  return rows
}

// 저장된 ID(정식·별칭·옛 짧은 ID)를 목록 행에 맞춘다 — 정식 ID, value, 접미를 벗긴 정식 ID 순이다.
export function findModelRow(rows: readonly ModelRow[], id: string | undefined): ModelRow | undefined {
  if (!id) return undefined
  const exact = rows.find((r) => canonicalModelId(r) === id) ?? rows.find((r) => r.value === id)
  if (exact) return exact
  const bare = stripModelSuffixes(id)
  return rows.find((r) => stripModelSuffixes(canonicalModelId(r)) === bare)
}

export function effortLevelsFor(rows: readonly ModelRow[], id: string | undefined): readonly EffortLevel[] | undefined {
  return findModelRow(rows, id)?.supportedEffortLevels
}

// 선택기에 보일 행 — 같은 정식 ID는 한 줄이다. 자리는 처음 나온 곳을 지키고, 내용은 뒤에 나온 행을 쓴다
// (목록 맨 앞의 기본 행과 같은 모델의 별칭 행이 겹칠 때 별칭 행의 이름이 남는다).
export function pickerModelRows(rows: readonly ModelRow[]): ModelRow[] {
  const out: ModelRow[] = []
  const at = new Map<string, number>()
  for (const row of rows) {
    const id = canonicalModelId(row)
    const idx = at.get(id)
    if (idx === undefined) {
      at.set(id, out.length)
      out.push(row)
    } else {
      out[idx] = row
    }
  }
  return out
}
