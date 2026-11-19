import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '@shared/agentEvents'
import { MAX_SESSION_EVENTS, appendSessionEvent } from '@shared/13_Loop/sessionMerge'

const text = (delta: string, messageId?: string): AgentEvent => ({ type: 'text', delta, ...(messageId !== undefined ? { messageId } : {}) })
const tool = (id: string): AgentEvent => ({ type: 'tool_call', id, name: 'Read', input: { file_path: 'a.ts' } })

describe('세션 사건 잇기 — main과 화면이 같이 쓴다 (M10 G4 검수 1)', () => {
  it('이어진 글자 조각과 사고 조각은 한 사건으로 합치고, 앞 배열과 앞 사건은 바꾸지 않는다', () => {
    const first = [text('안', 'm1')]
    const a = appendSessionEvent(first, text('녕', 'm1'), 10)
    expect(a.events).toEqual([text('안녕', 'm1')])
    expect(first).toEqual([text('안', 'm1')])
    const b = appendSessionEvent(a.events, text('다른', 'm2'), 10)
    expect(b.events).toHaveLength(2)
    const c = appendSessionEvent(appendSessionEvent(b.events, { type: 'thinking_delta', text: '생' }, 10).events, { type: 'thinking_delta', text: '각', estimatedTokens: 7 }, 10)
    expect(c.events.at(-1)).toEqual({ type: 'thinking_delta', text: '생각', estimatedTokens: 7 })
    expect(c.truncated).toBe(false)
  })

  it('상한을 넘으면 앞부분을 잘라 내고 잘렸다고 알린다 — 기본 상한은 main의 세션 기록 상한과 같다', () => {
    let events: AgentEvent[] = []
    let truncated = false
    for (let i = 0; i < 5; i++) {
      const r = appendSessionEvent(events, tool(`t${i}`), 3)
      events = r.events
      truncated ||= r.truncated
    }
    expect(events.map((e) => (e as { id: string }).id)).toEqual(['t2', 't3', 't4'])
    expect(truncated).toBe(true)
    expect(MAX_SESSION_EVENTS).toBe(4000)
  })
})
