/**
 * m4-1-picker-gauge.test.ts — M4-1 20d 서브웨이브 TDD
 *
 * (a) reducer: done.usage를 lastUsage에 저장 (기존 테스트 재확인 포함)
 * (b) sendMessage: model/effort/mode를 window.api.agentRun에 전달
 * (c) 게이지 계산: used/window/pct 수식 단위 검증
 *
 * Node 환경. window.api mock 포함(b만). 순수 함수 테스트(a, c).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── (a) reducer — done.usage 저장 ─────────────────────────────────────────────

import { applyAgentEvent, makeInitialState } from '../../../02.Source/renderer/src/store/reducer'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

const runId = 'run-m4'
function mkPayload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

describe('(a) reducer — done.usage 저장', () => {
  it('done 이벤트가 lastUsage에 inputTokens + outputTokens를 저장한다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      mkPayload({ type: 'done', usage: { inputTokens: 500, outputTokens: 300 } })
    )
    expect(s1.lastUsage?.inputTokens).toBe(500)
    expect(s1.lastUsage?.outputTokens).toBe(300)
    expect(s1.isRunning).toBe(false)
  })

  it('done 이벤트 usage 없으면 lastUsage가 undefined', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, mkPayload({ type: 'done' }))
    expect(s1.lastUsage).toBeUndefined()
    expect(s1.isRunning).toBe(false)
  })

  it('done 이벤트가 cache 토큰도 저장한다 (optional 필드)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      mkPayload({
        type: 'done',
        usage: { inputTokens: 100, outputTokens: 50, cacheCreationTokens: 20, cacheReadTokens: 10 },
      })
    )
    expect(s1.lastUsage?.cacheCreationTokens).toBe(20)
    expect(s1.lastUsage?.cacheReadTokens).toBe(10)
  })
})

// ── (b) sendMessage — model/effort/mode → window.api.agentRun 전달 ────────────

describe('(b) sendMessage — picker 값을 agentRun에 전달', () => {
  const mockRunId = 'r-m4'
  const mockAgentRun = vi.fn().mockResolvedValue({ runId: mockRunId })
  const mockApi = {
    agentRun: mockAgentRun,
    agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
    conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
    conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
    onAgentEvent: vi.fn().mockReturnValue(vi.fn()),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAgentRun.mockResolvedValue({ runId: mockRunId })
    Object.defineProperty(globalThis, 'window', {
      value: { api: mockApi },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('sendMessage(text, {model,effort,mode})가 agentRun에 model/effort/mode를 포함한다', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      isRunning: false,
      messages: [],
      streamingText: '',
      toolCards: [],
      errorMessage: undefined,
      workspaceRoot: '/proj',
    } as Parameters<typeof useAppStore.setState>[0])

    const sendMessage = useAppStore.getState().sendMessage
    await sendMessage('안녕', { model: 'opus', effort: 'xhigh', mode: 'auto' })

    expect(mockAgentRun).toHaveBeenCalledTimes(1)
    const callArg = mockAgentRun.mock.calls[0][0]
    expect(callArg.model).toBe('opus')
    expect(callArg.effort).toBe('xhigh')
    expect(callArg.mode).toBe('auto')
    expect(callArg.workspaceRoot).toBe('/proj')
    expect(Array.isArray(callArg.messages)).toBe(true)
  })

  it('sendMessage(text) — picker 값 미전달 시 agentRun에 model/effort/mode 없음 (하위호환)', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      isRunning: false,
      messages: [],
      streamingText: '',
      toolCards: [],
      errorMessage: undefined,
      workspaceRoot: null,
    } as Parameters<typeof useAppStore.setState>[0])

    const sendMessage = useAppStore.getState().sendMessage
    await sendMessage('hello')

    expect(mockAgentRun).toHaveBeenCalledTimes(1)
    const callArg = mockAgentRun.mock.calls[0][0]
    // 미전달 시 model/effort/mode 필드가 없거나 undefined
    expect(callArg.model).toBeUndefined()
    expect(callArg.effort).toBeUndefined()
    expect(callArg.mode).toBeUndefined()
  })
})

// ── (c) 게이지 계산 — 순수 수식 단위 ─────────────────────────────────────────

import { calcGauge } from '../../../02.Source/renderer/src/lib/gaugeCalc'
import { DEFAULT_CONTEXT_WINDOW } from '../../../02.Source/shared/ipc-contract'

describe('(c) 게이지 계산 — used / window / pct', () => {
  it('usage 없으면 used=0, pct=0', () => {
    const result = calcGauge(undefined, 'opus')
    expect(result.used).toBe(0)
    expect(result.pct).toBe(0)
    expect(result.window).toBe(1_000_000)
  })

  it('opus: 500+300 = 800 used / 1M window → pct=0 (< 1%)', () => {
    const result = calcGauge({ inputTokens: 500, outputTokens: 300 }, 'opus')
    expect(result.used).toBe(800)
    expect(result.window).toBe(1_000_000)
    expect(result.pct).toBe(0)
  })

  it('haiku: 200K window — 100K input + 100K output = 200K → pct=100', () => {
    const result = calcGauge({ inputTokens: 100_000, outputTokens: 100_000 }, 'haiku')
    expect(result.window).toBe(200_000)
    expect(result.used).toBe(200_000)
    expect(result.pct).toBe(100)
  })

  it('haiku: 50K + 50K = 100K → pct=50', () => {
    const result = calcGauge({ inputTokens: 50_000, outputTokens: 50_000 }, 'haiku')
    expect(result.pct).toBe(50)
  })

  it('미지 모델 id → DEFAULT_CONTEXT_WINDOW(1M) fallback', () => {
    const result = calcGauge({ inputTokens: 100, outputTokens: 100 }, 'unknown-model')
    expect(result.window).toBe(DEFAULT_CONTEXT_WINDOW)
    expect(result.window).toBe(1_000_000)
  })

  it('modelId undefined → DEFAULT_CONTEXT_WINDOW(1M) fallback', () => {
    const result = calcGauge({ inputTokens: 100, outputTokens: 100 }, undefined)
    expect(result.window).toBe(1_000_000)
  })

  it('pct 100 초과 방지 — used > window 시 100으로 clamp', () => {
    const result = calcGauge({ inputTokens: 1_500_000, outputTokens: 0 }, 'opus')
    expect(result.pct).toBe(100)
  })

  it('sonnet: 1M window', () => {
    const result = calcGauge({ inputTokens: 250_000, outputTokens: 250_000 }, 'sonnet')
    expect(result.window).toBe(1_000_000)
    expect(result.pct).toBe(50)
  })

  it('fable: 1M window', () => {
    const result = calcGauge({ inputTokens: 0, outputTokens: 0 }, 'fable')
    expect(result.window).toBe(1_000_000)
    expect(result.pct).toBe(0)
  })
})

// ── (d) Phase 21c — contextWindow 3rd arg ────────────────────────────────────

describe('(d) calcGauge — contextWindow 3rd arg (Phase 21c)', () => {
  it('(a) contextWindow 양수 → 모델 룩업 무시, contextWindow를 window로 사용', () => {
    // usage 50K, modelId 'opus'(1M), contextWindow 200000 → window=200000
    const result = calcGauge({ inputTokens: 25_000, outputTokens: 25_000 }, 'opus', 200_000)
    expect(result.window).toBe(200_000)
    // pct = 50000 / 200000 = 25
    expect(result.pct).toBe(25)
  })

  it('(a) contextWindow 양수 — pct는 contextWindow 기준으로 산출', () => {
    // 50K used / 200K window → 25%
    const result = calcGauge({ inputTokens: 50_000, outputTokens: 0 }, 'haiku', 200_000)
    expect(result.window).toBe(200_000)
    expect(result.pct).toBe(25)
  })

  it('(b) contextWindow undefined → MODEL_CONTEXT_WINDOW[opus]=1M (회귀)', () => {
    // contextWindow 미전달: 기존 동작과 동일해야 한다 — 2-arg 호출과 동일 결과
    const withUndefined = calcGauge({ inputTokens: 500, outputTokens: 300 }, 'opus', undefined)
    const twoArg = calcGauge({ inputTokens: 500, outputTokens: 300 }, 'opus')
    expect(withUndefined.window).toBe(twoArg.window)
    expect(withUndefined.pct).toBe(twoArg.pct)
    expect(withUndefined.window).toBe(1_000_000)
  })

  it('(b) contextWindow 미전달(2-arg) → haiku 200K fallback 그대로', () => {
    const result = calcGauge({ inputTokens: 100_000, outputTokens: 100_000 }, 'haiku')
    expect(result.window).toBe(200_000)
    expect(result.pct).toBe(100)
  })

  it('(c) contextWindow 0 → 모델 룩업 fallback (0으로 나누기 방지)', () => {
    const result = calcGauge({ inputTokens: 100, outputTokens: 100 }, 'opus', 0)
    // window=0이면 모델 룩업으로 fallback → opus=1M
    expect(result.window).toBe(1_000_000)
  })

  it('(c) contextWindow 음수 → 모델 룩업 fallback', () => {
    const result = calcGauge({ inputTokens: 100, outputTokens: 100 }, 'haiku', -1)
    // window=-1이면 fallback → haiku=200K
    expect(result.window).toBe(200_000)
  })

  it('(c) contextWindow 0이면 pct가 0 (divided-by-zero guard)', () => {
    const result = calcGauge({ inputTokens: 100, outputTokens: 100 }, 'opus', 0)
    // fallback 발동 → pct 정상 계산
    expect(result.pct).toBeGreaterThanOrEqual(0)
    expect(result.pct).toBeLessThanOrEqual(100)
  })
})

// ── (e) Phase 21c — reducer done case: lastContextWindow ─────────────────────

describe('(e) reducer — done.contextWindow → lastContextWindow (Phase 21c)', () => {
  it('done 이벤트에 contextWindow 있으면 lastContextWindow에 저장', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      mkPayload({ type: 'done', usage: { inputTokens: 100, outputTokens: 50 }, contextWindow: 200_000 })
    )
    expect(s1.lastContextWindow).toBe(200_000)
    expect(s1.lastUsage?.inputTokens).toBe(100)
  })

  it('done 이벤트에 contextWindow 없으면 lastContextWindow는 undefined', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      mkPayload({ type: 'done', usage: { inputTokens: 100, outputTokens: 50 } })
    )
    expect(s1.lastContextWindow).toBeUndefined()
    // lastUsage는 여전히 세팅돼야 한다
    expect(s1.lastUsage?.inputTokens).toBe(100)
  })

  it('done 이벤트에 usage 없고 contextWindow만 있을 때 모두 저장', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      mkPayload({ type: 'done', contextWindow: 150_000 })
    )
    expect(s1.lastContextWindow).toBe(150_000)
    expect(s1.lastUsage).toBeUndefined()
  })
})
