import { describe, it, expect } from 'vitest'
import { applyAgentEvent, makeInitialState } from '../../../02_Source/renderer/src/store/reducer'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'
import type { AgentEventPayload } from '../../../02_Source/shared/ipcContract'

const RUN = 'run-tg1-p02'

function payload(event: AgentEvent, runId = RUN): AgentEventPayload {
  return { runId, event }
}

type ThinkingItem = { kind: 'thinking'; id: string; text: string; estimatedTokens?: number }

function thinkingItems(state: ReturnType<typeof makeInitialState>): ThinkingItem[] {
  return state.thread.filter((it) => it.kind === 'thinking') as unknown as ThinkingItem[]
}

function toolCallEvt(id: string): AgentEvent {
  return { type: 'tool_call', id, name: 'bash', input: {} }
}

describe('tg1-p02 — makeInitialState', () => {
  it('thinkingStartedAt 기본값 = null(활동 신호 아직 없음)', () => {
    expect(makeInitialState().thinkingStartedAt).toBeNull()
  })
})

describe('tg1-p02 (1) — 사고 시작 시 thinkingStartedAt 기록', () => {
  it('thinking 이벤트(새 블록) + nowMs 주입 → thinkingStartedAt=nowMs', () => {
    const next = applyAgentEvent(
      makeInitialState(),
      payload({ type: 'thinking', text: '사고 시작' }),
      undefined,
      1000,
    )
    expect(next.thinkingStartedAt).toBe(1000)
  })

  it('thinking_delta로 먼저 열리는 경우(선행 thinking 이벤트 없음)도 시작점 기록', () => {
    const next = applyAgentEvent(
      makeInitialState(),
      payload({ type: 'thinking_delta', text: '조각1' }),
      undefined,
      2000,
    )
    expect(next.thinkingStartedAt).toBe(2000)
  })
})

describe('tg1-p02 (2) — 열린 사고 블록이 이어지는 동안 시작점 불변', () => {
  it('열린 아이템에 전문 재확정(thinking)이 다시 와도 시작점 불변', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'thinking', text: 'BASE' }), undefined, 1000)
    s = applyAgentEvent(s, payload({ type: 'thinking', text: 'BASE-갱신' }), undefined, 5000)
    expect(s.thinkingStartedAt).toBe(1000)
    expect(thinkingItems(s)).toHaveLength(1)
  })

  it('열린 아이템에 thinking_delta 증분이 이어져도 시작점 불변', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'thinking_delta', text: '조각1' }), undefined, 2000)
    s = applyAgentEvent(s, payload({ type: 'thinking_delta', text: '조각2' }), undefined, 9000)
    expect(s.thinkingStartedAt).toBe(2000)
    expect(thinkingItems(s)).toHaveLength(1)
  })

  it('thinking(전문)로 연 아이템에 이후 delta가 이어져도 시작점 불변', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'thinking', text: 'BASE' }), undefined, 1000)
    s = applyAgentEvent(s, payload({ type: 'thinking_delta', text: '조각1' }), undefined, 6000)
    expect(s.thinkingStartedAt).toBe(1000)
  })
})

describe('tg1-p02 (3) — 한 턴 안 멀티 사고 블록: 새 블록은 새 시작점(estimatedTokens와 동일 수명)', () => {
  it('사고 → tool_call(블록 닫힘) → 사고 재시작 → thinkingStartedAt이 두번째 nowMs로 리셋', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'thinking', text: '블록1' }), undefined, 1000)
    expect(s.thinkingStartedAt).toBe(1000)

    s = applyAgentEvent(s, payload(toolCallEvt('tool-1')), undefined, 3000)
    s = applyAgentEvent(s, payload({ type: 'thinking', text: '블록2' }), undefined, 7000)

    expect(s.thinkingStartedAt).toBe(7000)
    expect(thinkingItems(s)).toHaveLength(2)
  })

  it('estimatedTokens도 새 블록에서 상속되지 않고(리셋) 시작점과 동일 수명', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'thinking_delta', estimatedTokens: 500 }), undefined, 1000)
    expect(thinkingItems(s)[0].estimatedTokens).toBe(500)
    expect(s.thinkingStartedAt).toBe(1000)

    s = applyAgentEvent(s, payload(toolCallEvt('tool-2')), undefined, 3000)
    s = applyAgentEvent(s, payload({ type: 'thinking_delta', text: '블록2' }), undefined, 9000)

    const items = thinkingItems(s)
    expect(items).toHaveLength(2)
    expect(items[1].estimatedTokens).toBeUndefined()
    expect(s.thinkingStartedAt).toBe(9000)
  })
})

