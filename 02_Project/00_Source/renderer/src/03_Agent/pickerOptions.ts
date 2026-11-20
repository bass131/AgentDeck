import { FALLBACK_MODELS, DEFAULT_MODEL_ID } from '@shared/03_Agent/models/knownModels'
import {
  canonicalModelId,
  effortLevelsFor,
  findModelRow,
  pickerModelRows,
  type ModelRow
} from '@shared/03_Agent/models/modelList'
import {
  DEFAULT_EFFORT_LEVEL,
  clampEffort,
  readEffortLevel,
  type EffortLevel
} from '@shared/03_Agent/models/modelEffort'
import { modelFamilyColor, modelLabel } from './modelLabel'

export interface ModelOption {
  id: string
  label: string
  desc: string
  color: string
}

export interface EffortOption {
  id: EffortLevel
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

const NEUTRAL_MODEL_COLOR = 'var(--text-3)'

// 모델 선택기 옵션 (M06 G4) — main이 준 SDK 목록에서 그린다. 옵션 id는 정식 ID라 고르면 그 값이 저장된다.
// 지금 값이 목록 어느 행과도 맞지 않으면(목록에서 빠진 옛 모델) 그 값 자체를 한 줄 더해 첫 행으로 둔갑하지 않게 한다.
export function modelOptionsFor(rows: readonly ModelRow[], currentValue?: string): ModelOption[] {
  const options: ModelOption[] = pickerModelRows(rows).map((row) => {
    const id = canonicalModelId(row)
    return { id, label: row.displayName, desc: row.description, color: modelFamilyColor(id) ?? NEUTRAL_MODEL_COLOR }
  })
  if (currentValue && findModelRow(rows, currentValue) === undefined) {
    options.push({
      id: currentValue,
      label: modelLabel(currentValue) ?? currentValue,
      desc: '저장된 모델 · 지금 목록에 없음',
      color: modelFamilyColor(currentValue) ?? NEUTRAL_MODEL_COLOR
    })
  }
  return options
}

// 저장값(정식·별칭·옛 짧은 ID)을 선택기 옵션 id로 맞춘다. 저장값은 바꾸지 않는다.
export function pickerModelValue(rows: readonly ModelRow[], value: string): string {
  const row = findModelRow(rows, value)
  return row ? canonicalModelId(row) : value
}

export const EFFORTS: EffortOption[] = [
  { id: 'max', label: '최대', desc: '최대 강도 · 가장 느림' },
  { id: 'xhigh', label: '매우 높음', desc: '더 깊은 추론' },
  { id: 'high', label: '높음', desc: '깊은 추론' },
  { id: 'medium', label: '보통', desc: '보통 추론' },
  { id: 'low', label: '낮음', desc: '가벼운 추론' }
]

export const MODES: ModeOption[] = [
  { id: 'normal', label: '일반', desc: '변경마다 승인 요청', color: 'var(--text-3)', icon: 'shield' },
  { id: 'plan', label: '플랜', desc: '계획만 수립, 실행은 승인 후', color: 'var(--blue)', icon: 'plan' },
  { id: 'acceptEdits', label: '모두 허용', desc: '파일 편집 자동 수락', color: 'var(--yellow)', icon: 'check' },
  { id: 'auto', label: '자동', desc: '도구 실행까지 자동 진행', color: 'var(--violet)', icon: 'bolt' },
  { id: 'bypass', label: 'Bypass', desc: '모든 권한 확인 건너뛰기', color: 'var(--red)', icon: 'warn', warn: true }
]

export const DEFAULT_MODEL: string = DEFAULT_MODEL_ID

export const DEFAULT_EFFORT: EffortLevel = DEFAULT_EFFORT_LEVEL

// 대화 기본 실행 모드(P4).
export const DEFAULT_MODE_CONVERSATION = 'auto'

// 저장된 대화의 모드 — 선택기에 없는 값이면 대화 기본값(M06 Backlog 1)
export function conversationModeOf(saved: string | undefined): string {
  return MODES.some((m) => m.id === saved) ? (saved as string) : DEFAULT_MODE_CONVERSATION
}

interface EffortPickerState {
  options: EffortOption[]
  disabled: boolean
  displayValue: string
}

// effort 메뉴 — 목록 행의 supportedEffortLevels로 그린다. 저장값은 readEffortLevel로 읽는다(옛 「최소」는 low).
// main의 실행 인자 검사도 같은 규칙이라 보이는 값과 보내는 값이 같다 — 목록에 없는 모델은 main이 effort를 싣지 않으니 메뉴도 끈다(M06 Backlog 16).
export function effortPickerFor(
  modelId: string,
  selectedEffort: string,
  rows: readonly ModelRow[] = FALLBACK_MODELS
): EffortPickerState {
  const selected: EffortLevel = readEffortLevel(selectedEffort)
  const allowed = effortLevelsFor(rows, modelId)

  if (allowed === undefined || allowed.length === 0) {
    return { options: EFFORTS, disabled: true, displayValue: selected }
  }

  const options = EFFORTS.filter((o) => allowed.includes(o.id))
  return { options, disabled: false, displayValue: clampEffort(allowed, selected) ?? selected }
}
