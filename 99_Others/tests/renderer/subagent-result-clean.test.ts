import { describe, it, expect } from 'vitest'
import { applyAgentEvent, makeInitialState } from '../../../02_Source/renderer/src/store/reducer'
import type { AgentEventPayload } from '../../../02_Source/shared/ipcContract'

function payload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId: 'run-clean', event }
}

function withSubagent() {
  const s0 = makeInitialState()
  return applyAgentEvent(s0, payload({
    type: 'subagent',
    subagent: { id: 'sa-1', name: 'A', role: 'r', status: 'running', tools: [] },
  }))
}

describe('F-E — 서브에이전트 결과 정제(raw JSON 제거)', () => {
  it('text 블록 배열 → 정제 텍스트(추출·join, agentId/usage 메타 제거, raw JSON 아님)', () => {
    const s = applyAgentEvent(withSubagent(), payload({
      type: 'tool_result',
      id: 'sa-1',
      ok: true,
      output: [
        { type: 'text', text: '바이너리 서치는 정렬된 배열에서 절반씩 좁혀 찾는다.' },
        { type: 'text', text: "agentId: abc123 (use SendMessage with to: 'abc123')\n<usage>subagent_tokens: 10291</usage>" },
      ],
    }))
    const act = s.subagents[0].activity ?? ''
    expect(act).toContain('바이너리 서치')
    expect(act).not.toContain('agentId:')
    expect(act).not.toContain('<usage>')
    expect(act).not.toContain('"type":"text"')
  })

  it('회귀: 문자열 output → 그대로', () => {
    const s = applyAgentEvent(withSubagent(), payload({
      type: 'tool_result', id: 'sa-1', ok: true, output: '탐색 완료. 3개 파일.',
    }))
    expect(s.subagents[0].activity).toBe('탐색 완료. 3개 파일.')
  })

  it('회귀: 객체 output(text 블록 아님) → JSON 폴백(truthy)', () => {
    const s = applyAgentEvent(withSubagent(), payload({
      type: 'tool_result', id: 'sa-1', ok: true, output: { result: '완료', files: ['a.ts'] },
    }))
    expect(s.subagents[0].activity).toBeTruthy()
  })

  it('단일 text 블록 배열 → 그 텍스트만', () => {
    const s = applyAgentEvent(withSubagent(), payload({
      type: 'tool_result', id: 'sa-1', ok: true,
      output: [{ type: 'text', text: 'ALPHA' }],
    }))
    expect(s.subagents[0].activity).toBe('ALPHA')
  })
})
