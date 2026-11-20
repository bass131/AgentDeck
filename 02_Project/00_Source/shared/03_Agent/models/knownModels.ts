import { EFFORT_LEVELS } from './modelEffort'
import { canonicalModelId, type ModelRow } from './modelList'

// 최소 목록 (M06 G4) — SDK가 목록을 못 주고 캐시도 없을 때만 쓰는 마지막 폴백이다.
// 소스에서 모델 ID를 손으로 적는 곳은 여기 한 곳뿐이다. 평소 목록은 SDK `supportedModels()`가 준다.
// SDK 0.3.325의 별칭 행 넷과 같은 꼴이다 — value는 별칭, resolvedModel은 풀린 정식 ID(M06 Backlog 16).
export const FALLBACK_MODELS: readonly ModelRow[] = [
  { value: 'opus', resolvedModel: 'claude-opus-5-5', displayName: 'Opus 5.5', description: '코딩·에이전트 최상위 · 복잡한 작업', supportedEffortLevels: [...EFFORT_LEVELS] },
  { value: 'fable', resolvedModel: 'claude-fable-5-2', displayName: 'Fable 5.2', description: '가장 어렵고 오래 걸리는 작업', supportedEffortLevels: [...EFFORT_LEVELS] },
  { value: 'sonnet', resolvedModel: 'claude-sonnet-5-5', displayName: 'Sonnet 5.5', description: '균형 · 일상 작업', supportedEffortLevels: [...EFFORT_LEVELS] },
  { value: 'haiku', resolvedModel: 'claude-haiku-5-5', displayName: 'Haiku 5.5', description: '빠른 응답 · 가벼운 질문', supportedEffortLevels: [...EFFORT_LEVELS] },
]

export const DEFAULT_MODEL_ID: string = canonicalModelId(FALLBACK_MODELS[0])

// 새 대화 기본 모델 — SDK 목록의 default 행이 풀린 정식 ID(M06 Backlog 17). 없으면 첫 행, 빈 목록이면 최소 목록 기본값.
export function defaultModelOf(rows: readonly ModelRow[]): string {
  const row = rows.find((r) => r.value === 'default') ?? rows[0]
  return row ? canonicalModelId(row) : DEFAULT_MODEL_ID
}

// `claude-<이름>(-<마디>)*`에 선택적 「[…]」 표기 — 목록에 아직 없는 새 ID도 통과한다.
const MODEL_ID_SHAPE = /^claude(?:-[a-z0-9]+)+(?:\[[a-z0-9]+\])?$/
const MAX_MODEL_ID_LENGTH = 128

// 신뢰 밖 문자열(IPC 요청·저장된 대화)을 SDK에 넘겨도 되는 모델 값인지 본다. 표 대조가 아니라 꼴 검사다.
// 짧은 별칭(value가 `claude-`로 시작하지 않는 행)은 지금 목록에 있을 때만 받는다. 값을 바꾸지 않는다.
export function normalizeModel(value: unknown, rows: readonly ModelRow[] = FALLBACK_MODELS): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_MODEL_ID_LENGTH) return undefined
  if (MODEL_ID_SHAPE.test(value)) return value
  return rows.some((r) => r.value === value) ? value : undefined
}
