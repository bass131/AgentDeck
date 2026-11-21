// SDK 0.3.325(CLI 2.1.325)의 `supportedModels()` 실측 14행 (2026-11-16).
// value·resolvedModel·displayName·supportedEffortLevels는 요청이 돌려준 값 그대로다. description은 줄였다.
// 시험 고정값이라 모델 ID를 담아도 된다 — 소스의 손 목록은 최소 목록 하나뿐이다.
import type { ModelRow } from '@shared/03_Agent/models/modelList'

const ALL = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const NO_XHIGH = ['low', 'medium', 'high', 'max'] as const

function row(value: string, resolvedModel: string, displayName: string, levels: readonly string[]): unknown {
  return {
    value,
    resolvedModel,
    displayName,
    description: `${displayName} 설명`,
    ...(levels.length > 0 ? { supportsEffort: true, supportedEffortLevels: [...levels] } : {}),
  }
}

// SDK가 돌려준 모양 그대로(검증 전 원자료).
export const SDK_MODEL_ROWS_RAW: unknown[] = [
  row('default', 'claude-opus-5-5', 'Default (recommended)', ALL),
  row('opus', 'claude-opus-5-5', 'Opus 5.5', ALL),
  row('fable', 'claude-fable-5-2', 'Fable 5.2', ALL),
  row('sonnet', 'claude-sonnet-5-5', 'Sonnet 5.5', ALL),
  row('haiku', 'claude-haiku-5-5', 'Haiku 5.5', ALL),
  row('claude-fable-5-1', 'claude-fable-5-1', 'Fable 5.1', ALL),
  row('claude-haiku-4-5-20251001', 'claude-haiku-4-5-20251001', 'Haiku 4.5', []),
  row('claude-sonnet-5', 'claude-sonnet-5', 'Sonnet 5', ALL),
  row('claude-opus-5', 'claude-opus-5', 'Opus 5', ALL),
  row('claude-fable-5', 'claude-fable-5', 'Fable 5', ALL),
  row('claude-opus-4-8', 'claude-opus-4-8', 'Opus 4.8', ALL),
  row('claude-opus-4-7', 'claude-opus-4-7', 'Opus 4.7', ALL),
  row('claude-opus-4-6', 'claude-opus-4-6', 'Opus 4.6', NO_XHIGH),
  row('claude-sonnet-4-6', 'claude-sonnet-4-6', 'Sonnet 4.6', NO_XHIGH),
]

// 검증을 지난 모양 — 공급자와 선택기 시험이 바로 쓴다.
export const SDK_MODEL_ROWS: ModelRow[] = SDK_MODEL_ROWS_RAW.map((r) => {
  const o = r as { value: string; resolvedModel: string; displayName: string; description: string; supportedEffortLevels?: ModelRow['supportedEffortLevels'] }
  return {
    value: o.value,
    resolvedModel: o.resolvedModel,
    displayName: o.displayName,
    description: o.description,
    supportedEffortLevels: o.supportedEffortLevels ?? [],
  }
})
