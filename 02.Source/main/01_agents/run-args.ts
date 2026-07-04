/**
 * run-args.ts — SDK 옵션 매핑 (순수 모듈, Phase 21b ADR-016)
 *
 * CRITICAL(신뢰경계): 이 함수가 allowlist다.
 * renderer가 보내는 model/effort/mode(untrusted)를 알려진 SDK 옵션으로만 변환한다.
 * 알 수 없는 id는 전부 무시 — renderer 임의 문자열이 SDK 옵션에 들어가지 않음.
 *
 * electron import 0 — vitest 직접 실행 가능.
 *
 * 설계 결정 (Phase 21b, ADR-016):
 * - CLI 플래그 빌더(buildRunArgs) → SDK 옵션 매핑(buildQueryOptions)으로 전환.
 * - KNOWN_MODELS / MODEL_EFFORT_SUPPORT 재활용 (untrusted 피커 id → 알려진 SDK 옵션만).
 * - 원본 engine.ts effortToOptions/modeToPermission 미러:
 *     - minimal + fable  → {} (effort/thinking 키 없음)
 *     - minimal + others → { thinking: { type: 'disabled' } }
 *     - 그 외 유효 effort → { effort: clampedEffort }
 *     - haiku는 MODEL_EFFORT_SUPPORT.supports:false → effort/thinking 둘 다 생략.
 * - CLI 플래그 리터럴(--model, --effort 등) 코드에 없음.
 */

// ── Allowlist 상수 ───────────────────────────────────────────────────────────

/**
 * 허용된 모델 picker id (SDK alias — full 모델 ID 아님).
 * KNOWN_MODELS와 MODEL_CONTEXT_WINDOW(shared) 키 집합이 동일해야 한다(드리프트 금지).
 * 권위 확인(claude-code-guide, 2026-07-04): opus=Opus4.8, sonnet=Sonnet5,
 * haiku=Haiku4.5, fable=Fable5.
 * sonnet 별칭 라이브 실측(model-alias-sonnet5-live-probe.test.ts, LIVE_SDK=1,
 * SDK@0.3.201): 'sonnet' → message.model='claude-sonnet-5' 확인(SDK@0.3.186에서는
 * 'claude-sonnet-4-6'이었음 — bump로 해소, 별도 ID 매핑 불요).
 */
export const KNOWN_MODELS = ['opus', 'sonnet', 'haiku', 'fable'] as const
export type KnownModel = (typeof KNOWN_MODELS)[number]

/**
 * 유효한 SDK effort 값.
 * 'minimal'은 여기 없음 — 우리 앱 내부 id (effortToOptions에서 special-cased).
 */
const VALID_SDK_EFFORTS = new Set<string>(['low', 'medium', 'high', 'xhigh', 'max'])

/**
 * 모델별 effort 지원 표.
 *
 * supports: false → effort/thinking 키를 아예 생략.
 * xhigh: false    → xhigh 입력 시 'high'로 클램프.
 *
 * 권위 확인(claude-code-guide, 2026-07-04):
 * - Opus 4.8: effort 지원, xhigh/max 모두 지원.
 * - Fable 5: effort 지원, xhigh/max 모두 지원.
 * - Sonnet 5: effort 지원, xhigh/max 모두 지원(Sonnet 4.6까지는 xhigh 미지원 →high 클램프였음 —
 *   'sonnet' 별칭 라이브 실측(SDK@0.3.201)으로 Sonnet 5 해석 확인 후 클램프 해제).
 * - Haiku 4.5: effort 미지원(키 생략).
 */
export const MODEL_EFFORT_SUPPORT: Record<KnownModel, { supports: boolean; xhigh?: boolean }> = {
  opus: { supports: true, xhigh: true },
  fable: { supports: true, xhigh: true },
  sonnet: { supports: true, xhigh: true },
  haiku: { supports: false }
}

/**
 * SDK PermissionMode 매핑.
 * 원본 engine.ts modeToPermission 미러.
 * 맵에 없는 id는 무시(allowlist).
 */
const MODE_TO_PERMISSION: Record<string, string> = {
  normal: 'default',
  plan: 'plan',
  acceptEdits: 'acceptEdits',
  auto: 'acceptEdits',
  bypass: 'bypassPermissions'
}

// ── effortToOptions ───────────────────────────────────────────────────────────

/**
 * effort picker id + 확정 모델 id → SDK options 부분 객체.
 *
 * 원본 engine.ts effortToOptions 미러:
 *   - minimal + fable  → {} (thinking 키 없음)
 *   - minimal + others → { thinking: { type: 'disabled' } }
 *   - 그 외 유효 effort → { effort: clampedEffort }
 *
 * haiku는 이 함수 호출 전에 MODEL_EFFORT_SUPPORT 체크로 걸러진다.
 * model 미전달/미지 시에는 'fable' 취급하지 않음 → minimal은 thinking:disabled 반환.
 *
 * @param effort 유효한 effort id ('minimal' 포함, VALID_SDK_EFFORTS ∪ {'minimal'})
 * @param model  확정된 picker id (KNOWN_MODELS 중 하나, 또는 undefined)
 * @param xhighSupported xhigh 지원 여부
 */
