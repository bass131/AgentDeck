import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { applyAgentEvent, makeInitialState } from '@renderer/05_Conversation/state/reducer'
import type { AgentEventPayload } from '@shared/ipcContract'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

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

describe('(b) sendMessage — picker 값을 agentRun에 전달', () => {
  const mockRunId = 'r-m4'
  const mockAgentRun = vi.fn().mockResolvedValue({ runId: mockRunId })
  const mockApi = {
    agentRun: mockAgentRun,
    agentAbort: vi.fn().mockResolvedValue({ ok: true }),
    conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
    conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
    onAgentEvent: vi.fn().mockReturnValue(vi.fn()),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAgentRun.mockResolvedValue({ runId: mockRunId })
    Object.defineProperty(globalThis, 'window', {
      value: { api: adaptFlatApi(mockApi) },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('sendMessage(text, {model,effort,mode})가 agentRun에 model/effort/mode를 포함한다', async () => {
    const { useAppStore } = await import('@renderer/00_App/appStore')
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
    const { useAppStore } = await import('@renderer/00_App/appStore')
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
    expect(callArg.model).toBeUndefined()
    expect(callArg.effort).toBeUndefined()
    expect(callArg.mode).toBeUndefined()
  })
})

import { calcGauge } from '@renderer/03_Agent/gaugeCalc'
import { DEFAULT_CONTEXT_WINDOW } from '@shared/ipcContract'

describe('(c) 게이지 계산 — used / window / pct', () => {
  // 첫 턴 전에는 기본값 하나, 턴 뒤에는 결과의 contextWindow다.
  it('usage 없으면 used=0, pct=0, 창은 기본값', () => {
    const result = calcGauge(undefined)
    expect(result.used).toBe(0)
    expect(result.pct).toBe(0)
    expect(result.window).toBe(DEFAULT_CONTEXT_WINDOW)
  })

  it('첫 턴 전: 500+300 = 800 used / 기본 1M → pct=0 (< 1%)', () => {
    const result = calcGauge({ inputTokens: 500, outputTokens: 300 })
    expect(result.used).toBe(800)
    expect(result.window).toBe(1_000_000)
    expect(result.pct).toBe(0)
  })

  it('pct 100 초과 방지 — used > window 시 100으로 clamp', () => {
    const result = calcGauge({ inputTokens: 1_500_000, outputTokens: 0 })
    expect(result.pct).toBe(100)
  })
})

describe('(d) calcGauge — 턴 결과의 contextWindow', () => {
  it('contextWindow 양수 → 그 값을 창으로 쓴다', () => {
    const result = calcGauge({ inputTokens: 25_000, outputTokens: 25_000 }, 200_000)
    expect(result.window).toBe(200_000)
    expect(result.pct).toBe(25)
  })

  it('200K 창 — 100K + 100K = 200K → pct=100', () => {
    const result = calcGauge({ inputTokens: 100_000, outputTokens: 100_000 }, 200_000)
    expect(result.pct).toBe(100)
  })

  it('contextWindow undefined → 기본값', () => {
    expect(calcGauge({ inputTokens: 500, outputTokens: 300 }, undefined).window).toBe(DEFAULT_CONTEXT_WINDOW)
  })

  it('contextWindow 0·음수 → 기본값 (0으로 나누기 방지)', () => {
    expect(calcGauge({ inputTokens: 100, outputTokens: 100 }, 0).window).toBe(1_000_000)
    expect(calcGauge({ inputTokens: 100, outputTokens: 100 }, -1).window).toBe(1_000_000)
    const r = calcGauge({ inputTokens: 100, outputTokens: 100 }, 0)
    expect(r.pct).toBeGreaterThanOrEqual(0)
    expect(r.pct).toBeLessThanOrEqual(100)
  })
})

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
