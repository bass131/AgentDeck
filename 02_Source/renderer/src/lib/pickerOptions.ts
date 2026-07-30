/**
 * pickerOptions.ts — 컴포저 피커 옵션 (모델·effort·모드)
 *
 * 새 IPC 0. window.api 호출 0. 순수 상수 + 순수 함수.
 * 인라인 색상 0 — 색은 CSS 변수 토큰(var(--gold) 등).
 */
import { PICKER_MODELS, type PickerModel } from '../../../shared/knownModels'
import {
  MODEL_EFFORT_LEVELS,
  EFFORT_LEVELS,
  clampEffort,
  supportsEffort,
  type EffortLevel,
  type EffortLevelTable
} from '../../../shared/modelEffort'

// ── 타입 ──────────────────────────────────────────────────────────────────────

export interface ModelOption {
  id: PickerModel
  label: string
  desc: string
  /** CSS 변수 토큰 색 (예: 'var(--gold)') */
  color: string
}

export interface EffortOption {
  /** SDK effort 레벨 또는 앱 내부 id 'minimal'. */
  id: EffortLevel | 'minimal'
  label: string
  desc: string
}

export interface ModeOption {
  id: string
  label: string
  desc: string
  /** CSS 변수 토큰 색 */
  color: string
  /** MODE_ICONS 키 */
  icon: 'shield' | 'plan' | 'check' | 'bolt' | 'warn'
  warn?: boolean
}

// ── MODELS ────────────────────────────────────────────────────────────────────

/**
 * 라벨은 항상 "패밀리명 + 버전"으로 쓴다(영호 요구) — SDK `displayName`은 버전을 뺀
 * "Opus"/"Sonnet"만 주므로 그대로 쓰지 않는다. 세대가 선택의 핵심인데 라벨에서 빠지면
 * 사용자가 무엇을 고르는지 알 수 없다(별칭을 버린 이유와 같다).
 *
 * 컨텍스트 윈도우는 여기 담지 않는다. 이전 구현은 `ctx` 표시용 숫자를 들고 있었지만
 * 읽는 곳이 하나도 없었고(값도 전 모델 1M으로 굳어 200K인 Haiku와 어긋나 있었다),
 * 실제 게이지는 `MODEL_CONTEXT_WINDOW`를 직접 쓴다. 아무도 읽지 않는 사본은 어긋난 채로
 * 남아 다음 사람에게 어느 쪽이 진짜인지 되묻게 만든다.
 *
 * 순서: Opus 5(기본) → Sonnet 5 → Haiku 4.5 → Fable 5. 앞 셋은 비용·속도 사다리이고
 * Fable 5는 끝에 둔 특수 탈출구다. 능력 내림차순이면 Fable이 맨 앞이어야 하지만, 코딩 IDE에서
 * 모델을 바꾸는 이유는 "Opus로 부족해서"보다 "Opus가 과해서"가 훨씬 흔하다 — 흔한 이동 방향을
 * 인접하게 놓는다.
 */
export const MODELS: ModelOption[] = [
  {
    id: 'claude-opus-5',
    label: 'Opus 5',
    desc: '코딩·에이전트 최상위 · 복잡한 작업',
    color: 'var(--violet)'
  },
  {
    id: 'claude-sonnet-5',
    label: 'Sonnet 5',
    desc: '균형 · 일상 작업',
    color: 'var(--blue)'
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Haiku 4.5',
    desc: '빠른 응답 · 가벼운 질문',
    color: 'var(--teal)'
  },
  {
    id: 'claude-fable-5',
    label: 'Fable 5',
    desc: '가장 어렵고 오래 걸리는 작업',
    color: 'var(--gold)'
  }
]

// 표시 순서가 어휘 순서와 어긋나면 신규 모델이 목록에서 조용히 빠진다.
if (MODELS.length !== PICKER_MODELS.length) {
  throw new Error(
    `MODELS(${MODELS.length})와 PICKER_MODELS(${PICKER_MODELS.length}) 길이 불일치`
  )
}

// ── EFFORTS ───────────────────────────────────────────────────────────────────

/**
 * 'minimal'은 SDK effort 레벨이 아니라 앱 내부 id다 — 전송 시점에 effort 키가 아니라
 * `thinking: {type:'disabled'}`로 번역된다(`runArgs.ts`). 그래서 `EFFORT_LEVELS`에 없고
 * 모델별 지원 필터에도 걸리지 않는다.
 */