describe('tg1-p02 (4) — thinkingStartedAt 리셋(thinkingText 리셋 지점과 정합)', () => {
  it('답변 시작(text 이벤트, handleText:115 리셋 지점)에서 thinkingStartedAt=null', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'thinking', text: '사고' }), undefined, 1000)
    expect(s.thinkingStartedAt).toBe(1000)

    s = applyAgentEvent(s, payload({ type: 'text', delta: '답변 시작' }))
    expect(s.thinkingStartedAt).toBeNull()
    expect(s.thinkingText).toBeNull()
  })

  it('thinking_clear 이벤트에서 thinkingStartedAt=null', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'thinking', text: '사고' }), undefined, 1000)
    expect(s.thinkingStartedAt).toBe(1000)

    s = applyAgentEvent(s, payload({ type: 'thinking_clear' }))
    expect(s.thinkingStartedAt).toBeNull()
    expect(s.thinkingText).toBeNull()
  })

  it('리셋 이후 새 턴에서 사고가 다시 시작되면 새 시작점을 얻는다', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'thinking', text: '턴1 사고' }), undefined, 1000)
    s = applyAgentEvent(s, payload({ type: 'text', delta: '턴1 답변' }))
    expect(s.thinkingStartedAt).toBeNull()

    s = applyAgentEvent(s, payload({ type: 'thinking', text: '턴2 사고' }), undefined, 50_000)
    expect(s.thinkingStartedAt).toBe(50_000)
  })
})

describe('tg1-p02 (5) — computeThinkingElapsedSeconds(store/thinkingElapsed.ts) 순수 함수', () => {
  it('thinkingStartedAt=null → null(사고 중 아님, 판정 불가)', async () => {
    const { computeThinkingElapsedSeconds } = await import(
      '../../../02_Source/renderer/src/store/thinkingElapsed'
    )
    expect(computeThinkingElapsedSeconds(null, 999)).toBeNull()
  })

  it('경과 시간을 초 단위로 내림(floor) 계산', async () => {
    const { computeThinkingElapsedSeconds } = await import(
      '../../../02_Source/renderer/src/store/thinkingElapsed'
    )
    expect(computeThinkingElapsedSeconds(1000, 1000)).toBe(0)
    expect(computeThinkingElapsedSeconds(1000, 4500)).toBe(3)
    expect(computeThinkingElapsedSeconds(1000, 3999)).toBe(2)
  })

  it('nowMs가 시작점보다 앞서면(시계 역전 방어) 음수 대신 0', async () => {
    const { computeThinkingElapsedSeconds } = await import(
      '../../../02_Source/renderer/src/store/thinkingElapsed'
    )
    expect(computeThinkingElapsedSeconds(1000, 900)).toBe(0)
  })

  it('thinkingStartedAt<=0(0 또는 음수)이면 null(거대 경과값 방지)', async () => {
    const { computeThinkingElapsedSeconds } = await import(
      '../../../02_Source/renderer/src/store/thinkingElapsed'
    )
    expect(computeThinkingElapsedSeconds(0, 2_000_000_000_000)).toBeNull()
    expect(computeThinkingElapsedSeconds(-1, 1000)).toBeNull()
  })
})

describe('tg1-p02 (6) — reviewer 🟡 봉합 회귀 고정', () => {
  it('done 이벤트(턴 종료) → thinkingStartedAt=null(라이프사이클 리셋 고정)', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'thinking', text: '사고' }), undefined, 1000)
    expect(s.thinkingStartedAt).toBe(1000)

    s = applyAgentEvent(s, payload({ type: 'done' }))
    expect(s.thinkingStartedAt).toBeNull()
  })

  it('nowMs 미주입(undefined) 시 thinkingStartedAt은 0이 아니라 null로 기록되고, ' +
    'computeThinkingElapsedSeconds도 null을 반환한다(거대 경과값 없음)', async () => {
    const { computeThinkingElapsedSeconds } = await import(
      '../../../02_Source/renderer/src/store/thinkingElapsed'
    )
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'thinking', text: '사고(nowMs 없음)' }))
    expect(s.thinkingStartedAt).toBeNull()
    expect(s.thinkingStartedAt).not.toBe(0)
    expect(computeThinkingElapsedSeconds(s.thinkingStartedAt, 2_000_000_000_000)).toBeNull()
  })
})
