/**
 * claudeAgentRun.test.ts — ClaudeAgentRun 직접 특성화 테스트 (RF1-followup P03)
 *
 * ClaudeCodeBackend.ts에서 자체 파일로 분리된 ClaudeAgentRun(생명주기 오케스트레이터)의
 * 핵심 거동을 직접 고정한다. ClaudeCodeBackend 경유 골든(claude-*.test.ts 다수)이 1차
 * 회귀망이고, 이 테스트는 분리된 클래스 자체를 직접 구동해 추출 경계를 검증한다.
 */

import { describe, it, expect } from 'vitest'
import { ClaudeAgentRun } from '../../../02.Source/main/01_agents/claudeAgentRun'
import type { QueryFn } from '../../../02.Source/main/01_agents/queryFn'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

function mkAssistantText(text: string) {
  return { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] }, parent_tool_use_id: null }
}
function mkResult() {
  return { type: 'result', subtype: 'success', is_error: false, usage: { input_tokens: 1, output_tokens: 1 }, modelUsage: {}, errors: [] }
}

function mkQuery(messages: unknown[]): QueryFn {
  return async function* (params: { prompt: string; options?: unknown }) {
    const opts = params.options as Record<string, unknown> | undefined
    for (const m of messages) {
      const ab = opts?.abortController as AbortController | undefined
      if (ab?.signal.aborted) return
      yield m
    }
  }
}

async function drain(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  for await (const e of events) out.push(e)
  return out
}

describe('ClaudeAgentRun (분리된 클래스 직접 구동)', () => {
  it('assistant text → text + done 이벤트를 순서대로 방출', async () => {
    const run = new ClaudeAgentRun(
      { messages: [{ role: 'user', content: 'hi' }] },
      mkQuery([mkAssistantText('A'), mkAssistantText('B'), mkResult()]),
      () => null,
      () => null,
    )
    const events = await drain(run.events)
    const texts = events.filter(e => e.type === 'text').map(e => (e as { delta: string }).delta)
    expect(texts).toEqual(['A', 'B'])
    expect(events[events.length - 1].type).toBe('done')
  })

  it('consume 전 abort → 무이벤트 종료(hang 없음)', async () => {
    const run = new ClaudeAgentRun(
      { messages: [{ role: 'user', content: 'hi' }] },
      mkQuery([mkAssistantText('A'), mkResult()]),
      () => null,
      () => null,
    )
    run.abort()
    const events = await drain(run.events)
    expect(events).toEqual([])
  })

  it('user 메시지 없으면 error + done', async () => {
    const run = new ClaudeAgentRun(
      { messages: [] },
      mkQuery([mkResult()]),
      () => null,
      () => null,
    )
    const events = await drain(run.events)
    expect(events.some(e => e.type === 'error')).toBe(true)
    expect(events[events.length - 1].type).toBe('done')
  })
})
