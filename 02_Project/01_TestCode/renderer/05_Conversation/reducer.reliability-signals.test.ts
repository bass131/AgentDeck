import { describe, it, expect } from 'vitest'
import { applyAgentEvent, makeInitialState } from '@renderer/05_Conversation/state/reducer'
import type { AppState } from '@renderer/05_Conversation/state/reducer'
import type { AgentEvent } from '@shared/agentEvents'
import type { AgentEventPayload } from '@shared/ipcContract'

const RUN = 'run-gap1-p04'

function payload(event: AgentEvent, runId = RUN): AgentEventPayload {
  return { runId, event }
}

type P04State = AppState & {
  apiRetry?: { attempt: number; maxRetries: number; retryDelayMs: number } | null
  compacting?: 'compacting' | 'requesting' | null
  sdkSessionState?: 'idle' | 'running' | 'requires_action' | null
}

describe('gap1-p04 reducer — api_retry → apiRetry 세팅', () => {
  it('api_retry 수신 → apiRetry = { attempt, maxRetries, retryDelayMs }', () => {
    const base = makeInitialState()
    const next = applyAgentEvent(
      base,
      payload({ type: 'api_retry', attempt: 2, maxRetries: 5, retryDelayMs: 2000, error: 'overloaded' })
    ) as P04State
    expect(next.apiRetry).toEqual({ attempt: 2, maxRetries: 5, retryDelayMs: 2000 })
  })

  it('초기 상태의 apiRetry는 null(미수신 기본)', () => {
    const base = makeInitialState() as P04State
    expect(base.apiRetry).toBeNull()
  })
})

describe('gap1-p04 reducer — compact(status) → compacting 세팅·null clear', () => {
  it("compact status='compacting' → compacting = 'compacting'", () => {
    const base = makeInitialState()
    const next = applyAgentEvent(
      base,
      payload({ type: 'compact', kind: 'status', status: 'compacting' })
    ) as P04State
    expect(next.compacting).toBe('compacting')
  })

  it("compact status='requesting' → compacting = 'requesting' (compacting과 별개 상태 유지)", () => {
    const base = makeInitialState()
    const next = applyAgentEvent(
      base,
      payload({ type: 'compact', kind: 'status', status: 'requesting' })
    ) as P04State
    expect(next.compacting).toBe('requesting')
    expect(next.compacting).not.toBe('compacting')
  })

  it('compact status=null → compacting = null (진행 해제 clear)', () => {
    const base = { ...makeInitialState(), compacting: 'compacting' } as P04State
    const next = applyAgentEvent(
      base,
      payload({ type: 'compact', kind: 'status', status: null })
    ) as P04State
    expect(next.compacting).toBeNull()
  })
})

// SDK 자동 압축의 켜짐·문턱을 상태에 둔다. 진행 표시(compacting)는 건드리지 않는다.
describe('reducer — compact(settings) → autoCompact', () => {
  it('settings 사건은 autoCompact를 채우고 compacting은 그대로 둔다', () => {
    const base = { ...makeInitialState(), compacting: 'compacting' } as P04State
    expect(makeInitialState().autoCompact).toBeNull()
    const next = applyAgentEvent(
      base,
      payload({ type: 'compact', kind: 'settings', autoCompactEnabled: true, thresholdTokens: 967_000 })
    ) as P04State
    expect(next.autoCompact).toEqual({ enabled: true, thresholdTokens: 967_000 })
    expect(next.compacting).toBe('compacting')
    const off = applyAgentEvent(next, payload({ type: 'compact', kind: 'settings', autoCompactEnabled: false })) as P04State
    expect(off.autoCompact).toEqual({ enabled: false })
    // 켜짐 값이 없는 settings 사건은 무시한다
    expect(applyAgentEvent(off, payload({ type: 'compact', kind: 'settings' })) as P04State).toBe(off)
  })
})

// 모델을 바꾼 뒤 턴이 끝나면 새로 잰 창이 다시 재적재 예산이 된다.
describe('reducer — done은 창을 새로 재고 contextWindowStale을 내린다', () => {
  it('done의 contextWindow로 창을 바꾸고 stale을 끈다', () => {
    expect(makeInitialState().contextWindowStale).toBe(false)
    const base = { ...makeInitialState(), lastContextWindow: 1_000_000, contextWindowStale: true, isRunning: true }
    const next = applyAgentEvent(base, payload({ type: 'done', contextWindow: 200_000 }))
    expect(next.lastContextWindow).toBe(200_000)
    expect(next.contextWindowStale).toBe(false)
  })

  it('턴 도중에 모델을 바꿨으면 그 턴의 done은 옛 모델의 창이라 stale을 유지한다', () => {
    const base = { ...makeInitialState(), lastContextWindow: 1_000_000, contextWindowStale: 'after-turn' as const, isRunning: true }
    const next = applyAgentEvent(base, payload({ type: 'done', contextWindow: 1_000_000 }))
    expect(next.contextWindowStale).toBe(true)
  })
})

describe('gap1-p04 reducer — session_state → sdkSessionState 세팅', () => {
  it("session_state 'running' → sdkSessionState = 'running'", () => {
    const base = makeInitialState()
    const next = applyAgentEvent(
      base,
      payload({ type: 'session_state', state: 'running' })
    ) as P04State
    expect(next.sdkSessionState).toBe('running')
  })

  it("session_state 'idle' → sdkSessionState = 'idle'", () => {
    const base = makeInitialState()
    const next = applyAgentEvent(
      base,
      payload({ type: 'session_state', state: 'idle' })
    ) as P04State
    expect(next.sdkSessionState).toBe('idle')
  })

  it("session_state 'requires_action' → sdkSessionState = 'requires_action'", () => {
    const base = makeInitialState()
    const next = applyAgentEvent(
      base,
      payload({ type: 'session_state', state: 'requires_action' })
    ) as P04State
    expect(next.sdkSessionState).toBe('requires_action')
  })
})

describe('gap1-p04 reducer — compact(boundary) → thread 인라인 마커 삽입', () => {
  it('compact boundary 수신 → thread에 compact 경계 마커 item 1개 추가', () => {
    const base = makeInitialState()
    const beforeLen = base.thread.length
    const next = applyAgentEvent(
      base,
      payload({ type: 'compact', kind: 'boundary', trigger: 'auto', preTokens: 150000, postTokens: 5000 })
    )
    expect(next.thread.length).toBe(beforeLen + 1)
    const marker = next.thread.find((it) => (it as { kind: string }).kind === 'compact-boundary')
    expect(marker).toBeDefined()
  })
})
