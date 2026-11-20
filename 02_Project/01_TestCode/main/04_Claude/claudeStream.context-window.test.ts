// M06 G4 — 컨텍스트 계기는 턴 결과 modelUsage에서 「주 모델」 항목의 contextWindow를 쓴다.
// 실측(SDK 0.3.325): 턴마다 보조 모델 항목이 함께 오고, 그 창이 주 모델보다 클 수 있다.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { contextWindowFromModelUsage, mapClaudeStreamLine } from '@main/04_Claude/stream/claudeStream'
import { RunEventNormalizer } from '@main/04_Claude/stream/eventNormalizer'

function usageEntry(contextWindow: number, inputTokens: number, cacheCreation: number, canonicalModel?: string): Record<string, unknown> {
  return {
    inputTokens,
    outputTokens: 5,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: cacheCreation,
    webSearchRequests: 0,
    costUSD: 0,
    contextWindow,
    maxOutputTokens: 32000,
    ...(canonicalModel ? { canonicalModel } : {}),
  }
}

// 옛 저장 ID claude-haiku-4-5로 한 턴 돌린 실측 모양 — 보조 항목(1M)이 주 모델(200K)보다 크다.
const HAIKU45_TURN = {
  'claude-haiku-4-5': usageEntry(200_000, 10, 20_002, 'claude-haiku-4-5'),
  'claude-haiku-5-5': usageEntry(1_000_000, 1_176, 0, 'claude-haiku-5-5'),
}

// 별칭 opus로 돌린 실측 모양 — 키는 풀린 정식 ID다. 보조 항목이 앞에 온다.
const OPUS_ALIAS_TURN = {
  'claude-haiku-5-5': usageEntry(1_000_000, 1_176, 0, 'claude-haiku-5-5'),
  'claude-opus-5-5': usageEntry(1_000_000, 2, 20_599, 'claude-opus-5-5'),
}

function resultLine(modelUsage: unknown): Record<string, unknown> {
  return {
    type: 'result',
    subtype: 'success',
    is_error: false,
    usage: { input_tokens: 10, output_tokens: 5 },
    modelUsage,
  }
}

describe('contextWindowFromModelUsage — 주 모델 항목을 고른다', () => {
  it('주 모델 키가 맞으면 그 창을 쓴다 — 더 큰 보조 항목의 창이 아니다', () => {
    expect(contextWindowFromModelUsage(HAIKU45_TURN, 'claude-haiku-4-5')).toBe(200_000)
  })

  it('canonicalModel이나 날짜 접미를 벗긴 값으로도 맞춘다', () => {
    expect(contextWindowFromModelUsage(HAIKU45_TURN, 'claude-haiku-4-5-20251001')).toBe(200_000)
    const keyedByWire = { 'claude-x-1-20990101': usageEntry(300_000, 50, 9_000, 'claude-x-1'), ...OPUS_ALIAS_TURN }
    expect(contextWindowFromModelUsage(keyedByWire, 'claude-x-1')).toBe(300_000)
  })

  it('주 모델을 모르면 맥락 토큰이 가장 큰 항목을 쓴다 — 첫 항목도 최대 창도 아니다', () => {
    expect(contextWindowFromModelUsage(HAIKU45_TURN)).toBe(200_000)
    expect(contextWindowFromModelUsage(HAIKU45_TURN, 'claude-none-1')).toBe(200_000)
  })

  // M11 G2 — M06 Backlog 19. 접미 벗기기가 modelList.ts의 stripModelSuffixes와 복제였다.
  it('접미 벗기기는 공용 stripModelSuffixes 하나를 쓴다', () => {
    const src = readFileSync(resolve(__dirname, '../../../00_Source/main/04_Claude/stream/claudeStream.ts'), 'utf8')
    expect(src).not.toMatch(/stripWireSuffixes/)
    expect(src).toMatch(/stripModelSuffixes/)
    expect(contextWindowFromModelUsage({ 'claude-x-1-20990101[1m]': usageEntry(300_000, 50, 9_000) }, 'claude-x-1')).toBe(300_000)
  })

  it('항목이 없거나 모양이 틀리면 undefined', () => {
    expect(contextWindowFromModelUsage(undefined)).toBeUndefined()
    expect(contextWindowFromModelUsage({ x: { contextWindow: 'big' } })).toBeUndefined()
  })
})

describe('mapClaudeStreamLine — result의 done.contextWindow', () => {
  it('주 모델 힌트를 받으면 그 항목의 창을 싣는다', () => {
    const [done] = mapClaudeStreamLine(resultLine(HAIKU45_TURN), { mainModel: 'claude-haiku-4-5' })
    expect(done).toMatchObject({ type: 'done', contextWindow: 200_000 })
  })
})

