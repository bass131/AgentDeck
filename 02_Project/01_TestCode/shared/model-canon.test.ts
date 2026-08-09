import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  KNOWN_MODELS,
  PICKER_MODELS,
  LEGACY_ALIASES,
  normalizeModel,
  type KnownModel
} from '../../../02_Project/00_Source/shared/knownModels'
import {
  MODEL_EFFORT_LEVELS,
  EFFORT_LEVELS,
  clampEffort,
  supportsEffort,
  type EffortLevelTable
} from '../../../02_Project/00_Source/shared/modelEffort'
import { MODEL_CONTEXT_WINDOW } from '../../../02_Project/00_Source/shared/ipcContract'
import { MODELS, DEFAULT_MODEL, DEFAULT_EFFORT } from '../../../02_Project/00_Source/renderer/src/lib/pickerOptions'

const LIVE = process.env.LIVE_SDK === '1'

describe('모델 키 테이블 정합', () => {
  it('KNOWN_MODELS ≡ keys(MODEL_EFFORT_LEVELS) ≡ keys(MODEL_CONTEXT_WINDOW)', () => {
    const known = [...KNOWN_MODELS].sort()
    expect(Object.keys(MODEL_EFFORT_LEVELS).sort()).toEqual(known)
    expect(Object.keys(MODEL_CONTEXT_WINDOW).sort()).toEqual(known)
  })

  it('PICKER_MODELS ⊆ KNOWN_MODELS', () => {
    for (const m of PICKER_MODELS) {
      expect(KNOWN_MODELS as readonly string[]).toContain(m)
    }
  })

  it('picker MODELS의 id 집합 ≡ PICKER_MODELS (표시 목록에서 조용히 빠지지 않는다)', () => {
    expect(MODELS.map((m) => m.id).sort()).toEqual([...PICKER_MODELS].sort())
  })

  it('기본값이 어휘 안에 있다', () => {
    expect(PICKER_MODELS as readonly string[]).toContain(DEFAULT_MODEL)
    expect([...EFFORT_LEVELS, 'minimal']).toContain(DEFAULT_EFFORT)
  })
})

describe('어휘는 full ID만 담는다', () => {
  it('KNOWN_MODELS 전 항목이 claude-<패밀리>-<버전> 형식이다', () => {
    for (const m of KNOWN_MODELS) {
      expect(m, `${m}는 full ID가 아니다`).toMatch(/^claude-[a-z]+-\d+(?:-\d+)?$/)
    }
  })

  it('KNOWN_MODELS에 짧은 별칭이 없다', () => {
    for (const alias of Object.keys(LEGACY_ALIASES)) {
      expect(KNOWN_MODELS as readonly string[]).not.toContain(alias)
    }
  })

  it('날짜 접미사를 어휘에 담지 않는다', () => {
    for (const m of KNOWN_MODELS) {
      expect(m, `${m}에 날짜 접미사가 붙어 있다`).not.toMatch(/-\d{8}$/)
    }
  })
})

