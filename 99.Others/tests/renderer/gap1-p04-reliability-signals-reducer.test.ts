/**
 * gap1-p04-reliability-signals-reducer.test.ts — GAP1 P04 renderer reducer 디스패치 (TDD RED)
 *
 * 목표: applyAgentEvent(store/reducer.ts)가 신규 3 이벤트(api_retry·compact·session_state)를
 *   소비해 AppState 필드로 반영하는지 못박는다. 구현은 후속 renderer Worker 몫 — 이 파일은
 *   store-shape 계약(coordinator 고정 필드명)을 RED로 먼저 둔다.
 *
 * store-shape 계약(필드명 고정 — renderer가 이 이름으로 구현):
 *   apiRetry        : { attempt; maxRetries; retryDelayMs } | null   (api_retry 수신 시 세팅)
 *   compacting      : 'compacting' | 'requesting' | null             (compact kind:status 반영·null clear)
 *   sdkSessionState : 'idle' | 'running' | 'requires_action' | null  (session_state 반영)
 *   compact(kind:'boundary') → thread에 인라인 경계 마커 item 1개 삽입
 *     (thread item kind 이름은 renderer 확정 시 보정 — 우선 'compact-boundary' 가정으로 RED)
 *
 * 현재(RED) 이유: AppState에 위 필드가 없고 applyAgentEvent 디스패처에 case가 없어
 *   default 분기(state 불변 반환)로 떨어진다 — 신규 필드는 undefined로 남는다.
 *
 * 결정론: 순수 리듀서 + window.api 모킹(fs/네트워크/타이머 0). nowMs 미전달(활동 스탬프 무영향).
 */
import { describe, it, expect } from 'vitest'
import { applyAgentEvent, makeInitialState } from '../../../02.Source/renderer/src/store/reducer'
import type { AppState } from '../../../02.Source/renderer/src/store/reducer'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

const RUN = 'run-gap1-p04'

function payload(event: AgentEvent, runId = RUN): AgentEventPayload {
  return { runId, event }
}

/**
 * P04 store-shape 계약 필드를 얹은 확장 뷰. AppState에 아직 필드가 없어(RED) 타입상 optional로
 * 선언하고, 런타임에서 undefined(미구현) → 값(구현 후)으로 전이하는지 단정한다.
 */
type P04State = AppState & {
  apiRetry?: { attempt: number; maxRetries: number; retryDelayMs: number } | null
  compacting?: 'compacting' | 'requesting' | null
  sdkSessionState?: 'idle' | 'running' | 'requires_action' | null
}

// ── api_retry → apiRetry 필드 ────────────────────────────────────────────────────

describe('gap1-p04 reducer — api_retry → apiRetry 세팅', () => {
  it('api_retry 수신 → apiRetry = { attempt, maxRetries, retryDelayMs }', () => {
    const base = makeInitialState()
    const next = applyAgentEvent(
      base,
      payload({ type: 'api_retry', attempt: 2, maxRetries: 5, retryDelayMs: 2000, error: 'overloaded' })
    ) as P04State
    // RED: 현재 applyAgentEvent에 api_retry case 없음 → default(state 불변) → apiRetry undefined.
    expect(next.apiRetry).toEqual({ attempt: 2, maxRetries: 5, retryDelayMs: 2000 })
  })

  it('초기 상태의 apiRetry는 null(미수신 기본)', () => {
    // 구현 시 makeInitialState가 apiRetry:null을 포함해야 한다(수신 전 기본).
    const base = makeInitialState() as P04State
    // RED: 현재 makeInitialState에 apiRetry 필드 없음 → undefined.
    expect(base.apiRetry).toBeNull()
  })
})

// ── compact(kind:'status') → compacting 필드 (null clear 포함) ────────────────────

describe('gap1-p04 reducer — compact(status) → compacting 세팅·null clear', () => {
  it("compact status='compacting' → compacting = 'compacting'", () => {
    const base = makeInitialState()
    const next = applyAgentEvent(
      base,
      payload({ type: 'compact', kind: 'status', status: 'compacting' })
    ) as P04State
    // RED: compact case 없음 → compacting undefined.
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
    // 선행: compacting이 이미 켜진 상태에서 null 이벤트가 오면 해제돼야 한다.
    const base = { ...makeInitialState(), compacting: 'compacting' } as P04State
    const next = applyAgentEvent(
      base,
      payload({ type: 'compact', kind: 'status', status: null })
    ) as P04State
    // RED: compact case 없음 → compacting이 'compacting'인 채로 남아 clear 실패.
    expect(next.compacting).toBeNull()
  })
})

// ── session_state → sdkSessionState 필드 ─────────────────────────────────────────

describe('gap1-p04 reducer — session_state → sdkSessionState 세팅', () => {
  it("session_state 'running' → sdkSessionState = 'running'", () => {
    const base = makeInitialState()
    const next = applyAgentEvent(
      base,
      payload({ type: 'session_state', state: 'running' })
    ) as P04State
    // RED: session_state case 없음 → sdkSessionState undefined.
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

// ── compact(kind:'boundary') → thread 인라인 경계 마커 ────────────────────────────

describe('gap1-p04 reducer — compact(boundary) → thread 인라인 마커 삽입', () => {
  it('compact boundary 수신 → thread에 compact 경계 마커 item 1개 추가', () => {
    const base = makeInitialState()
    const beforeLen = base.thread.length
    const next = applyAgentEvent(
      base,
      payload({ type: 'compact', kind: 'boundary', trigger: 'auto', preTokens: 150000, postTokens: 5000 })
    )
    // RED: compact case 없음 → thread 불변(마커 미삽입).
    expect(next.thread.length).toBe(beforeLen + 1)
    // thread item kind 이름은 renderer 확정 시 보정 — 우선 'compact-boundary' 가정.
    const marker = next.thread.find((it) => (it as { kind: string }).kind === 'compact-boundary')
    expect(marker).toBeDefined()
  })
})
