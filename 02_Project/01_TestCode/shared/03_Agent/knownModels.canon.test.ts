// M06 G4 — 모델 어휘는 SDK `supportedModels()` 목록에서 온다. 손으로 쓴 표는 최소 목록 하나뿐이다.
import { describe, it, expect } from 'vitest'
import { FALLBACK_MODELS, DEFAULT_MODEL_ID, normalizeModel } from '@shared/03_Agent/models/knownModels'
import {
  canonicalModelId,
  findModelRow,
  pickerModelRows,
  sanitizeModelRows,
  effortLevelsFor,
} from '@shared/03_Agent/models/modelList'
import { EFFORT_LEVELS, clampEffort, isEffortLevel } from '@shared/03_Agent/models/modelEffort'
import * as agentContract from '@shared/03_Agent/agent'
import { SDK_MODEL_ROWS, SDK_MODEL_ROWS_RAW } from '../00_Helpers/sdkModelRows'

describe('최소 목록 — SDK도 캐시도 없을 때의 마지막 폴백', () => {
  it('최신 네 모델의 정식 ID다', () => {
    expect(FALLBACK_MODELS.map(canonicalModelId).sort()).toEqual(
      ['claude-fable-5-2', 'claude-haiku-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5'].sort()
    )
  })

  it('각 행이 표시 이름과 effort 단계를 갖는다', () => {
    for (const row of FALLBACK_MODELS) {
      expect(row.displayName.length, row.value).toBeGreaterThan(0)
      for (const l of row.supportedEffortLevels) expect(EFFORT_LEVELS as readonly string[]).toContain(l)
    }
  })

  it('기본 모델은 최소 목록 첫 행에서 나온다', () => {
    expect(DEFAULT_MODEL_ID).toBe(canonicalModelId(FALLBACK_MODELS[0]))
  })

  it('옛 손 표(모델별 컨텍스트 창)가 계약에서 사라졌다', () => {
    expect('MODEL_CONTEXT_WINDOW' in agentContract).toBe(false)
    expect(agentContract.DEFAULT_CONTEXT_WINDOW).toBeGreaterThan(0)
  })
})

describe('sanitizeModelRows — SDK·캐시 원자료 검증', () => {
  it('실측 14행이 모두 통과하고 Haiku 4.5는 effort 단계가 비어 있다', () => {
    const rows = sanitizeModelRows(SDK_MODEL_ROWS_RAW)
    expect(rows).toHaveLength(14)
    expect(findModelRow(rows, 'claude-haiku-4-5-20251001')?.supportedEffortLevels).toEqual([])
    expect(findModelRow(rows, 'claude-opus-4-6')?.supportedEffortLevels).toEqual(['low', 'medium', 'high', 'max'])
  })

  it('모양이 틀린 행과 모르는 effort 단계를 버린다', () => {
    const rows = sanitizeModelRows([
      null,
      { displayName: 'value 없음' },
      { value: '', displayName: '빈 value' },
      { value: 'claude-x-1', displayName: 'X 1', supportedEffortLevels: ['max', 'minimal', 7] },
    ])
    expect(rows).toEqual([
      { value: 'claude-x-1', displayName: 'X 1', description: '', supportedEffortLevels: ['max'] },
    ])
  })

  it('배열이 아니면 빈 목록이다', () => {
    expect(sanitizeModelRows({ models: [] })).toEqual([])
    expect(sanitizeModelRows(undefined)).toEqual([])
  })
})

