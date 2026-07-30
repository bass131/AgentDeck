/**
 * model-canon.test.ts — 모델 어휘 정본 고정 + SDK 대조
 *
 * 이 앱은 모델 능력을 정적 표(`KNOWN_MODELS` · `MODEL_EFFORT_LEVELS` ·
 * `MODEL_CONTEXT_WINDOW` · picker `MODELS`)로 들고 있다. SDK가 `supportedModels()`로
 * 같은 지식을 주지만 그 호출은 세션이 있어야 가능해서, 앱 시작 즉시·오프라인에서도
 * 떠야 하는 picker의 부트스트랩 출처로 쓸 수 없다.
 *
 * 정적 표의 위험은 조용히 낡는다는 것이고, 그건 이 저장소에서 이미 실증됐다 — 하네스
 * 서브에이전트의 모델 지정이 문서 규범만으로는 유지되지 않고 별칭으로 되돌아간 사건이
 * 있었다. 그래서 여기서 기계로 고정한다:
 *   - 오프라인 단언: 표들 사이의 정합(키 집합·부분집합·별칭 부재)
 *   - 라이브 대조(LIVE_SDK=1): 우리 표 ↔ SDK 신고값. 어긋나면 red.
 *
 * opt-in: LIVE_SDK=1 npx vitest run 99_Others/tests/shared/model-canon.test.ts
 */
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
} from '../../../02_Source/shared/knownModels'
import {
  MODEL_EFFORT_LEVELS,
  EFFORT_LEVELS,
  clampEffort,
  supportsEffort,
  type EffortLevel
} from '../../../02_Source/shared/modelEffort'
import { MODEL_CONTEXT_WINDOW } from '../../../02_Source/shared/ipcContract'
import { MODELS, DEFAULT_MODEL, DEFAULT_EFFORT } from '../../../02_Source/renderer/src/lib/pickerOptions'

const LIVE = process.env.LIVE_SDK === '1'

// ── 표 사이 정합 ──────────────────────────────────────────────────────────────

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

// ── 어휘 형태 ─────────────────────────────────────────────────────────────────

describe('어휘는 full ID만 담는다', () => {
  /**
   * 짧은 별칭은 "현재 그 계열의 기본 모델"을 가리키는 이동 표적이라 세대를 고정하지 못한다
   * (SDK@0.3.201에서 'sonnet'은 claude-sonnet-5지만 SDK@0.3.186에서는 claude-sonnet-4-6이었다).
   * 어휘에 별칭이 다시 들어오면 이 단언이 red가 된다.
   */
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

// ── normalizeModel ────────────────────────────────────────────────────────────

describe('normalizeModel — untrusted 문자열 → 어휘', () => {
  it('full ID는 그대로 통과한다', () => {
    for (const m of KNOWN_MODELS) expect(normalizeModel(m)).toBe(m)
  })

  it('레거시 별칭을 실측 당시 해석 세대로 매핑한다', () => {
    // 'opus'를 claude-opus-5로 올려붙이지 않는 것이 핵심 — 저장값 복원이 사용자가 고른 적
    // 없는 모델로 갈아치우면 안 된다(그게 별칭을 버린 이유다).
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
    expect(normalizeModel('Opus')).toBeUndefined() // 대소문자 구분
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

// ── effort 사다리 ─────────────────────────────────────────────────────────────

describe('effort 사다리', () => {
  it('지원 목록은 EFFORT_LEVELS의 부분집합이다', () => {
    for (const [model, levels] of Object.entries(MODEL_EFFORT_LEVELS)) {
      for (const l of levels) {
        expect(EFFORT_LEVELS as readonly string[], model).toContain(l)
      }
    }
  })

  it('Opus 5는 max를 받는다', () => {
    // 라이브 실측(2026-07-30): model='claude-opus-5' + effort='max'가 400 없이 통과.
    expect(MODEL_EFFORT_LEVELS['claude-opus-5']).toContain('max')
    expect(clampEffort('claude-opus-5', 'max')).toBe('max')
  })

  it('Haiku 4.5는 effort를 받지 않는다', () => {
    // SDK supportedModels() 실측: haiku 행에 supportsEffort·supportedEffortLevels 키가 없다.
    expect(MODEL_EFFORT_LEVELS['claude-haiku-4-5']).toEqual([])
    expect(supportsEffort('claude-haiku-4-5')).toBe(false)
    expect(clampEffort('claude-haiku-4-5', 'max')).toBeUndefined()
  })

  it('clampEffort는 아래로만 내린다', () => {
    const table: Record<string, readonly EffortLevel[]> = { partial: ['low', 'medium', 'high'] }
    const clamp = (req: EffortLevel): EffortLevel | undefined => {
      const allowed = table['partial']
      if (allowed.includes(req)) return req
      for (let i = EFFORT_LEVELS.indexOf(req) - 1; i >= 0; i--) {
        if (allowed.includes(EFFORT_LEVELS[i])) return EFFORT_LEVELS[i]
      }
      return undefined
    }
    expect(clamp('max')).toBe('high')
    expect(clamp('xhigh')).toBe('high')
    expect(clamp('low')).toBe('low')
  })
})

// ── SDK 라이브 대조 ───────────────────────────────────────────────────────────

interface SdkModelRow {
  value: string
  resolvedModel?: string
  displayName: string
  supportedEffortLevels?: string[]
}

/** `supportedModels()`를 한 번 호출해 SDK가 신고하는 모델 목록을 받는다. */
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
        // SDK가 우리 어휘 밖 모델을 신고 — 대조 대상이 아니다(어휘 확장 후보로만 기록).
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
    // 2026-07-30 실측: SDK 목록은 default/opus[1m]/claude-fable-5[1m]/sonnet/haiku 5행이고
    // Opus 5가 없다. 그래서 picker 목록의 상한은 SDK가 아니라 PICKER_MODELS다.
    // SDK가 Opus 5를 노출하기 시작하면 이 단언이 red가 되고, 그때 정적 표 대신 SDK 목록을
    // 직접 쓰는 선택지가 열린다 — 실패가 곧 그 신호다.
    expect(wires.some((w) => normalizeModel(w) === 'claude-opus-5')).toBe(false)
  }, 180_000)
})
