import { describe, it, expect, afterEach } from 'vitest'
import { buildQueryOptions, resolveSetModelRequest } from '@main/04_Claude/runArgs'
import { setCurrentModelRows } from '@main/04_Claude/modelListProvider'
import { FALLBACK_MODELS } from '@shared/03_Agent/models/knownModels'
import { SDK_MODEL_ROWS } from '../../shared/00_Helpers/sdkModelRows'

const OPUS55 = 'claude-opus-5-5'
const SONNET55 = 'claude-sonnet-5-5'
const OPUS46 = 'claude-opus-4-6'
const HAIKU45 = 'claude-haiku-4-5'
const ROWS = SDK_MODEL_ROWS

afterEach(() => {
  setCurrentModelRows(FALLBACK_MODELS)
})

describe('buildQueryOptions — 골든 케이스(SDK 목록 기준)', () => {
  it('(Opus 5.5, max, auto) → effort:max + permissionMode:auto', () => {
    expect(buildQueryOptions({ model: OPUS55, effort: 'max', mode: 'auto' }, ROWS)).toEqual({
      model: OPUS55,
      effort: 'max',
      permissionMode: 'auto'
    })
  })

  it('(Sonnet 5.5, xhigh, normal) → 클램프 없음, permissionMode:default', () => {
    expect(buildQueryOptions({ model: SONNET55, effort: 'xhigh', mode: 'normal' }, ROWS)).toEqual({
      model: SONNET55,
      effort: 'xhigh',
      permissionMode: 'default'
    })
  })

  it('(Opus 4.6, xhigh) → 목록의 단계(low·medium·high·max)로 내려 high', () => {
    expect(buildQueryOptions({ model: OPUS46, effort: 'xhigh' }, ROWS)).toEqual({ model: OPUS46, effort: 'high' })
  })

  it('(옛 저장 ID Haiku 4.5, max, bypass) → 날짜 접미 행과 맞아 effort 생략', () => {
    expect(buildQueryOptions({ model: HAIKU45, effort: 'max', mode: 'bypass' }, ROWS)).toEqual({
      model: HAIKU45,
      permissionMode: 'bypassPermissions'
    })
  })

  it('기본 인자는 main의 현재 목록을 읽는다', () => {
    setCurrentModelRows(ROWS)
    expect(buildQueryOptions({ model: HAIKU45, effort: 'max' })).toEqual({ model: HAIKU45 })
  })
})

describe("buildQueryOptions — 「최소」(사고 끄기) 경로가 없다", () => {
  // 옛 「최소」는 가장 싼 설정이었다 — 남은 단계 중 가장 가까운 low로 읽는다. 다른 비단계 값은 기본 단계.
  it("옛 저장값 'minimal'은 low로 보내고 thinking 키를 만들지 않는다", () => {
    const result = buildQueryOptions({ model: OPUS55, effort: 'minimal', mode: 'plan' }, ROWS)
    expect(result).toEqual({ model: OPUS55, effort: 'low', permissionMode: 'plan' })
    expect('thinking' in result).toBe(false)
  })

  it("model 미전달 + 'minimal' → effort:low, 알 수 없는 값 → 기본 max", () => {
    expect(buildQueryOptions({ effort: 'minimal' }, ROWS)).toEqual({ effort: 'low' })
    expect(buildQueryOptions({ effort: 'turbo' }, ROWS)).toEqual({ effort: 'max' })
  })

  it("Haiku 4.5 + 'minimal' → effort도 thinking도 없음", () => {
    expect(buildQueryOptions({ model: HAIKU45, effort: 'minimal' }, ROWS)).toEqual({ model: HAIKU45 })
  })
})

describe('buildQueryOptions — 모델 ID는 표 대조 없이 통과한다', () => {
  it('목록에 없는 새 claude- ID도 그대로 간다 — 기본 모델로 조용히 바뀌지 않는다', () => {
    expect(buildQueryOptions({ model: 'claude-nova-9' }, ROWS)).toEqual({ model: 'claude-nova-9' })
  })

  it('목록에 없는 ID에는 effort를 붙이지 않는다', () => {
    expect(buildQueryOptions({ model: 'claude-nova-9', effort: 'max' }, ROWS)).toEqual({ model: 'claude-nova-9' })
  })

  it('저장된 별칭은 옛 세대로 바꾸지 않고 그대로 보낸다', () => {
    expect(buildQueryOptions({ model: 'opus', effort: 'max' }, ROWS)).toEqual({ model: 'opus', effort: 'max' })
  })

  it('옛 저장 ID(claude-opus-5)도 그대로 보낸다', () => {
    expect(buildQueryOptions({ model: 'claude-opus-5', effort: 'high' }, ROWS)).toEqual({
      model: 'claude-opus-5',
      effort: 'high'
    })
  })
})

describe('buildQueryOptions — 신뢰경계 차단', () => {
  it('"--inject" → model 키 없음', () => {
    expect(buildQueryOptions({ model: '--inject' }, ROWS)).toEqual({})
  })

  it('"gpt-4" → model 키 없음', () => {
    expect(buildQueryOptions({ model: 'gpt-4' }, ROWS)).toEqual({})
  })

  it('대소문자가 다른 "Opus" → model 키 없음', () => {
    expect(buildQueryOptions({ model: 'Opus' }, ROWS)).toEqual({})
  })

  it('미지 mode "dontAsk" → permissionMode 키 없음', () => {
    expect(buildQueryOptions({ mode: 'dontAsk' }, ROWS)).toEqual({})
  })

  it('결과 객체에 CLI 플래그 문자열이 없다', () => {
    const serialized = JSON.stringify(buildQueryOptions({ model: OPUS55, effort: 'max', mode: 'auto' }, ROWS))
    expect(serialized).not.toContain('--')
  })
})

describe('buildQueryOptions — 부분 전달', () => {
  it('{} → {}', () => {
    expect(buildQueryOptions({}, ROWS)).toEqual({})
  })

  it('model 미전달 + effort "high" → {effort:"high"}', () => {
    expect(buildQueryOptions({ effort: 'high' }, ROWS)).toEqual({ effort: 'high' })
  })

  it('model 미전달 + mode "bypass" → {permissionMode:"bypassPermissions"}', () => {
    expect(buildQueryOptions({ mode: 'bypass' }, ROWS)).toEqual({ permissionMode: 'bypassPermissions' })
  })
})

describe('buildQueryOptions — mode 매핑 전수', () => {
  const cases: [string, string][] = [
    ['normal', 'default'],
    ['plan', 'plan'],
    ['auto', 'auto'],
    ['acceptEdits', 'acceptEdits'],
    ['bypass', 'bypassPermissions']
  ]

  for (const [mode, expected] of cases) {
    it(`mode만: ${mode} → ${expected}`, () => {
      expect(buildQueryOptions({ mode }, ROWS)).toEqual({ permissionMode: expected })
    })
  }
})

describe('resolveSetModelRequest — 실행 중 모델 전환', () => {
  it('목록에 없는 새 ID도 받는다', () => {
    expect(resolveSetModelRequest({ runId: 'r1', model: 'claude-nova-9' }, ROWS)).toEqual({
      runId: 'r1',
      model: 'claude-nova-9'
    })
  })

  it('깨진 값은 거절한다', () => {
    expect(resolveSetModelRequest({ runId: 'r1', model: 'gpt-5' }, ROWS)).toBeNull()
    expect(resolveSetModelRequest({ runId: '', model: OPUS55 }, ROWS)).toBeNull()
  })
})
