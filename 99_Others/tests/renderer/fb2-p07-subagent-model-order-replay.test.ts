import { describe, it, expect } from 'vitest'
import { makeInitialState, applyAgentEvent } from '../../../02_Source/renderer/src/store/reducer'
import type { AgentEventPayload } from '../../../02_Source/shared/ipcContract'

describe('FB2 P07 사후진단: 라이브 실측 순서 재생 — subagent 완료 후 도착하는 model update', () => {
  it('tool_result(완료)가 model-update보다 먼저 와도 최종 state는 model+status 둘 다 정확하다', () => {
    let state = makeInitialState()
    const runId = 'r1'
    const subId = 'toolu_agent1'

    state = applyAgentEvent(state, {
      runId,
      event: {
        type: 'subagent',
        subagent: { id: subId, name: 'general-purpose', role: 'Reply with exactly one word', status: 'running', tools: [] },
      },
    } as AgentEventPayload)

    state = applyAgentEvent(state, {
      runId,
      event: { type: 'tool_result', id: subId, ok: true, output: 'OK' },
    } as AgentEventPayload)

    const afterResult = state.subagents.find((sa) => sa.id === subId)
    expect(afterResult?.status).toBe('done')
    expect(afterResult?.activity).toBeTruthy()

    state = applyAgentEvent(state, {
      runId,
      event: {
        type: 'subagent',
        subagent: {
          id: subId,
          name: 'general-purpose',
          role: 'Reply with exactly one word',
          status: 'done',
          tools: [],
          model: 'claude-haiku-4-5-20251001',
        },
      },
    } as AgentEventPayload)

    const final = state.subagents.find((sa) => sa.id === subId)
    console.log('[FB2-P07-replay] 최종 subagent state:', JSON.stringify(final, null, 2))

    expect(final?.model).toBe('claude-haiku-4-5-20251001')

    expect(final?.status).toBe('done')
  })
})
