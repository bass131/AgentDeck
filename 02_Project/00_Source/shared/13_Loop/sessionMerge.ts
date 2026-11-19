import type { AgentEvent } from '../agentEvents'

export const MAX_SESSION_EVENTS = 4000

type TextEvent = Extract<AgentEvent, { type: 'text' }>
type ThinkingDelta = Extract<AgentEvent, { type: 'thinking_delta' }>

// 조각을 하나씩 세면 사건 수 상한이 세션 앞부분을 먼저 지운다. 이미 준 배열을 바꾸지 않도록 새 객체로 돌려준다
function merged(prev: AgentEvent | undefined, ev: AgentEvent): AgentEvent | null {
  if (!prev) return null
  if (prev.type === 'text' && ev.type === 'text') {
    if (prev.messageId !== ev.messageId || prev.parentToolId !== ev.parentToolId) return null
    const out: TextEvent = { ...prev, delta: prev.delta + ev.delta }
    return out
  }
  if (prev.type === 'thinking_delta' && ev.type === 'thinking_delta') {
    const text = prev.text === undefined && ev.text === undefined ? undefined : (prev.text ?? '') + (ev.text ?? '')
    const tokens = ev.estimatedTokens ?? prev.estimatedTokens
    const out: ThinkingDelta = { type: 'thinking_delta', ...(text !== undefined ? { text } : {}), ...(tokens !== undefined ? { estimatedTokens: tokens } : {}) }
    return out
  }
  return null
}

export function appendSessionEvent(events: readonly AgentEvent[], ev: AgentEvent, max: number): { events: AgentEvent[]; truncated: boolean } {
  const joined = merged(events[events.length - 1], ev)
  if (joined) return { events: [...events.slice(0, -1), joined], truncated: false }
  const next = [...events, ev]
  if (next.length <= max) return { events: next, truncated: false }
  return { events: next.slice(next.length - max), truncated: true }
}