describe('정식 ID와 옛 ID 대조', () => {
  it('별칭 행의 정식 ID는 resolvedModel이다', () => {
    const opus = SDK_MODEL_ROWS.find((r) => r.value === 'opus')!
    expect(canonicalModelId(opus)).toBe('claude-opus-5-5')
  })

  it('저장된 옛 ID가 날짜 접미사를 넘어 목록 행에 맞는다', () => {
    expect(findModelRow(SDK_MODEL_ROWS, 'claude-haiku-4-5')?.displayName).toBe('Haiku 4.5')
    expect(findModelRow(SDK_MODEL_ROWS, 'claude-opus-5')?.displayName).toBe('Opus 5')
    expect(canonicalModelId(findModelRow(SDK_MODEL_ROWS, 'claude-opus-5-5[1m]')!)).toBe('claude-opus-5-5')
    expect(canonicalModelId(findModelRow(SDK_MODEL_ROWS, 'default')!)).toBe('claude-opus-5-5')
  })

  it('저장된 별칭은 그 별칭 행에 맞는다', () => {
    expect(canonicalModelId(findModelRow(SDK_MODEL_ROWS, 'sonnet')!)).toBe('claude-sonnet-5-5')
  })

  it('목록에 없는 ID는 맞는 행이 없다', () => {
    expect(findModelRow(SDK_MODEL_ROWS, 'claude-opus-4-1')).toBeUndefined()
  })

  it('effortLevelsFor는 대조한 행의 단계를 준다', () => {
    expect(effortLevelsFor(SDK_MODEL_ROWS, 'claude-haiku-4-5')).toEqual([])
    expect(effortLevelsFor(SDK_MODEL_ROWS, 'claude-opus-5-5')).toContain('xhigh')
    expect(effortLevelsFor(SDK_MODEL_ROWS, 'claude-unknown-1')).toBeUndefined()
  })
})

describe('pickerModelRows — 같은 정식 ID는 한 줄로', () => {
  it('default와 opus가 한 줄로 합쳐지고 뒤 행의 이름을 쓴다', () => {
    const rows = pickerModelRows(SDK_MODEL_ROWS)
    const ids = rows.map(canonicalModelId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(rows).toHaveLength(13)
    expect(rows[0].displayName).toBe('Opus 5.5')
    expect(canonicalModelId(rows[0])).toBe('claude-opus-5-5')
  })

  it('별칭 행(최신)이 명시 행(이전 세대)보다 앞에 온다', () => {
    const names = pickerModelRows(SDK_MODEL_ROWS).map((r) => r.displayName)
    expect(names.slice(0, 4)).toEqual(['Opus 5.5', 'Fable 5.2', 'Sonnet 5.5', 'Haiku 5.5'])
  })
})

describe('normalizeModel — 신뢰경계 검사, 표 대조가 아니다', () => {
  it('목록에 없는 새 claude- ID도 그대로 통과한다', () => {
    expect(normalizeModel('claude-nova-9')).toBe('claude-nova-9')
    expect(normalizeModel('claude-haiku-4-5')).toBe('claude-haiku-4-5')
    expect(normalizeModel('claude-opus-5-5[1m]')).toBe('claude-opus-5-5[1m]')
  })

  it('짧은 별칭은 목록에 있을 때만 통과하고 옛 세대로 바꾸지 않는다', () => {
    expect(normalizeModel('opus', SDK_MODEL_ROWS)).toBe('opus')
    expect(normalizeModel('nova', SDK_MODEL_ROWS)).toBeUndefined()
  })

  it('깨진 값은 막는다', () => {
    for (const bad of ['--inject', 'gpt-4', 'Opus', 'claude-', 'claude-opus 5', '', undefined, 3]) {
      expect(normalizeModel(bad as never), String(bad)).toBeUndefined()
    }
  })
})

describe('effort 사다리', () => {
  it("'minimal'은 effort 단계가 아니다", () => {
    expect(isEffortLevel('minimal')).toBe(false)
    expect(EFFORT_LEVELS).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
  })

  it('clampEffort는 아래로만 내린다', () => {
    const partial = ['low', 'medium', 'high'] as const
    expect(clampEffort(partial, 'max')).toBe('high')
    expect(clampEffort(partial, 'high')).toBe('high')
    expect(clampEffort(partial, 'low')).toBe('low')
  })

  it('단계가 없거나 모르면 undefined', () => {
    expect(clampEffort([], 'max')).toBeUndefined()
    expect(clampEffort(undefined, 'max')).toBeUndefined()
  })
})
