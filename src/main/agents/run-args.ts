/**
 * run-args.ts — claude CLI 추가 인자 빌더 (순수 모듈)
 *
 * CRITICAL(신뢰경계): 이 함수가 allowlist다.
 * renderer가 보내는 model/effort/mode(untrusted)를 알려진 CLI 플래그로만 변환한다.
 * 알 수 없는 id는 전부 무시 — renderer 임의 문자열이 spawn 인자에 들어가지 않음.
 *
 * electron import 0 — vitest 직접 실행 가능.
 *
 * 설계 결정 (Phase 20b, ADR-003):
 * - buildRunArgs는 기존 base args(['-p', prompt, '--output-format', 'stream-json', '--verbose'])
 *   뒤에 append할 추가 플래그만 반환한다. base args 포함 X.
 * - 반환값은 항상 짝수 길이(플래그+값 쌍)거나 빈 배열.
 * - 순서 고정: model → effort → permission-mode.
 */

// ── Allowlist 상수 ───────────────────────────────────────────────────────────

/**
 * 허용된 모델 picker id (CLI alias — full 모델 ID 아님).
 * KNOWN_MODELS와 MODEL_CONTEXT_WINDOW(shared) 키 집합이 동일해야 한다(드리프트 금지).
 * 권위 확인(claude-code-guide, 2026-06-23): opus=Opus4.8, sonnet=Sonnet4.6,
 * haiku=Haiku4.5, fable=Fable5.
 */
export const KNOWN_MODELS = ['opus', 'sonnet', 'haiku', 'fable'] as const
export type KnownModel = (typeof KNOWN_MODELS)[number]

/**
 * 유효한 CLI effort 값 (claude -p --effort).
 * 'minimal'은 여기 없음 — picker에만 있는 우리 앱 내부 id, CLI에 없어서 생략.
 */
const VALID_CLI_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])

/**
 * mode picker id → --permission-mode CLI 값 맵.
 * 맵에 없는 id는 무시(allowlist).
 */
const MODE_MAP: Record<string, string> = {
  normal: 'default',
  plan: 'plan',
  acceptEdits: 'acceptEdits',
  auto: 'auto',
  bypass: 'bypassPermissions'
}

/**
 * 모델별 effort 지원 표.
 *
 * supports: false → effort 플래그 전혀 생략.
 * xhigh: false → xhigh 입력 시 'high'로 클램프(한 단계 낮춤).
 *
 * 권위 확인(claude-code-guide, 2026-06-23):
 * - Opus 4.8: effort 지원, xhigh/max 모두 지원.
 * - Fable 5: effort 지원, xhigh/max 모두 지원.
 * - Sonnet 4.6: effort 지원, xhigh 미지원(→high 클램프), max 지원.
 * - Haiku 4.5: effort 미지원(플래그 생략).
 */
export const MODEL_EFFORT_SUPPORT: Record<KnownModel, { supports: boolean; xhigh?: boolean }> = {
  opus: { supports: true, xhigh: true },
  fable: { supports: true, xhigh: true },
  sonnet: { supports: true, xhigh: false },
  haiku: { supports: false }
}

// ── buildRunArgs ──────────────────────────────────────────────────────────────

/**
 * model/effort/mode picker id를 claude CLI 추가 플래그로 변환한다.
 *
 * 반환값: 기존 base args 뒤에 append할 추가 플래그만.
 * 예: ['--model','opus','--effort','xhigh','--permission-mode','auto']
 * 또는 [] (전부 미전달/미지).
 *
 * 순서 고정: model → effort → permission-mode.
 *
 * @param opts - model/effort/mode picker id (모두 optional, untrusted)
 * @returns claude CLI 추가 플래그 배열 (항상 짝수 길이 또는 빈 배열)
 */
export function buildRunArgs(opts: {
  model?: string
  effort?: string
  mode?: string
}): string[] {
  const result: string[] = []

  // ── 1. model ────────────────────────────────────────────────────────────────
  // KNOWN_MODELS allowlist 검증. 미지/미전달 → 생략.
  const model = opts.model
  const isKnownModel = model !== undefined && (KNOWN_MODELS as readonly string[]).includes(model)

  if (isKnownModel && model !== undefined) {
    result.push('--model', model)
  }

  // ── 2. effort ───────────────────────────────────────────────────────────────
  // 판정 순서:
  // a) 미전달 → 생략.
  // b) 'minimal' → 생략 (CLI에 없는 값).
  // c) 유효 CLI effort 값이 아님({low,medium,high,xhigh,max} 외) → 생략.
  // d) 모델이 effort 미지원(haiku) → 생략.
  // e) effort==='xhigh'이고 모델이 xhigh 미지원(sonnet) → 'high'로 클램프.
  // f) model 미전달/미지 → "전체 지원" 가정 (유효 CLI 값이면 그대로, minimal만 생략).
  // g) 그 외 → effort 그대로.

  const effort = opts.effort

  if (effort !== undefined && effort !== 'minimal' && VALID_CLI_EFFORTS.has(effort)) {
    // 모델이 알려진 경우 모델별 support 표 조회
    if (isKnownModel && model !== undefined) {
      const support = MODEL_EFFORT_SUPPORT[model as KnownModel]
      if (support.supports) {
        // effort 지원 모델
        if (effort === 'xhigh' && support.xhigh === false) {
          // xhigh 미지원 → high로 클램프
          result.push('--effort', 'high')
        } else {
          result.push('--effort', effort)
        }
      }
      // support.supports === false(haiku) → effort 생략 (push 없음)
    } else {
      // model 미전달/미지 → "전체 지원" 가정, 유효 CLI 값 그대로
      result.push('--effort', effort)
    }
  }

  // ── 3. mode (permission-mode) ───────────────────────────────────────────────
  // MODE_MAP allowlist 검증. 맵에 없으면 생략.
  const mode = opts.mode
  if (mode !== undefined) {
    const mapped = MODE_MAP[mode]
    if (mapped !== undefined) {
      result.push('--permission-mode', mapped)
    }
  }

  return result
}
