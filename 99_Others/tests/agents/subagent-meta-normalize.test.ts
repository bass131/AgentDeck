import { describe, it, expect, beforeEach } from 'vitest'
import { RunEventNormalizer } from '../../../02_Source/main/01_agents/eventNormalizer'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'

function assistantMsg(contents: unknown[]) {
  return { type: 'assistant', message: { role: 'assistant', content: contents } }
}

function userMsg(contents: unknown[]) {
  return { type: 'user', message: { role: 'user', content: contents } }
}

function toolUse(id: string, name: string, input: unknown) {
  return { type: 'tool_use', id, name, input }
}

function toolResult(id: string, content: unknown, isError = false) {
  return {
    type: 'tool_result',
    tool_use_id: id,
    content,
    ...(isError ? { is_error: true } : {}),
  }
}

const ASYNC_LAUNCH_META =
  "Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)\n" +
  "agentId: a1eb66c99aa76e143 (internal ID - do not mention to user. Use SendMessage with to: 'a1eb66c99aa76e143', summary: '<5-10 word recap>' to continue this agent.)\n" +
  "The agent is working in the background. You will be notified automatically when it completes.\n" +
  "output_file: C:\\Users\\bass1\\AppData\\Local\\Temp\\claude\\tasks\\a1eb66c99aa76e143.output\n" +
  "Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript."

describe('RunEventNormalizer — 서브에이전트 tool_result 내부 메타 정규화 (FB1 Phase 05)', () => {
  let norm: RunEventNormalizer

  beforeEach(() => {
    norm = new RunEventNormalizer('r-fb1-05')
  })

  it('N1: subagent 등록 후 async launch 메타 tool_result → output 정제(빈 문자열)', () => {
    const r1 = norm.process(assistantMsg([toolUse('sa1', 'Task', { subagent_type: 'claude', description: 'Summarize Button.ts' })]))
    expect(r1.events.some(e => e.type === 'subagent')).toBe(true)

    const r2 = norm.process(userMsg([toolResult('sa1', ASYNC_LAUNCH_META)]))
    const tr = r2.events.find(e => e.type === 'tool_result') as Extract<AgentEvent, { type: 'tool_result' }> | undefined
    expect(tr).toBeDefined()
    expect(tr!.output).toBe('')
  })

  it('N2: 2블록 배열(실제결과+메타) tool_result → 메타 블록만 제거, 실제 결과 보존', () => {
    norm.process(assistantMsg([toolUse('sa2', 'Agent', { subagent_type: 'claude', description: '탐색' })]))

    const content = [
      { type: 'text', text: '바이너리 서치는 정렬된 배열에서 절반씩 좁혀 찾는다.' },
      { type: 'text', text: "agentId: abc123 (use SendMessage with to: 'abc123')\n<usage>subagent_tokens: 10291</usage>" },
    ]
    const r2 = norm.process(userMsg([toolResult('sa2', content)]))
    const tr = r2.events.find(e => e.type === 'tool_result') as Extract<AgentEvent, { type: 'tool_result' }>
    const output = tr.output as Array<{ type: string; text: string }>
    expect(output).toHaveLength(1)
    expect(output[0].text).toBe('바이너리 서치는 정렬된 배열에서 절반씩 좁혀 찾는다.')
  })

  it('N3: subagent와 무관한 다른 id의 tool_result → output 불변(과필터 방지)', () => {
    norm.process(assistantMsg([toolUse('sa3', 'Task', { description: 'x' })]))

    const r = norm.process(userMsg([toolResult('other-tool-1', '탐색 완료. 3개 파일.')]))
    const tr = r.events.find(e => e.type === 'tool_result') as Extract<AgentEvent, { type: 'tool_result' }>
    expect(tr.output).toBe('탐색 완료. 3개 파일.')
  })

  it('N4: 실제 결과만 담은 subagent tool_result(메타 아님) → output 불변(회귀 0)', () => {
    norm.process(assistantMsg([toolUse('sa4', 'Task', { description: 'x' })]))
    const r = norm.process(userMsg([toolResult('sa4', 'ALPHA 결과 완료.')]))
    const tr = r.events.find(e => e.type === 'tool_result') as Extract<AgentEvent, { type: 'tool_result' }>
    expect(tr.output).toBe('ALPHA 결과 완료.')
  })

  it('N5: tool_result 이벤트 자체는 suppress되지 않음(완료 판정 유지)', () => {
    norm.process(assistantMsg([toolUse('sa5', 'Task', { description: 'x' })]))
    const r = norm.process(userMsg([toolResult('sa5', ASYNC_LAUNCH_META)]))
    expect(r.events.some(e => e.type === 'tool_result')).toBe(true)
  })

  it('N6: abortCleanup 후 동일 id 재등장 시 이전 상태 영향 없음(상태 클리어 확인)', () => {
    norm.process(assistantMsg([toolUse('sa6', 'Task', { description: 'x' })]))
    norm.abortCleanup()

    const r = norm.process(userMsg([toolResult('sa6', ASYNC_LAUNCH_META)]))
    const tr = r.events.find(e => e.type === 'tool_result') as Extract<AgentEvent, { type: 'tool_result' }>
    expect(tr.output).toBe(ASYNC_LAUNCH_META)
  })
})
