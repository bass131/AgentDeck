/**
 * pickerOptions.ts — 공유 피커 옵션 상수 (Phase 18).
 *
 * 원본 AgentCodeGUI Chat.tsx L73~94 기준으로 이식.
 * 모델명은 우리 정식 값(Fable 5 / Opus 4.8 / Sonnet 5 / Haiku 4.5).
 * Sonnet 라벨 갱신: SDK 0.3.201 bump로 별칭 sonnet=claude-sonnet-5 실측 확인
 * (2026-07-04, agent-backend 재실측 2회) — id/ctx/color는 그대로, label만 갱신.
 * Composer.tsx + MultiWorkspace.tsx 양쪽이 이 모듈에서 import해 드리프트 차단.
 *
 * 새 IPC 0. window.api 호출 0. 순수 상수 모듈.
 * 인라인 색상 0 — 색은 CSS 변수 토큰(var(--gold) 등).
 *
 * LM1 P07(영호 확정 2026-07-17): `effortPickerFor` 추가 — shared 지원 표
 * (`shared/model-effort.ts`, P06)를 소비해 모델별 effort 피커 유효 상태(옵션·비활성·
 * 표시 클램프)를 계산하는 순수 함수. 게이트는 표시용(소음 절감)이며, 전송 시점 최종
 * 클램프의 신뢰 근거는 main(`effortToOptions`) — CORE-01 관례.
 */
import { MODEL_EFFORT_SUPPORT, type EffortSupport } from '../../../shared/model-effort'

// ── PickOption 타입 ───────────────────────────────────────────────────────────

export interface ModelOption {
  id: string
  label: string
  desc: string
  ctx: number
  /** CSS 변수 토큰 색 (예: 'var(--gold)') */
  color: string
}

export interface EffortOption {
  id: string
  label: string
  desc: string
  level: number
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

// ── MODELS (원본 Chat.tsx L73~78, 모델명 = 우리 정식 값) ─────────────────────

export const MODELS: ModelOption[] = [
  { id: 'fable',  label: 'Fable 5',    desc: '최상위 지능 · 가장 어려운 작업', ctx: 1000, color: 'var(--gold)' },
  { id: 'opus',   label: 'Opus 4.8',   desc: '고성능 · 복잡한 작업',           ctx: 1000, color: 'var(--violet)' },
  { id: 'sonnet', label: 'Sonnet 5',   desc: '균형 · 일상 작업',               ctx: 1000, color: 'var(--blue)' },
  { id: 'haiku',  label: 'Haiku 4.5',  desc: '빠른 응답 · 가벼운 작업',        ctx: 1000, color: 'var(--teal)' },
]

// ── EFFORTS (원본 Chat.tsx L79~86, 1:1 이식) ─────────────────────────────────

export const EFFORTS: EffortOption[] = [
  { id: 'max',     label: '최대',     desc: '최대 강도',    level: 5 },
  { id: 'xhigh',   label: '매우 높음', desc: '더 깊은 추론', level: 4 },
  { id: 'high',    label: '높음',     desc: '깊은 추론',    level: 3 },
  { id: 'medium',  label: '보통',     desc: '보통 추론',    level: 2 },
  { id: 'low',     label: '낮음',     desc: '가벼운 추론',  level: 1 },
  { id: 'minimal', label: '최소',     desc: '확장사고 끔',  level: 0 },
]

// ── MODES (원본 Chat.tsx L88~94 기준, Bypass 포함) ────────────────────────────

export const MODES: ModeOption[] = [
  { id: 'normal',      label: '일반',      desc: '변경마다 승인 요청',      color: 'var(--text-3)', icon: 'shield' },
  { id: 'plan',        label: '플랜',      desc: '계획만 수립, 실행은 승인 후', color: 'var(--blue)',   icon: 'plan' },
  { id: 'acceptEdits', label: '모두 허용', desc: '파일 편집 자동 수락',     color: 'var(--yellow)', icon: 'check' },
  { id: 'auto',        label: '자동',      desc: '도구 실행까지 자동 진행', color: 'var(--violet)', icon: 'bolt' },
  { id: 'bypass',      label: 'Bypass',    desc: '모든 권한 확인 건너뛰기', color: 'var(--red)',    icon: 'warn', warn: true },
]

// ── 기본값 상수 ──────────────────────────────────────────────────────────────
// 단일(Composer): opus / xhigh / auto
// 멀티(MultiWorkspace): opus / xhigh / bypass (DEFAULT_PICKER는 multiAgentSampleData.ts 유지)

export const DEFAULT_MODEL = 'opus'
export const DEFAULT_EFFORT = 'xhigh'
export const DEFAULT_MODE_SINGLE = 'auto'
export const DEFAULT_MODE_MULTI = 'bypass'

// ── effortPickerFor (LM1 P07) ──────────────────────────────────────────────

export interface EffortPickerState {
  /** xhigh 미지원(∧ supports) 모델이면 id==='xhigh' 제외 부분집합, 그 외 EFFORTS 원형. */
  options: EffortOption[]
  /** supports:false(예: haiku) → true. 항목은 숨기지 않는다(영호 확정 ② — 발견성·레이아웃 불변). */
  disabled: boolean
  /** 표시 클램프: xhigh 미지원 ∧ selected==='xhigh' → 'high', 그 외 selectedEffort 원형. */
  displayValue: string
}

/**
 * 선택 모델·effort로부터 effort 피커의 유효 상태를 계산한다(순수 함수).
 *
 * `selectedEffort`(저장값)는 절대 변형하지 않는다 — 클램프는 표시 계층에서만 일어난다.
 * 모델을 xhigh 지원 모델로 되돌리면 저장된 원래 effort가 그대로 복원된다(⚠️ 함정: 저장값을
 * 클램프값으로 덮어쓰면 복원이 불가해진다).
 *
 * `table` 인자는 기본값이 shared `MODEL_EFFORT_SUPPORT`이며, 테스트가 합성 지원 레코드
 * (`{ supports: true, xhigh: false }`)를 주입해 xhigh 필터·클램프 경로를 강제 발화시킬 수
 * 있게 한다(영호 확정 ③ — 현행 표엔 이 조합이 0개라 실모델만으로는 공허한 green이 된다).
 *
 * `minimal`은 앱 내부 id(SDK effort 아님, `effortToOptions` special-case)라 어떤 경우에도
 * 제외 대상이 아니다 — 이 함수는 `xhigh` id만 필터한다.
 */
export function effortPickerFor(
  modelId: string,
  selectedEffort: string,
  table: Record<string, EffortSupport> = MODEL_EFFORT_SUPPORT,
): EffortPickerState {
  const support = table[modelId]

  // supports:false(haiku) 또는 미지 모델(표에 없음) → 옵션·표시는 원형 유지.
  // 미지 모델은 방어적 기본으로 활성 취급(신뢰 근거는 main 전송 시점 클램프).
  if (!support || support.supports === false) {
    return {
      options: EFFORTS,
      disabled: support?.supports === false,
      displayValue: selectedEffort,
    }
  }

  // xhigh 미지원(supports:true ∧ xhigh:false) → 항목 제외 + 표시 클램프.
  if (support.xhigh === false) {
    return {
      options: EFFORTS.filter((o) => o.id !== 'xhigh'),
      disabled: false,
      displayValue: selectedEffort === 'xhigh' ? 'high' : selectedEffort,
    }
  }

  // supports:true ∧ xhigh:true(현행 opus·fable·sonnet) → 전부 원형·활성.
  return { options: EFFORTS, disabled: false, displayValue: selectedEffort }
}
