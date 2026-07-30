/**
 * modelEffort.ts — 모델별 effort 지원 (shared 도메인 상수)
 *
 * CRITICAL: Node 전용 API 금지(fs·process·path 등) — renderer 번들에도 로드된다.
 *
 * ## 형상을 SDK에 맞춘 이유
 *
 * SDK `ModelInfo`(sdk.d.ts:1188)는 모델 능력을 `supportedEffortLevels: EffortLevel[]`로
 * 준다. 이 파일도 같은 형상(레벨 배열)을 쓴다 — 이전 형상은 `{supports, xhigh?}`처럼
 * 특정 레벨마다 boolean 필드를 두는 방식이었는데, 레벨이 하나 늘 때마다 필드를 만들어야
 * 하고 SDK 값과 직접 비교할 수 없어 대조 테스트를 못 쓴다.
 *
 * 배열 형상의 대가: 지원 여부를 물을 때마다 `includes()` 순회가 든다. 레벨이 5개라
 * 무시할 수준이고, 드리프트를 기계가 잡는 값이 그보다 크다.
 */

import type { KnownModel } from './knownModels'

/** SDK가 받는 effort 레벨 (sdk.d.ts:522 EffortLevel과 동일 집합). */
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** 낮은 쪽부터 — picker 정렬·클램프 판정의 기준 순서. */
export const EFFORT_LEVELS: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']

/**
 * 모델별로 받아들여지는 effort 레벨. 빈 배열 = effort/thinking 키를 아예 보내지 않는다.
 *
 * 근거(SDK@0.3.201 `supportedModels()` 실측, 2026-07-30): opus[1m]·claude-fable-5[1m]·
 * sonnet 세 행이 전부 `["low","medium","high","xhigh","max"]`를 신고했고, haiku 행에는
 * `supportsEffort`·`supportedEffortLevels` 키가 아예 없었다.
 *
 * claude-opus-5는 SDK picker 목록에 없어 `supportedModels()`로 신고를 받을 수 없다.
 * 대신 라이브 호출로 확인했다(같은 실측): model='claude-opus-5' + effort='max' 조합이
 * 400 없이 통과하고 응답 message.model='claude-opus-5'였다. 사다리 전체를 받는다고
 * 단정하지는 않는다 — 실제로 확인한 건 max와 xhigh 두 레벨이고, 그 아래 레벨이
 * 상위 레벨보다 좁게 지원되는 API는 알려진 바 없다.
 */
export const MODEL_EFFORT_LEVELS: Record<KnownModel, readonly EffortLevel[]> = {
  'claude-opus-5': EFFORT_LEVELS,
  'claude-opus-4-8': EFFORT_LEVELS,
  'claude-fable-5': EFFORT_LEVELS,
  'claude-sonnet-5': EFFORT_LEVELS,
  'claude-haiku-4-5': []
}

/** 이 모델이 effort 키를 받는가. */
export function supportsEffort(model: KnownModel): boolean {
  return MODEL_EFFORT_LEVELS[model].length > 0
}

/**
 * 요청한 레벨을 이 모델이 실제로 받는 레벨로 낮춘다.
 *
 * 지원 목록에 없으면 EFFORT_LEVELS 순서에서 한 칸씩 내려가며 처음 지원되는 레벨을 쓴다
 * (예: xhigh 미지원 모델에 xhigh → high). 위로 올리지는 않는다 — 사용자가 요청한 것보다
 * 비싸고 느린 쪽으로 임의 승격하면 안 된다. effort 미지원 모델은 undefined.
 */
export function clampEffort(model: KnownModel, requested: EffortLevel): EffortLevel | undefined {
  const allowed = MODEL_EFFORT_LEVELS[model]
  if (allowed.length === 0) return undefined
  if (allowed.includes(requested)) return requested
  for (let i = EFFORT_LEVELS.indexOf(requested) - 1; i >= 0; i--) {
    const candidate = EFFORT_LEVELS[i]
    if (allowed.includes(candidate)) return candidate
  }
  return undefined
}
