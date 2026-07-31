import { describe, it, expect } from 'vitest'
import { applyAgentEvent, makeInitialState } from '../../../02_Source/renderer/src/store/reducer'
import type { AppState } from '../../../02_Source/renderer/src/store/reducer'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'
import type { AgentEventPayload } from '../../../02_Source/shared/ipcContract'

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
