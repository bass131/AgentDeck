/**
 * tg1-p02-thinking-elapsed-store.test.ts — 사고 경과 시간 데이터 토대 (TG1 P02, TDD RED 선행).
 *
 * 목표: 한 줄 상태 라인의 "경과 초"(렌더는 P04 몫)에 필요한 store 데이터 토대를 못박는다.
 *   (1) 사고 시작 시 AppState.thinkingStartedAt에 주입된 nowMs가 기록되는지.
 *   (2) 열린 사고 블록이 이어지는 동안(전문 재확정 thinking / thinking_delta 증분)은
 *       시작점이 재설정되지 않는지 — estimatedTokens 런닝 토탈과 동일 수명(둘 다 "열린
 *       아이템" 개념에 묶여 있다, reducer/text.ts handleThinking/handleThinkingDelta 참조).
 *   (3) 한 턴 안에서 사고 블록이 tool_call로 닫히고 다시 열리면(멀티 사고 블록) 새 블록은
 *       새 시작점을 얻는지(estimatedTokens가 새 아이템에서 리셋되는 것과 동일 수명).
 *   (4) 답변 시작(handleText, 턴 경계) · thinking_clear에서 thinkingStartedAt이 null로
 *       리셋되는지 — thinkingText 리셋 지점과 정합(reducer/text.ts:115, handleThinkingClear).
 *   (5) 경과 초 파생 순수 헬퍼(computeThinkingElapsedSeconds, store/thinkingElapsed.ts)가
 *       주입된 nowMs 기준으로 올바르게 계산되는지.
 *   (6) reviewer 🟡 봉합 회귀 고정 — done 이벤트 리셋 + nowMs 미주입 시 0(epoch 1970) 대신
 *       null 기록 + computeThinkingElapsedSeconds<=0 방어(거대 경과값 방지, 이중 방어).
 *
 * 결정론: 순수 리듀서(window.api/fs/네트워크/타이머 0). Date.now() 직접 호출 0 — 테스트가
 * nowMs를 전부 주입해 고정한다(applyAgentEvent 4번째 인자 — 기존 BL1 P03 nowMs 관례 재사용).
 */
import { describe, it, expect } from 'vitest'
import { applyAgentEvent, makeInitialState } from '../../../02.Source/renderer/src/store/reducer'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

const RUN = 'run-tg1-p02'

function payload(event: AgentEvent, runId = RUN): AgentEventPayload {
  return { runId, event }
}

/** thread의 thinking 아이템(+estimatedTokens 뷰, gap1-p06 test와 동일 관례). */
type ThinkingItem = { kind: 'thinking'; id: string; text: string; estimatedTokens?: number }

function thinkingItems(state: ReturnType<typeof makeInitialState>): ThinkingItem[] {
  return state.thread.filter((it) => it.kind === 'thinking') as unknown as ThinkingItem[]
}

function toolCallEvt(id: string): AgentEvent {
  return { type: 'tool_call', id, name: 'bash', input: {} }
}

// ── 초기 상태 ────────────────────────────────────────────────────────────────────

describe('tg1-p02 — makeInitialState', () => {
  it('thinkingStartedAt 기본값 = null(활동 신호 아직 없음)', () => {
    expect(makeInitialState().thinkingStartedAt).toBeNull()
  })
})

// ── (1) 사고 시작 timestamp 기록 ─────────────────────────────────────────────────

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

// ── (2) 열린 블록 continuation — 시작점 불변 ─────────────────────────────────────

describe('tg1-p02 (2) — 열린 사고 블록이 이어지는 동안 시작점 불변', () => {
  it('열린 아이템에 전문 재확정(thinking)이 다시 와도 시작점 불변', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'thinking', text: 'BASE' }), undefined, 1000)
    s = applyAgentEvent(s, payload({ type: 'thinking', text: 'BASE-갱신' }), undefined, 5000)
    expect(s.thinkingStartedAt).toBe(1000)
    // 열린 아이템은 여전히 1개(새 아이템 생성 아님) — continuation 확인.
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

// ── (3) 멀티 사고 블록(한 턴 내 tool_call로 닫힘) — 새 블록은 새 시작점 ────────────