export const EFFORTS: EffortOption[] = [
  { id: 'max', label: '최대', desc: '최대 강도 · 가장 느림' },
  { id: 'xhigh', label: '매우 높음', desc: '더 깊은 추론' },
  { id: 'high', label: '높음', desc: '깊은 추론' },
  { id: 'medium', label: '보통', desc: '보통 추론' },
  { id: 'low', label: '낮음', desc: '가벼운 추론' },
  { id: 'minimal', label: '최소', desc: '확장사고 끔' }
]

// ── MODES ─────────────────────────────────────────────────────────────────────

export const MODES: ModeOption[] = [
  { id: 'normal', label: '일반', desc: '변경마다 승인 요청', color: 'var(--text-3)', icon: 'shield' },
  { id: 'plan', label: '플랜', desc: '계획만 수립, 실행은 승인 후', color: 'var(--blue)', icon: 'plan' },
  { id: 'acceptEdits', label: '모두 허용', desc: '파일 편집 자동 수락', color: 'var(--yellow)', icon: 'check' },
  { id: 'auto', label: '자동', desc: '도구 실행까지 자동 진행', color: 'var(--violet)', icon: 'bolt' },
  { id: 'bypass', label: 'Bypass', desc: '모든 권한 확인 건너뛰기', color: 'var(--red)', icon: 'warn', warn: true }
]

// ── 기본값 ────────────────────────────────────────────────────────────────────

export const DEFAULT_MODEL: PickerModel = 'claude-opus-5'

/**
 * ⚠️ 트레이드오프: Claude 플랫폼의 effort 가이드는 코딩·에이전트 작업을 `xhigh`로 시작해
 * 아래로 스윕하고, `max`는 지연에 둔감한 가장 어려운 케이스에만 쓰라고 권한다. `max`를
 * 전역 기본으로 두면 사소한 질문도 최대 강도로 돌아 느리고 비싸다.
 * 이 브랜치는 "Opus 5를 MAX로 세팅"이라는 요구를 그대로 반영해 `max`를 기본으로 둔다 —
 * 일상 사용을 우선하려면 이 한 줄을 'xhigh'로 바꾸면 된다.
 */
export const DEFAULT_EFFORT: EffortLevel | 'minimal' = 'max'

export const DEFAULT_MODE_SINGLE = 'auto'
export const DEFAULT_MODE_MULTI = 'bypass'

// ── effort 피커 유효 상태 ─────────────────────────────────────────────────────

export interface EffortPickerState {
  /** 이 모델이 받는 레벨만 남긴 부분집합('minimal'은 항상 포함). */
  options: EffortOption[]
  /** effort 미지원 모델(예: Haiku 4.5) → true. 항목은 숨기지 않는다(발견성·레이아웃 불변). */
  disabled: boolean
  /** 표시 클램프. 저장값은 건드리지 않는다. */
  displayValue: string
}

/**
 * 선택 모델·effort로부터 effort 피커의 유효 상태를 계산한다(순수 함수).
 *
 * `selectedEffort`(저장값)는 변형하지 않는다 — 클램프는 표시 계층에서만 일어난다.
 * 모델을 되돌리면 저장된 원래 effort가 그대로 복원된다(저장값을 클램프값으로 덮어쓰면
 * 복원이 불가해진다).
 *
 * `table` 인자는 테스트가 합성 지원 목록을 주입해 필터·클램프 경로를 강제 발화시킬 수
 * 있게 열어둔 것이다 — 현행 표에는 부분 지원 모델이 없어서(전 모델 5레벨 또는 0레벨)
 * 실모델만으로는 공허한 green이 된다.
 */
export function effortPickerFor(
  modelId: string,
  selectedEffort: string,
  table: EffortLevelTable = MODEL_EFFORT_LEVELS
): EffortPickerState {
  const allowed = table[modelId]

  // 미지 모델: 표에 없으면 방어적으로 전체 활성 취급한다. 최종 클램프의 신뢰 근거는
  // main 전송 시점(`runArgs.buildQueryOptions`)이고 이 게이트는 표시용 소음 절감이다.
  if (allowed === undefined) {
    return { options: EFFORTS, disabled: false, displayValue: selectedEffort }
  }

  if (allowed.length === 0) {
    return { options: EFFORTS, disabled: true, displayValue: selectedEffort }
  }

  const options = EFFORTS.filter((o) => o.id === 'minimal' || allowed.includes(o.id))
  const clamped =
    selectedEffort === 'minimal' || !(EFFORT_LEVELS as readonly string[]).includes(selectedEffort)
      ? selectedEffort
      : clampEffort(modelId, selectedEffort as EffortLevel, table) ?? selectedEffort

  return { options, disabled: false, displayValue: clamped }
}

/** 이 모델이 effort 키를 받는가 — 피커 외 소비처(배지·요약)용 재수출. */
export { supportsEffort }
