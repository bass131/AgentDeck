/**
 * knownModels.ts — 모델 어휘 (shared 도메인 상수)
 *
 * CRITICAL: Node 전용 API 금지(fs·process·path 등) — renderer 번들에도 로드된다.
 *
 * ## 왜 full 모델 ID인가
 *
 * 짧은 별칭('opus' 등)은 "현재 그 계열의 기본 모델"을 가리키는 **이동 표적**이다.
 * SDK@0.3.201 실측(2026-07-30): 'opus' → claude-opus-4-8, 'sonnet' → claude-sonnet-5,
 * 'haiku' → claude-haiku-4-5-20251001, 'fable' → claude-fable-5.
 * 같은 문자열이 SDK 버전에 따라 다른 세대로 해석된다('sonnet'은 SDK@0.3.186에서
 * claude-sonnet-4-6이었다). 별칭을 저장하면 사용자가 모르는 사이 모델이 바뀐다.
 *
 * 그래서 이 어휘는 full ID를 쓴다. 별칭은 `LEGACY_ALIASES`로만 받아들인다 —
 * 이전 버전이 저장한 picker 값을 복원할 때 한정.
 *
 * ## picker 어휘 ≠ allowlist
 *
 * `PICKER_MODELS`(사용자에게 보여줄 목록)와 `KNOWN_MODELS`(수용 가능한 값 전체)를
 * 분리한다. 겸용하면 "새 모델을 picker에 넣으려면 신뢰경계를 건드려야 하고, 낡은
 * 별칭을 목록에서 빼면 저장된 세션이 깨진다"는 교착이 생긴다.
 * claude-opus-4-8은 그 결과로 KNOWN_MODELS에만 있다 — 레거시 'opus'가 해석되는
 * 대상이라 살아있어야 하지만, 신규 선택지로 권할 이유는 없다.
 */

/**
 * picker에 노출하는 모델. 순서 = 표시 순서.
 *
 * SDK가 `supportedModels()`로 주는 목록은 큐레이션된 부분집합이라 claude-opus-5가
 * 없다(2026-07-30 실측: default/opus[1m]/claude-fable-5[1m]/sonnet/haiku 5행).
 * 그러나 full ID를 options.model에 직접 넘기면 그 밖의 모델도 수용된다
 * (같은 실측: model='claude-opus-5' → 응답 message.model='claude-opus-5', effort='max' 동반 통과).
 * 즉 picker 목록의 상한은 SDK가 아니라 이 상수다.
 */
export const PICKER_MODELS = [
  'claude-opus-5',
  'claude-fable-5',
  'claude-sonnet-5',
  'claude-haiku-4-5'
] as const

/**
 * 수용 가능한 모델 값 전체 = `PICKER_MODELS` ∪ {레거시 별칭 해석 결과}.
 * 모델 키 테이블(`MODEL_EFFORT_SUPPORT` · `MODEL_CONTEXT_WINDOW`)의 키 집합과 동일해야
 * 한다 — `KnownModel` 타입으로 컴파일러가 강제한다.
 */
export const KNOWN_MODELS = [
  ...PICKER_MODELS,
  'claude-opus-4-8'
] as const

/** `KNOWN_MODELS`의 리터럴 유니온 — 모델 키 테이블의 키 타입(드리프트를 컴파일러가 잡는다). */
export type KnownModel = (typeof KNOWN_MODELS)[number]

/** `PICKER_MODELS`의 리터럴 유니온. `KnownModel`의 부분집합이다. */
export type PickerModel = (typeof PICKER_MODELS)[number]

/**
 * 레거시 짧은 별칭 → full ID.
 *
 * 각 별칭이 **실측 당시 실제로 해석됐던 세대**로 매핑한다(SDK@0.3.201, 2026-07-30).
 * 'opus'를 claude-opus-5로 올려붙이지 않는 게 핵심이다 — 그러면 저장값을 복원할 때
 * 사용자가 고른 적 없는 모델로 조용히 갈아치우는 셈이고, 그게 애초에 별칭을 버린 이유다.
 */
export const LEGACY_ALIASES: Readonly<Record<string, KnownModel>> = {
  opus: 'claude-opus-4-8',
  fable: 'claude-fable-5',
  sonnet: 'claude-sonnet-5',
  haiku: 'claude-haiku-4-5'
}

/**
 * SDK가 돌려주는 wire 모델 ID에서 세대를 바꾸지 않는 접미사를 벗긴다.
 *
 * 두 형태를 실제로 관측했다(SDK@0.3.201, 2026-07-30):
 *  - 컨텍스트 셀렉터: 'claude-opus-4-8[1m]' (`supportedModels()`의 resolvedModel)
 *  - 날짜 접미사: 'claude-haiku-4-5-20251001' (응답 message.model)
 *
 * 둘 다 이 어휘의 키가 아니므로, 벗기지 않으면 모델 키 테이블 룩업이 조용히 실패한다
 * (토큰 게이지 분모가 폴백값으로 떨어지는 등 — 표시가 틀리지만 예외는 안 난다).
 */
function stripWireSuffixes(value: string): string {
  return value.replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '')
}

/**
 * 임의 문자열(untrusted — renderer가 IPC로 넘긴 값, 디스크에서 복원한 저장값,
 * SDK 이벤트의 message.model)을 `KnownModel`로 정규화한다. 알 수 없는 값은 undefined.
 *
 * 순서: full ID → 접미사 벗긴 full ID → 레거시 별칭.
 * 대소문자는 구분한다 — SDK가 넘겨받는 값도 그렇고, 관대하게 받으면 'Opus'와 'opus'가
 * 같은 것인지 아닌지가 흐려진다.
 */
export function normalizeModel(value: string | undefined): KnownModel | undefined {
  if (value === undefined) return undefined
  if ((KNOWN_MODELS as readonly string[]).includes(value)) return value as KnownModel

  const stripped = stripWireSuffixes(value)
  if ((KNOWN_MODELS as readonly string[]).includes(stripped)) return stripped as KnownModel

  return LEGACY_ALIASES[value]
}
