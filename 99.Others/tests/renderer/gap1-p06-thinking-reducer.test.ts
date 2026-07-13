/**
 * gap1-p06-thinking-reducer.test.ts — GAP1 P06 renderer reducer 확장 사고 소비 (TDD RED)
 *
 * 목표: applyAgentEvent(store/reducer.ts)가
 *   (C1) thinking 이벤트를 휘발 thinkingText가 아니라 thread에 kind:'thinking' 아이템으로
 *        전문 보존하고,
 *   (C2) thinking_delta.text를 열린 thinking 아이템에 라이브 증분 누적하고,
 *   (C3) 텍스트 없이 estimatedTokens만 오는 redacted 구간에서 진행 표시용 estimatedTokens를
 *        thinking 아이템에 반영하는지 못박는다. 구현은 후속 renderer Worker 몫 — 이 파일은
 *        coordinator가 확정한 store/thread-item shape(Design A)를 RED로 먼저 고정한다.
 *
 * thread-item shape 계약(필드명 고정 — renderer가 이 이름으로 구현):
 *   thinking 아이템 = { kind:'thinking'; id: string; text: string; estimatedTokens?: number }
 *     (threadTypes.ts의 기존 thinking 아이템에 estimatedTokens 필드 additive)
 *   - thinking 이벤트 → 이 아이템 생성(전문 text 보존)
 *   - thinking_delta.text → 열린 thinking 아이템 text에 증분 append(첫 delta면 아이템 생성)
 *   - thinking_delta.estimatedTokens(텍스트 없음) → 열린 thinking 아이템에 estimatedTokens 세팅
 *     (열린 아이템 없으면 placeholder 아이템 생성 — redacted 진행 표시 fallback)
 *
 * 현재(RED) 이유:
 *   - C1: handleThinking(reducer/text.ts)이 휘발 thinkingText만 세팅, thread에 미삽입.
 *   - C2/C3: applyAgentEvent 디스패처에 'thinking_delta' case 없음 → default(state 불변)로 낙하.
 *
 * 결정론: 순수 리듀서(window.api/fs/네트워크/타이머 0). nowMs 미전달(활동 스탬프 무영향).
 */
import { describe, it, expect } from 'vitest'
import { applyAgentEvent, makeInitialState } from '../../../02.Source/renderer/src/store/reducer'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

const RUN = 'run-gap1-p06'

function payload(event: AgentEvent, runId = RUN): AgentEventPayload {
  return { runId, event }
}

/** thread의 thinking 아이템(+P06 additive estimatedTokens 뷰). */
type ThinkingItem = { kind: 'thinking'; id: string; text: string; estimatedTokens?: number }

function thinkingItems(state: ReturnType<typeof makeInitialState>): ThinkingItem[] {
  return state.thread.filter((it) => it.kind === 'thinking') as unknown as ThinkingItem[]
}

// 전문 보존 검증용 — 90자 초과·개행 포함(백엔드 A1이 절단 없이 넘긴 전문을 reducer가
// 그대로 아이템 text로 보존하는지 확인. reducer는 text를 변형하지 않아야 한다).
const FULL_THINKING =
  '사용자 요청을 분해했다.\n' +
  '핵심은 전문 보존과 라이브 증분 두 가지이며,\n' +
  '이 둘을 종합하면 접이식 전문 블록과 thinking_delta 스트리밍이 답이라는 결론에 도달했다.'

// ── C1. thinking → thread item (전문 보존) ─────────────────────────────────────────

describe('gap1-p06 C1 reducer — thinking → thread kind:thinking 아이템(전문 보존)', () => {
  it('thinking 이벤트(전문) → thread에 {kind:thinking, id, text:전문} 아이템 존재', () => {
    const next = applyAgentEvent(makeInitialState(), payload({ type: 'thinking', text: FULL_THINKING }))
    const items = thinkingItems(next)
    // RED: 현재 handleThinking은 휘발 thinkingText만 세팅 → thread에 thinking 아이템 없음.
    expect(items).toHaveLength(1)
    expect(items[0].text).toBe(FULL_THINKING)
    expect(typeof items[0].id).toBe('string')
  })
})

// ── C2. thinking_delta.text 라이브 증분 누적 ────────────────────────────────────────

describe('gap1-p06 C2 reducer — thinking_delta.text 열린 아이템에 증분 append', () => {
  it('첫 delta로 아이템 열림 + 이어지는 delta append → 단일 아이템 text 누적', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'thinking_delta', text: '조각1' }))
    s = applyAgentEvent(s, payload({ type: 'thinking_delta', text: '조각2' }))
    const items = thinkingItems(s)
    // RED: 디스패처에 thinking_delta case 없음 → default(state 불변) → thinking 아이템 0개.
    expect(items).toHaveLength(1)
    expect(items[0].text).toBe('조각1조각2')
  })

  it('thinking(전문)로 연 아이템에도 이후 delta가 같은 아이템에 이어붙는다(새 아이템 미생성)', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'thinking', text: 'BASE' }))
    s = applyAgentEvent(s, payload({ type: 'thinking_delta', text: '조각1' }))
    s = applyAgentEvent(s, payload({ type: 'thinking_delta', text: '조각2' }))
    const items = thinkingItems(s)
    // RED: C1(아이템 생성) + C2(delta append) 둘 다 미구현 → 누적 실패.
    expect(items).toHaveLength(1)
    expect(items[0].text).toBe('BASE조각1조각2')
  })
})

// ── C3. estimatedTokens 진행 fallback (redacted 구간) ───────────────────────────────

describe('gap1-p06 C3 reducer — thinking_delta.estimatedTokens 진행 표시 fallback', () => {
  it('텍스트 없이 estimatedTokens만 → thinking 아이템에 estimatedTokens 반영(placeholder 생성)', () => {
    const next = applyAgentEvent(makeInitialState(), payload({ type: 'thinking_delta', estimatedTokens: 1234 }))
    const items = thinkingItems(next)
    // RED: thinking_delta case 없음 → 아이템 미생성 → estimatedTokens 반영 안 됨.
    expect(items).toHaveLength(1)
    expect(items[0].estimatedTokens).toBe(1234)
  })

  it('열린 thinking 아이템에 estimatedTokens 갱신 — text는 불변(토큰만 진행)', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'thinking_delta', text: '생각조각' }))
    s = applyAgentEvent(s, payload({ type: 'thinking_delta', estimatedTokens: 1234 }))
    const items = thinkingItems(s)
    // RED: thinking_delta case 없음 → 아이템·토큰 모두 미반영.
    expect(items).toHaveLength(1)
    expect(items[0].text).toBe('생각조각')
    expect(items[0].estimatedTokens).toBe(1234)
  })
})
