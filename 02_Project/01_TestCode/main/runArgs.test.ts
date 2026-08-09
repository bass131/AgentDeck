import { describe, it, expect } from 'vitest'
import { buildQueryOptions } from '../../../02_Project/00_Source/main/01_agents/runArgs'

const OPUS5 = 'claude-opus-5'
const FABLE5 = 'claude-fable-5'
const SONNET5 = 'claude-sonnet-5'
const HAIKU = 'claude-haiku-4-5'

describe('buildQueryOptions — 골든 케이스', () => {
  it('(Opus 5, max, auto) → effort:max + permissionMode:acceptEdits', () => {
    expect(buildQueryOptions({ model: OPUS5, effort: 'max', mode: 'auto' })).toEqual({
      model: OPUS5,
      effort: 'max',
      permissionMode: 'acceptEdits'
    })
  })

  it('(Sonnet 5, xhigh, normal) → 클램프 없음, permissionMode:default', () => {
    expect(buildQueryOptions({ model: SONNET5, effort: 'xhigh', mode: 'normal' })).toEqual({
      model: SONNET5,
      effort: 'xhigh',
      permissionMode: 'default'
    })
  })

  it('(Fable 5, xhigh, acceptEdits) → 클램프 없음', () => {
    expect(buildQueryOptions({ model: FABLE5, effort: 'xhigh', mode: 'acceptEdits' })).toEqual({
      model: FABLE5,
      effort: 'xhigh',
      permissionMode: 'acceptEdits'
    })
  })

  it('(Haiku 4.5, max, bypass) → effort 생략(미지원), permissionMode:bypassPermissions', () => {
    expect(buildQueryOptions({ model: HAIKU, effort: 'max', mode: 'bypass' })).toEqual({
      model: HAIKU,
      permissionMode: 'bypassPermissions'
    })
  })

  it('(Opus 5, low, undefined) → effort:low', () => {
    expect(buildQueryOptions({ model: OPUS5, effort: 'low' })).toEqual({
      model: OPUS5,
      effort: 'low'
    })
  })
})

describe('buildQueryOptions — minimal(확장사고 끔)', () => {
  it('(Opus 5, minimal, plan) → thinking:{type:disabled}', () => {
    expect(buildQueryOptions({ model: OPUS5, effort: 'minimal', mode: 'plan' })).toEqual({
      model: OPUS5,
      thinking: { type: 'disabled' },
      permissionMode: 'plan'
    })
  })

  it('(Sonnet 5, minimal) → thinking:{type:disabled}', () => {
    expect(buildQueryOptions({ model: SONNET5, effort: 'minimal', mode: 'normal' })).toEqual({
      model: SONNET5,
      thinking: { type: 'disabled' },
      permissionMode: 'default'
    })
  })

  it('(Fable 5, minimal) → thinking 키도 effort 키도 없음', () => {
    const result = buildQueryOptions({ model: FABLE5, effort: 'minimal', mode: 'auto' })
    expect(result).toEqual({ model: FABLE5, permissionMode: 'acceptEdits' })
  })

  it('(Haiku 4.5, minimal) → effort/thinking 둘 다 생략', () => {
    expect(buildQueryOptions({ model: HAIKU, effort: 'minimal', mode: 'normal' })).toEqual({
      model: HAIKU,
      permissionMode: 'default'
    })
  })

  it('model 미전달 + minimal → thinking:{type:disabled}', () => {
    expect(buildQueryOptions({ effort: 'minimal' })).toEqual({ thinking: { type: 'disabled' } })
  })
})

describe('buildQueryOptions — effort와 thinking은 배타다', () => {
  const inputs = [
    { model: OPUS5, effort: 'minimal' },
    { model: OPUS5, effort: 'max' },
    { model: OPUS5, effort: 'xhigh' },
    { model: OPUS5, effort: 'high' },
    { model: FABLE5, effort: 'minimal' },
    { model: HAIKU, effort: 'minimal' },
    { model: HAIKU, effort: 'max' },
    { effort: 'minimal' },
    { effort: 'max' }
  ]

  for (const input of inputs) {
    it(`${JSON.stringify(input)} → effort·thinking 동시 출현 없음`, () => {
      const result = buildQueryOptions(input)
      const both = 'effort' in result && 'thinking' in result
      expect(both, JSON.stringify(result)).toBe(false)
    })
  }
})

