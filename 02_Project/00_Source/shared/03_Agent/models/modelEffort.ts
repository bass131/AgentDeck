export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export const EFFORT_LEVELS: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']

// 선택기의 기본 단계이자, 저장값이 단계가 아닐 때(옛 「최소」 등) 보내는 단계다.
export const DEFAULT_EFFORT_LEVEL: EffortLevel = 'max'

export function isEffortLevel(value: unknown): value is EffortLevel {
  return typeof value === 'string' && (EFFORT_LEVELS as readonly string[]).includes(value)
}

// 저장값을 단계로 읽는다 — 선택기 표시와 main 전송이 같이 쓴다.
// 옛 「최소」(사고 끄기)는 가장 싼 설정이었으므로 남은 단계 중 가장 가까운 low로 읽는다(G4 검수 1-2). 그 밖의 비단계 값은 기본 단계.
export function readEffortLevel(value: unknown): EffortLevel {
  if (isEffortLevel(value)) return value
  if (value === 'minimal') return 'low'
  return DEFAULT_EFFORT_LEVEL
}

// 모델이 받는 단계 목록(SDK supportedEffortLevels) 안으로 요청을 아래쪽으로만 내린다.
export function clampEffort(
  allowed: readonly EffortLevel[] | undefined,
  requested: EffortLevel
): EffortLevel | undefined {
  if (allowed === undefined || allowed.length === 0) return undefined
  if (allowed.includes(requested)) return requested
  for (let i = EFFORT_LEVELS.indexOf(requested) - 1; i >= 0; i--) {
    const candidate = EFFORT_LEVELS[i]
    if (allowed.includes(candidate)) return candidate
  }
  return undefined
}
