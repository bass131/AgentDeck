import { describe, it, expect } from 'vitest'
import { applyAgentEvent, makeInitialState } from '../../../02_Source/renderer/src/store/reducer'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'
import type { AgentEventPayload } from '../../../02_Source/shared/ipcContract'

const RUN = 'run-gap1-p06'

function payload(event: AgentEvent, runId = RUN): AgentEventPayload {
  return { runId, event }
}

type ThinkingItem = { kind: 'thinking'; id: string; text: string; estimatedTokens?: number }

function thinkingItems(state: ReturnType<typeof makeInitialState>): ThinkingItem[] {
  return state.thread.filter((it) => it.kind === 'thinking') as unknown as ThinkingItem[]
}

const FULL_THINKING =
  '사용자 요청을 분해했다.\n' +
  '핵심은 전문 보존과 라이브 증분 두 가지이며,\n' +
  '이 둘을 종합하면 접이식 전문 블록과 thinking_delta 스트리밍이 답이라는 결론에 도달했다.'

describe('gap1-p06 C1 reducer — thinking → thread kind:thinking 아이템(전문 보존)', () => {
  it('thinking 이벤트(전문) → thread에 {kind:thinking, id, text:전문} 아이템 존재', () => {
    const next = applyAgentEvent(makeInitialState(), payload({ type: 'thinking', text: FULL_THINKING }))
    const items = thinkingItems(next)
    expect(items).toHaveLength(1)
    expect(items[0].text).toBe(FULL_THINKING)
    expect(typeof items[0].id).toBe('string')
  })
})

describe('gap1-p06 C2 reducer — thinking_delta.text 열린 아이템에 증분 append', () => {
  it('첫 delta로 아이템 열림 + 이어지는 delta append → 단일 아이템 text 누적', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'thinking_delta', text: '조각1' }))
    s = applyAgentEvent(s, payload({ type: 'thinking_delta', text: '조각2' }))
    const items = thinkingItems(s)
    expect(items).toHaveLength(1)
    expect(items[0].text).toBe('조각1조각2')
  })

  it('thinking(전문)로 연 아이템에도 이후 delta가 같은 아이템에 이어붙는다(새 아이템 미생성)', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'thinking', text: 'BASE' }))
    s = applyAgentEvent(s, payload({ type: 'thinking_delta', text: '조각1' }))
    s = applyAgentEvent(s, payload({ type: 'thinking_delta', text: '조각2' }))
    const items = thinkingItems(s)
    expect(items).toHaveLength(1)
    expect(items[0].text).toBe('BASE조각1조각2')
  })
})

describe('gap1-p06 C3 reducer — thinking_delta.estimatedTokens 진행 표시 fallback', () => {
  it('텍스트 없이 estimatedTokens만 → thinking 아이템에 estimatedTokens 반영(placeholder 생성)', () => {
    const next = applyAgentEvent(makeInitialState(), payload({ type: 'thinking_delta', estimatedTokens: 1234 }))
    const items = thinkingItems(next)
    expect(items).toHaveLength(1)
    expect(items[0].estimatedTokens).toBe(1234)
  })

  it('열린 thinking 아이템에 estimatedTokens 갱신 — text는 불변(토큰만 진행)', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'thinking_delta', text: '생각조각' }))
    s = applyAgentEvent(s, payload({ type: 'thinking_delta', estimatedTokens: 1234 }))
    const items = thinkingItems(s)
    expect(items).toHaveLength(1)
    expect(items[0].text).toBe('생각조각')
    expect(items[0].estimatedTokens).toBe(1234)
  })
})