describe('buildQueryOptions — 레거시 별칭 정규화', () => {
  const cases: [string, string][] = [
    ['opus', 'claude-opus-4-8'],
    ['fable', FABLE5],
    ['sonnet', SONNET5],
    ['haiku', HAIKU]
  ]

  for (const [alias, expected] of cases) {
    it(`'${alias}' → ${expected}`, () => {
      expect(buildQueryOptions({ model: alias }).model).toBe(expected)
    })
  }

  it("레거시 'haiku'도 effort 미지원 규칙을 따른다", () => {
    expect(buildQueryOptions({ model: 'haiku', effort: 'max' })).toEqual({ model: HAIKU })
  })
})

describe('buildQueryOptions — allowlist 차단(신뢰경계)', () => {
  it('미지 model "--inject" → model 키 없음', () => {
    expect(buildQueryOptions({ model: '--inject' })).toEqual({})
  })

  it('미지 model "gpt-4" → model 키 없음', () => {
    expect(buildQueryOptions({ model: 'gpt-4' })).toEqual({})
  })

  it('대소문자가 다른 "Opus" → model 키 없음', () => {
    expect(buildQueryOptions({ model: 'Opus' })).toEqual({})
  })

  it('미지 mode "dontAsk" → permissionMode 키 없음', () => {
    expect(buildQueryOptions({ mode: 'dontAsk' })).toEqual({})
  })

  it('미지 effort "turbo" → effort/thinking 키 없음', () => {
    expect(buildQueryOptions({ model: OPUS5, effort: 'turbo' })).toEqual({ model: OPUS5 })
  })

  it('결과 객체에 CLI 플래그 문자열이 없다', () => {
    const result = buildQueryOptions({ model: OPUS5, effort: 'max', mode: 'auto' })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('--')
  })
})

describe('buildQueryOptions — 부분 전달', () => {
  it('{} → {}', () => {
    expect(buildQueryOptions({})).toEqual({})
  })

  it('model 미전달 + effort "high" → {effort:"high"} (지원 가정)', () => {
    expect(buildQueryOptions({ effort: 'high' })).toEqual({ effort: 'high' })
  })

  it('model 미전달 + effort "max" → {effort:"max"}', () => {
    expect(buildQueryOptions({ effort: 'max' })).toEqual({ effort: 'max' })
  })

  it('model 미전달 + mode "bypass" → {permissionMode:"bypassPermissions"}', () => {
    expect(buildQueryOptions({ mode: 'bypass' })).toEqual({
      permissionMode: 'bypassPermissions'
    })
  })

  for (const model of [OPUS5, FABLE5, SONNET5, HAIKU]) {
    it(`model만: ${model}`, () => {
      expect(buildQueryOptions({ model })).toEqual({ model })
    })
  }
})

describe('buildQueryOptions — mode 매핑 전수', () => {
  const cases: [string, string][] = [
    ['normal', 'default'],
    ['plan', 'plan'],
    ['auto', 'acceptEdits'],
    ['acceptEdits', 'acceptEdits'],
    ['bypass', 'bypassPermissions']
  ]

  for (const [mode, expected] of cases) {
    it(`mode만: ${mode} → ${expected}`, () => {
      expect(buildQueryOptions({ mode })).toEqual({ permissionMode: expected })
    })
  }
})

describe('runArgs 재수출', () => {
  it('어휘를 runArgs 경로로 re-export한다', async () => {
    const mod = await import('../../../02_Project/00_Source/main/01_agents/runArgs')
    expect(Array.isArray(mod.KNOWN_MODELS)).toBe(true)
    expect(Array.isArray(mod.PICKER_MODELS)).toBe(true)
    expect(typeof mod.normalizeModel).toBe('function')
    expect(mod.MODEL_EFFORT_LEVELS).toBeTypeOf('object')
  })
})
