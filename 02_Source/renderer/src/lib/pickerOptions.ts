import { PICKER_MODELS, type PickerModel } from '../../../shared/knownModels'
import {
  MODEL_EFFORT_LEVELS,
  EFFORT_LEVELS,
  clampEffort,
  supportsEffort,
  type EffortLevel,
  type EffortLevelTable
} from '../../../shared/modelEffort'

export interface ModelOption {
  id: PickerModel
  label: string
  desc: string
  color: string
}

export interface EffortOption {
  id: EffortLevel | 'minimal'
  label: string
  desc: string
}

export interface ModeOption {
  id: string
  label: string
  desc: string
  color: string
  icon: 'shield' | 'plan' | 'check' | 'bolt' | 'warn'
  warn?: boolean
}

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

if (MODELS.length !== PICKER_MODELS.length) {
  throw new Error(
    `MODELS(${MODELS.length})와 PICKER_MODELS(${PICKER_MODELS.length}) 길이 불일치`
  )
}

export const EFFORTS: EffortOption[] = [
  { id: 'max', label: '최대', desc: '최대 강도 · 가장 느림' },
  { id: 'xhigh', label: '매우 높음', desc: '더 깊은 추론' },
  { id: 'high', label: '높음', desc: '깊은 추론' },
  { id: 'medium', label: '보통', desc: '보통 추론' },
  { id: 'low', label: '낮음', desc: '가벼운 추론' },
  { id: 'minimal', label: '최소', desc: '확장사고 끔' }
]

export const MODES: ModeOption[] = [
  { id: 'normal', label: '일반', desc: '변경마다 승인 요청', color: 'var(--text-3)', icon: 'shield' },
  { id: 'plan', label: '플랜', desc: '계획만 수립, 실행은 승인 후', color: 'var(--blue)', icon: 'plan' },
  { id: 'acceptEdits', label: '모두 허용', desc: '파일 편집 자동 수락', color: 'var(--yellow)', icon: 'check' },
  { id: 'auto', label: '자동', desc: '도구 실행까지 자동 진행', color: 'var(--violet)', icon: 'bolt' },
  { id: 'bypass', label: 'Bypass', desc: '모든 권한 확인 건너뛰기', color: 'var(--red)', icon: 'warn', warn: true }
]

export const DEFAULT_MODEL: PickerModel = 'claude-opus-5'

export const DEFAULT_EFFORT: EffortLevel | 'minimal' = 'max'

export const DEFAULT_MODE_SINGLE = 'auto'
export const DEFAULT_MODE_MULTI = 'bypass'

export interface EffortPickerState {
  options: EffortOption[]
  disabled: boolean
  displayValue: string
}

export function effortPickerFor(
  modelId: string,
  selectedEffort: string,
  table: EffortLevelTable = MODEL_EFFORT_LEVELS
): EffortPickerState {
  const allowed = table[modelId]

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

export { supportsEffort }