describe('normalizeModel — untrusted 문자열 → 어휘', () => {
  it('full ID는 그대로 통과한다', () => {
    for (const m of KNOWN_MODELS) expect(normalizeModel(m)).toBe(m)
  })

  it('레거시 별칭을 실측 당시 해석 세대로 매핑한다', () => {
    expect(normalizeModel('opus')).toBe('claude-opus-4-8')
    expect(normalizeModel('sonnet')).toBe('claude-sonnet-5')
    expect(normalizeModel('fable')).toBe('claude-fable-5')
    expect(normalizeModel('haiku')).toBe('claude-haiku-4-5')
  })

  it('SDK wire ID의 접미사를 벗긴다 (게이지 룩업 실패 방지)', () => {
    expect(normalizeModel('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5')
    expect(normalizeModel('claude-opus-4-8[1m]')).toBe('claude-opus-4-8')
  })

  it('미지 값·undefined는 undefined', () => {
    expect(normalizeModel('gpt-4')).toBeUndefined()
    expect(normalizeModel('Opus')).toBeUndefined()
    expect(normalizeModel(undefined)).toBeUndefined()
  })

  it('정규화 결과는 항상 모델 키 테이블로 룩업된다', () => {
    const inputs = [...KNOWN_MODELS, ...Object.keys(LEGACY_ALIASES), 'claude-haiku-4-5-20251001']
    for (const raw of inputs) {
      const m = normalizeModel(raw)
      expect(m, raw).toBeDefined()
      expect(MODEL_CONTEXT_WINDOW[m as KnownModel], raw).toBeGreaterThan(0)
    }
  })
})

describe('effort 사다리', () => {
  it('지원 목록은 EFFORT_LEVELS의 부분집합이다', () => {
    for (const [model, levels] of Object.entries(MODEL_EFFORT_LEVELS)) {
      for (const l of levels) {
        expect(EFFORT_LEVELS as readonly string[], model).toContain(l)
      }
    }
  })

  it('Opus 5는 max를 받는다', () => {
    expect(MODEL_EFFORT_LEVELS['claude-opus-5']).toContain('max')
    expect(clampEffort('claude-opus-5', 'max')).toBe('max')
  })

  it('Haiku 4.5는 effort를 받지 않는다', () => {
    expect(MODEL_EFFORT_LEVELS['claude-haiku-4-5']).toEqual([])
    expect(supportsEffort('claude-haiku-4-5')).toBe(false)
    expect(clampEffort('claude-haiku-4-5', 'max')).toBeUndefined()
  })

  it('clampEffort는 아래로만 내린다', () => {
    const table: EffortLevelTable = { partial: ['low', 'medium', 'high'] }
    expect(clampEffort('partial', 'max', table)).toBe('high')
    expect(clampEffort('partial', 'xhigh', table)).toBe('high')
    expect(clampEffort('partial', 'high', table)).toBe('high')
    expect(clampEffort('partial', 'low', table)).toBe('low')
  })

  it('clampEffort는 표에 없는 모델에 undefined를 낸다', () => {
    expect(clampEffort('gpt-5', 'max', { partial: ['low'] })).toBeUndefined()
  })

  it('supportsEffort도 주입된 표를 본다', () => {
    const table: EffortLevelTable = { partial: ['low'], none: [] }
    expect(supportsEffort('partial', table)).toBe(true)
    expect(supportsEffort('none', table)).toBe(false)
    expect(supportsEffort('absent', table)).toBe(false)
  })
})

interface SdkModelRow {
  value: string
  resolvedModel?: string
  displayName: string
  supportedEffortLevels?: string[]
}

async function fetchSdkModels(): Promise<SdkModelRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk = (await import('@anthropic-ai/claude-agent-sdk')) as any
  const ws = mkdtempSync(join(tmpdir(), 'canon-'))
  const ac = new AbortController()
  try {
    const handle = sdk.query({
      prompt: 'Reply with exactly one word: OK',
      options: { cwd: ws, abortController: ac }
    })
    const rows = (await handle.supportedModels()) as SdkModelRow[]
    return rows
  } finally {
    ac.abort()
    rmSync(ws, { recursive: true, force: true })
  }
}

describe.skipIf(!LIVE)('SDK 대조 — LIVE_SDK=1', () => {
  it('SDK가 신고한 effort 레벨이 우리 표와 일치한다', async () => {
    const rows = await fetchSdkModels()
    expect(rows.length).toBeGreaterThan(0)

    let compared = 0
    const skipped: string[] = []
    for (const row of rows) {
      const wire = row.resolvedModel ?? row.value
      const known = normalizeModel(wire)
      if (known === undefined) {
        skipped.push(wire)
        continue
      }
      const ours = [...MODEL_EFFORT_LEVELS[known]].sort()
      const theirs = [...(row.supportedEffortLevels ?? [])].sort()
      expect(theirs, `${wire} (SDK value=${row.value})`).toEqual(ours)
      compared++
    }

    // eslint-disable-next-line no-console
    console.log(`[canon] 대조 ${compared}행 / 어휘 밖 ${skipped.length}행: ${JSON.stringify(skipped)}`)
    expect(compared).toBeGreaterThan(0)
  }, 180_000)

  it('claude-opus-5는 SDK picker 목록에 없다 (있으면 어휘 파생 방식을 재검토할 신호)', async () => {
    const rows = await fetchSdkModels()
    const wires = rows.map((r) => r.resolvedModel ?? r.value)
    expect(wires.some((w) => normalizeModel(w) === 'claude-opus-5')).toBe(false)
  }, 180_000)
})
