/**
 * runArgs.ts — renderer 피커 값 → SDK query() 옵션 매핑
 *
 * CRITICAL(신뢰경계): 이 함수가 allowlist다. renderer가 보내는 model/effort/mode는
 * untrusted 문자열이며, 여기서 알려진 SDK 옵션으로만 변환된다. 알 수 없는 값은 해당
 * 필드를 생략한다 — renderer 임의 문자열이 SDK 옵션으로 새어 나가지 않는다.
 *
 * electron import 0 — vitest에서 직접 실행 가능.
 */

import {
  MODEL_EFFORT_LEVELS,
  EFFORT_LEVELS,
  clampEffort,
  type EffortLevel
} from '../../shared/modelEffort'
import { normalizeModel, type KnownModel } from '../../shared/knownModels'

/** SDK PermissionMode 매핑. 맵에 없는 id는 무시(allowlist). */
const MODE_TO_PERMISSION: Record<string, string> = {
  normal: 'default',
  plan: 'plan',
  acceptEdits: 'acceptEdits',
  auto: 'acceptEdits',
  bypass: 'bypassPermissions'
}

/**
 * 추론 강도 옵션. `effort`와 `thinking`은 **배타**다 — 유니온으로 묶어 동시 전송을
 * 타입 수준에서 막는다.
 *
 * 이 배타성이 방어하는 것: Claude Opus 5는 `thinking: {type:'disabled'}`를 effort가
 * `high` 이하일 때만 받고 `xhigh`/`max`와 함께 오면 400으로 거절한다(요청마다 검증).
 * 두 키를 한 객체에 담을 수 있는 형상이면 언젠가 누군가 둘 다 채우고, 그 400은 사용자
 * 턴이 죽는 형태로만 드러난다. 담을 수 없게 만들면 그 실패 경로 자체가 사라진다.
 */
type ReasoningPatch =
  | { effort: EffortLevel; thinking?: never }
  | { thinking: { type: 'disabled' }; effort?: never }
  | Record<string, never>

/**
 * SDK query() 옵션 부분 객체. model/permissionMode/effort/thinking만 담는다.
 * 나머지(cwd, abortController, canUseTool, systemPrompt 등)는 `sdkOptions.ts`가 주입한다.
 */
export interface QueryOptionsPatch {
  model?: string
  permissionMode?: string
  effort?: EffortLevel
  thinking?: { type: 'disabled' }
}

/**
 * 추론 강도 피커 값 → SDK 옵션.
 *
 * - 'minimal'  → `thinking: {type:'disabled'}` (effort 키 없음)
 * - 유효 레벨  → `effort: <모델이 받는 레벨로 클램프>` (thinking 키 없음)
 * - 그 외      → `{}` (미지 값은 생략)
 *
 * 'minimal' + Fable 5만 `{}`를 낸다. Fable 5는 Opus 계열과 API 거동이 갈리는 모델이고
 * `thinking: {type:'disabled'}` 수용 여부를 라이브로 확인하지 못했다 — 확인 전까지
 * 키를 보내지 않는 쪽(모델 기본 거동에 맡김)을 유지한다. 이전 구현의 특례를 근거만
 * 명시해 보존한 것이며, 실측하면 이 분기는 사라져야 한다.
 */
function reasoningPatch(effort: string, model: KnownModel | undefined): ReasoningPatch {
  if (effort === 'minimal') {
    if (model === 'claude-fable-5') return {}
    return { thinking: { type: 'disabled' } }
  }

  if (!(EFFORT_LEVELS as readonly string[]).includes(effort)) return {}
  const requested = effort as EffortLevel

  // 모델 미전달/미지: 클램프 근거가 없으므로 요청값을 그대로 넘긴다. SDK가 받지 못하는
  // 레벨이면 SDK 쪽에서 걸러지고, 여기서 임의로 낮추면 모델을 명시한 호출보다 약해진다.
  if (model === undefined) return { effort: requested }

  const clamped = clampEffort(model, requested)
  return clamped === undefined ? {} : { effort: clamped }
}

/**
 * model/effort/mode 피커 값을 SDK query() 옵션 패치로 변환한다.
 *
 * @param opts 피커 값 (모두 optional, 모두 untrusted)
 * @returns 알려진 필드만 담긴 SDK 옵션 패치
 */
export function buildQueryOptions(opts: {
  model?: string
  effort?: string
  mode?: string
}): QueryOptionsPatch {
  const result: QueryOptionsPatch = {}

  // model — full ID 또는 레거시 별칭을 KnownModel로 정규화. 미지 값은 생략.
  const model = normalizeModel(opts.model)
  if (model !== undefined) result.model = model

  // effort / thinking — effort 미지원 모델(MODEL_EFFORT_LEVELS가 빈 배열)은 두 키 모두 생략.
  if (opts.effort !== undefined) {
    const patch = reasoningPatch(opts.effort, model)
    if ('effort' in patch && patch.effort !== undefined) result.effort = patch.effort
    if ('thinking' in patch && patch.thinking !== undefined) result.thinking = patch.thinking
  }

  // mode — MODE_TO_PERMISSION allowlist. 맵에 없으면 생략.
  if (opts.mode !== undefined) {
    const mapped = MODE_TO_PERMISSION[opts.mode]
    if (mapped !== undefined) result.permissionMode = mapped
  }

  return result
}

// 소비처가 `./runArgs` 경로로 모델 어휘를 받아 온 관례를 유지한다(정의는 shared가 단일 원본).
export { MODEL_EFFORT_LEVELS, normalizeModel }
export { KNOWN_MODELS, PICKER_MODELS } from '../../shared/knownModels'
export type { KnownModel } from '../../shared/knownModels'