describe('tg1-p02 (3) — 한 턴 안 멀티 사고 블록: 새 블록은 새 시작점(estimatedTokens와 동일 수명)', () => {
  it('사고 → tool_call(블록 닫힘) → 사고 재시작 → thinkingStartedAt이 두번째 nowMs로 리셋', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'thinking', text: '블록1' }), undefined, 1000)
    expect(s.thinkingStartedAt).toBe(1000)

    s = applyAgentEvent(s, payload(toolCallEvt('tool-1')), undefined, 3000)
    s = applyAgentEvent(s, payload({ type: 'thinking', text: '블록2' }), undefined, 7000)

    expect(s.thinkingStartedAt).toBe(7000)
    // 새 블록 = 새 thread 아이템(기존 블록1과 별개) — 멀티 블록 확인.
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

// ── (4) 리셋 — 답변 시작(턴 경계) / thinking_clear ───────────────────────────────

describe('tg1-p02 (4) — thinkingStartedAt 리셋(thinkingText 리셋 지점과 정합)', () => {
  it('답변 시작(text 이벤트, handleText:115 리셋 지점)에서 thinkingStartedAt=null', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'thinking', text: '사고' }), undefined, 1000)
    expect(s.thinkingStartedAt).toBe(1000)

    s = applyAgentEvent(s, payload({ type: 'text', delta: '답변 시작' }))
    expect(s.thinkingStartedAt).toBeNull()
    // 동일 지점에서 thinkingText도 함께 리셋(정합 확인).
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

// ── (5) 경과 초 파생 순수 헬퍼 ────────────────────────────────────────────────────

describe('tg1-p02 (5) — computeThinkingElapsedSeconds(store/thinkingElapsed.ts) 순수 함수', () => {
  it('thinkingStartedAt=null → null(사고 중 아님, 판정 불가)', async () => {
    const { computeThinkingElapsedSeconds } = await import(
      '../../../02.Source/renderer/src/store/thinkingElapsed'
    )
    expect(computeThinkingElapsedSeconds(null, 999)).toBeNull()
  })

  it('경과 시간을 초 단위로 내림(floor) 계산', async () => {
    const { computeThinkingElapsedSeconds } = await import(
      '../../../02.Source/renderer/src/store/thinkingElapsed'
    )
    expect(computeThinkingElapsedSeconds(1000, 1000)).toBe(0)
    expect(computeThinkingElapsedSeconds(1000, 4500)).toBe(3)
    expect(computeThinkingElapsedSeconds(1000, 3999)).toBe(2)
  })

  it('nowMs가 시작점보다 앞서면(시계 역전 방어) 음수 대신 0', async () => {
    const { computeThinkingElapsedSeconds } = await import(
      '../../../02.Source/renderer/src/store/thinkingElapsed'
    )
    expect(computeThinkingElapsedSeconds(1000, 900)).toBe(0)
  })

  // 🟡2 봉합(reviewer): startedAt<=0(epoch 1970 근방 오염값)도 null과 동등 취급 —
  // "약 55년 경과" 같은 거대값이 렌더에 노출되지 않도록 이중 방어.
  it('thinkingStartedAt<=0(0 또는 음수)이면 null(거대 경과값 방지)', async () => {
    const { computeThinkingElapsedSeconds } = await import(
      '../../../02.Source/renderer/src/store/thinkingElapsed'
    )
    expect(computeThinkingElapsedSeconds(0, 2_000_000_000_000)).toBeNull()
    expect(computeThinkingElapsedSeconds(-1, 1000)).toBeNull()
  })
})

// ── (6) 🟡2 봉합 — done 이벤트 리셋 + nowMs 미주입 시 null 기록 ───────────────────

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
      '../../../02.Source/renderer/src/store/thinkingElapsed'
    )
    let s = makeInitialState()
    // nowMs 인자 자체를 생략 — applyAgentEvent(state, payload, time) 3-arg 호출.
    s = applyAgentEvent(s, payload({ type: 'thinking', text: '사고(nowMs 없음)' }))
    expect(s.thinkingStartedAt).toBeNull()
    expect(s.thinkingStartedAt).not.toBe(0)
    expect(computeThinkingElapsedSeconds(s.thinkingStartedAt, 2_000_000_000_000)).toBeNull()
  })
})