function effortToOptions(
  effort: string,
  model: KnownModel | undefined,
  xhighSupported: boolean
): { effort?: string; thinking?: { type: 'disabled' } } {
  if (effort === 'minimal') {
    // fable이면 {} (thinking key 없음), 그 외 thinking:disabled
    if (model === 'fable') {
      return {}
    }
    return { thinking: { type: 'disabled' } }
  }

  // 그 외 유효 SDK effort 값
  const clampedEffort = effort === 'xhigh' && !xhighSupported ? 'high' : effort
  return { effort: clampedEffort }
}

// ── buildQueryOptions ─────────────────────────────────────────────────────────

/**
 * SDK query() 옵션 부분 객체.
 * model / permissionMode / effort / thinking 필드만 포함.
 * 나머지(cwd, abortController, canUseTool, systemPrompt 등)는 ClaudeCodeBackend가 주입.
 */
export interface QueryOptionsPatch {
  model?: string
  permissionMode?: string
  effort?: string
  thinking?: { type: 'disabled' }
}

/**
 * model/effort/mode picker id를 SDK query() 옵션 패치 객체로 변환한다.
 *
 * 신뢰경계(allowlist): untrusted renderer 문자열을 알려진 SDK 값으로만 변환.
 * 알 수 없는 id는 해당 필드를 결과에서 생략한다.
 *
 * CLI 플래그 리터럴(--model, --effort 등) 없음.
 *
 * @param opts model/effort/mode picker id (모두 optional, untrusted)
 * @returns SDK 옵션 패치 객체 (알려진 필드만)
 */
export function buildQueryOptions(opts: {
  model?: string
  effort?: string
  mode?: string
}): QueryOptionsPatch {
  const result: QueryOptionsPatch = {}

  // ── 1. model ────────────────────────────────────────────────────────────────
  // KNOWN_MODELS allowlist 검증. 미지/미전달 → 생략.
  const model = opts.model
  const isKnownModel = model !== undefined && (KNOWN_MODELS as readonly string[]).includes(model)
  const knownModel: KnownModel | undefined = isKnownModel ? (model as KnownModel) : undefined

  if (knownModel !== undefined) {
    result.model = knownModel
  }

  // ── 2. effort / thinking ────────────────────────────────────────────────────
  // 판정 순서:
  // a) 미전달 → 생략.
  // b) 모델이 알려진 경우 MODEL_EFFORT_SUPPORT 체크:
  //      supports:false(haiku) → effort/thinking 둘 다 생략.
  // c) effort 값이 'minimal' 또는 유효 SDK effort 집합 밖 → 미지 effort 생략.
  //    ('minimal'은 effortToOptions가 처리)
  // d) effortToOptions로 옵션 객체 생성하여 spread.
  // e) model 미전달/미지 → "전체 지원"가정 (xhigh 클램프 없음).

  const effort = opts.effort

  if (effort !== undefined) {
    // 모델이 알려진 경우 support 체크
    if (knownModel !== undefined) {
      const support = MODEL_EFFORT_SUPPORT[knownModel]
      if (!support.supports) {
        // haiku 등: effort 미지원 → 생략
      } else {
        // effort 값이 유효한지 확인 ('minimal' 포함)
        if (effort === 'minimal' || VALID_SDK_EFFORTS.has(effort)) {
          const xhighOk = support.xhigh !== false
          const effortOpts = effortToOptions(effort, knownModel, xhighOk)
          if (effortOpts.effort !== undefined) result.effort = effortOpts.effort
          if (effortOpts.thinking !== undefined) result.thinking = effortOpts.thinking
        }
        // 미지 effort → 생략
      }
    } else {
      // model 미전달/미지 → "전체 지원" 가정
      if (effort === 'minimal' || VALID_SDK_EFFORTS.has(effort)) {
        const effortOpts = effortToOptions(effort, undefined, true)
        if (effortOpts.effort !== undefined) result.effort = effortOpts.effort
        if (effortOpts.thinking !== undefined) result.thinking = effortOpts.thinking
      }
      // 미지 effort → 생략
    }
  }

  // ── 3. mode (permissionMode) ────────────────────────────────────────────────
  // MODE_TO_PERMISSION allowlist 검증. 맵에 없으면 생략.
  const mode = opts.mode
  if (mode !== undefined) {
    const mapped = MODE_TO_PERMISSION[mode]
    if (mapped !== undefined) {
      result.permissionMode = mapped
    }
  }

  return result
}