describe('RunEventNormalizer — 주 모델을 추적해 계기에 넘긴다', () => {
  it('system/init의 model을 주 모델로 쓴다', () => {
    const n = new RunEventNormalizer('t1')
    n.process({ type: 'system', subtype: 'init', session_id: 's1', model: 'claude-haiku-4-5' })
    const { done } = n.process(resultLine(HAIKU45_TURN), 'user')
    expect(done?.contextWindow).toBe(200_000)
  })

  it('별칭으로 연 세션은 init이 풀린 ID를 주고 그 항목을 고른다', () => {
    const n = new RunEventNormalizer('t2')
    n.process({ type: 'system', subtype: 'init', session_id: 's2', model: 'claude-opus-5-5' })
    expect(n.process(resultLine(OPUS_ALIAS_TURN), 'user').done?.contextWindow).toBe(1_000_000)
  })

  it('거절 폴백(model_refusal_fallback)으로 바뀐 모델을 따라간다', () => {
    const n = new RunEventNormalizer('t4')
    n.process({ type: 'system', subtype: 'init', session_id: 's4', model: 'claude-haiku-5-5' })
    n.process({ type: 'system', subtype: 'model_refusal_fallback', original_model: 'claude-haiku-5-5', fallback_model: 'claude-haiku-4-5' })
    expect(n.process(resultLine(HAIKU45_TURN), 'user').done?.contextWindow).toBe(200_000)
  })

  // 공개 타입: scope 'local'은 서브에이전트 등 그 응답만 폴백했고 세션 모델은 그대로다 (G4 검수 1-1).
  it("scope 'local' 거절 폴백은 주 모델을 바꾸지 않는다", () => {
    const n = new RunEventNormalizer('t5')
    n.process({ type: 'system', subtype: 'init', session_id: 's5', model: 'claude-haiku-4-5' })
    n.process({ type: 'system', subtype: 'model_refusal_fallback', scope: 'local', original_model: 'claude-haiku-4-5', fallback_model: 'claude-haiku-5-5' })
    expect(n.process(resultLine(HAIKU45_TURN), 'user').done?.contextWindow).toBe(200_000)
  })

  // M11 G2 — M06 Backlog 2·26. result.usage는 공개 타입상 「한 턴 안 API 호출의 합」이라 도구를 여러 번 쓴 턴에서는 창을 넘는다
  // (실측: 다섯 호출 턴 result.usage 139,134, 마지막 최상위 assistant usage 29,451 = getContextUsage totalTokens 29,451).
  // 계기용 usage는 그 턴 마지막 최상위(서브에이전트가 아닌) assistant 메시지의 usage다.
  it('done.usage는 턴 합계가 아니라 마지막 최상위 assistant 메시지의 usage다', () => {
    const n = new RunEventNormalizer('t-usage')
    n.process({ type: 'system', subtype: 'init', session_id: 's6', model: 'claude-haiku-5-5' })
    const assistant = (input: number, cacheRead: number, parent: string | null = null) => ({
      type: 'assistant',
      parent_tool_use_id: parent,
      message: { id: `m-${input}-${cacheRead}`, role: 'assistant', content: [], usage: { input_tokens: input, output_tokens: 7, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: 3 } },
    })
    n.process(assistant(5, 20_000))
    n.process(assistant(6, 25_000))
    n.process(assistant(900_000, 0, 'toolu_sub'))
    n.process(assistant(8, 29_440))
    const turnSum = { ...resultLine(HAIKU45_TURN), usage: { input_tokens: 900_019, output_tokens: 21, cache_read_input_tokens: 74_440, cache_creation_input_tokens: 9 } }
    const { done } = n.process(turnSum, 'user')
    expect(done?.usage).toEqual({ inputTokens: 8, outputTokens: 7, cacheReadTokens: 29_440, cacheCreationTokens: 3 })
    expect(done?.contextWindow).toBe(1_000_000)
    // 다음 턴은 새로 센다 — assistant가 없던 턴은 결과의 usage를 쓴다
    expect(n.process(resultLine(HAIKU45_TURN), 'user').done?.usage).toEqual({ inputTokens: 10, outputTokens: 5 })
    // 서브에이전트 호출만 있던 턴도 결과의 usage를 쓴다
    n.process(assistant(700_000, 0, 'toolu_sub'))
    expect(n.process(resultLine(HAIKU45_TURN), 'user').done?.usage).toEqual({ inputTokens: 10, outputTokens: 5 })
  })

  // 끊긴 턴의 호출 크기가 다음 턴 결과에 섞이지 않게 한다
  it('정리(abort·펌프 끝)는 붙든 마지막 호출 usage를 버린다', () => {
    const msg = { type: 'assistant', parent_tool_use_id: null, message: { id: 'mx', role: 'assistant', content: [], usage: { input_tokens: 77, output_tokens: 1 } } }
    for (const clean of ['abortCleanup', 'singlePumpCleanup', 'persistentPumpCleanup'] as const) {
      const n = new RunEventNormalizer(`t-${clean}`)
      n.process(msg)
      n[clean]()
      expect(n.process(resultLine(HAIKU45_TURN), 'user').done?.usage, clean).toEqual({ inputTokens: 10, outputTokens: 5 })
    }
  })

  it('실행 중 모델 전환(setMainModel)을 따라간다', () => {
    const n = new RunEventNormalizer('t3')
    n.process({ type: 'system', subtype: 'init', session_id: 's3', model: 'claude-haiku-5-5' })
    n.setMainModel('claude-haiku-4-5')
    expect(n.process(resultLine(HAIKU45_TURN), 'user').done?.contextWindow).toBe(200_000)
  })
})
