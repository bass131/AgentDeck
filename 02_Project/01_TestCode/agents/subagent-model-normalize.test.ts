import { describe, it, expect, beforeEach } from 'vitest'
import { RunEventNormalizer } from '../../../02_Project/00_Source/main/01_agents/eventNormalizer'
import type { AgentEvent, SubAgentInfo } from '../../../02_Project/00_Source/shared/agentEvents'

function assistantMsg(contents: unknown[]) {
  return { type: 'assistant', message: { role: 'assistant', content: contents } }
}

function toolUse(id: string, name: string, input: unknown) {
  return { type: 'tool_use', id, name, input }
}

function userMsg(contents: unknown[]) {
  return { type: 'user', message: { role: 'user', content: contents } }
}

function toolResult(id: string, content: unknown, isError = false) {
  return {
    type: 'tool_result',
    tool_use_id: id,
    content,
    ...(isError ? { is_error: true } : {}),
  }
}

function subagentAssistantMsg(parentToolId: string, model: string | undefined, text: string) {
  return {
    type: 'assistant',
    parent_tool_use_id: parentToolId,
    message: {
      role: 'assistant',
      ...(model !== undefined ? { model } : {}),
      content: [{ type: 'text', text }],
    },
  }
}

function findSubagentEvents(events: AgentEvent[]): Extract<AgentEvent, { type: 'subagent' }>[] {
  return events.filter((e): e is Extract<AgentEvent, { type: 'subagent' }> => e.type === 'subagent')
}

describe('RunEventNormalizer — 서브에이전트 모델 표기 (FB2 P07)', () => {
  let norm: RunEventNormalizer

  beforeEach(() => {
    norm = new RunEventNormalizer('r-fb2-07')
  })

  it('M1: 첫 assistant 메시지(model 관찰) → subagent update 이벤트, name/role/status는 생성 시점 값 echo', () => {
    const r1 = norm.process(
      assistantMsg([toolUse('sa1', 'Task', { subagent_type: 'claude', description: 'Summarize Button.ts' })])
    )
    const created = findSubagentEvents(r1.events)
    expect(created).toHaveLength(1)
    const createdInfo = created[0].subagent
    expect(createdInfo.id).toBe('sa1')
    expect(createdInfo.status).toBe('running')
    expect(createdInfo.model).toBeUndefined()

    const r2 = norm.process(subagentAssistantMsg('sa1', 'claude-opus-4-8', '분석을 시작합니다'))
    const updates = findSubagentEvents(r2.events)
    expect(updates).toHaveLength(1)
    const updated: SubAgentInfo = updates[0].subagent
    expect(updated.id).toBe('sa1')
    expect(updated.model).toBe('claude-opus-4-8')
    expect(updated.name).toBe(createdInfo.name)
    expect(updated.role).toBe(createdInfo.role)
    expect(updated.status).toBe(createdInfo.status)
  })

  it('M1b: 원시 모델 ID 그대로 전달(표시 변환 없음)', () => {
    norm.process(assistantMsg([toolUse('sa1b', 'Task', { description: 'x' })]))
    const r = norm.process(subagentAssistantMsg('sa1b', 'claude-sonnet-4-6', 'hi'))
    const updates = findSubagentEvents(r.events)
    expect(updates[0].subagent.model).toBe('claude-sonnet-4-6')
  })

  it('M2: 같은 서브에이전트의 두 번째 assistant 메시지(동일 model) → update 미방출(dedup)', () => {
    norm.process(assistantMsg([toolUse('sa2', 'Task', { description: 'x' })]))
    const r1 = norm.process(subagentAssistantMsg('sa2', 'claude-opus-4-8', '첫 메시지'))
    expect(findSubagentEvents(r1.events)).toHaveLength(1)

    const r2 = norm.process(subagentAssistantMsg('sa2', 'claude-opus-4-8', '두 번째 메시지'))
    expect(findSubagentEvents(r2.events)).toHaveLength(0)

    const r3 = norm.process(subagentAssistantMsg('sa2', 'claude-opus-4-8', '세 번째 메시지'))
    expect(findSubagentEvents(r3.events)).toHaveLength(0)
  })

  it('M3: 서브에이전트 도중 모델이 바뀌면(폴백 등) 새 update emit', () => {
    norm.process(assistantMsg([toolUse('sa3', 'Task', { description: 'x' })]))
    norm.process(subagentAssistantMsg('sa3', 'claude-opus-4-8', '첫 메시지'))

    const r = norm.process(subagentAssistantMsg('sa3', 'claude-sonnet-4-6', '폴백 이후 메시지'))
    const updates = findSubagentEvents(r.events)
    expect(updates).toHaveLength(1)
    expect(updates[0].subagent.model).toBe('claude-sonnet-4-6')
  })

  it('M4: parentToolId 없는(최상위) 일반 assistant 메시지 + message.model → subagent 이벤트 없음(무영향)', () => {
    const r = norm.process({
      type: 'assistant',
      message: { role: 'assistant', model: 'claude-opus-4-8', content: [{ type: 'text', text: '최상위 응답' }] },
    })
    expect(findSubagentEvents(r.events)).toHaveLength(0)
    expect(r.events.some((e) => e.type === 'text')).toBe(true)
  })

  it('M5: parentToolId 있지만 message.model 없음(필드 누락) → subagent update 없음(graceful)', () => {
    norm.process(assistantMsg([toolUse('sa5', 'Task', { description: 'x' })]))
    const r = norm.process(subagentAssistantMsg('sa5', undefined, '모델 필드 없는 메시지'))
    expect(findSubagentEvents(r.events)).toHaveLength(0)
    expect(r.events.some((e) => e.type === 'text')).toBe(true)
  })

  it('M6: meta 미등록 상태(Task tool_use를 못 봄)에서 model 관찰 → 크래시 없이 무시', () => {
    const r = norm.process(subagentAssistantMsg('sa6', 'claude-opus-4-8', '고아 서브에이전트 메시지'))
    expect(findSubagentEvents(r.events)).toHaveLength(0)
    expect(r.events.some((e) => e.type === 'text')).toBe(true)
  })

  it('M7: abortCleanup 후 상태 클리어 — 클리어 후엔 동일 id 모델 재관찰해도 update 없음(meta 소실)', () => {
    norm.process(assistantMsg([toolUse('sa7', 'Task', { description: 'x' })]))
    norm.process(subagentAssistantMsg('sa7', 'claude-opus-4-8', '첫 메시지'))
    norm.abortCleanup()

    const r = norm.process(subagentAssistantMsg('sa7', 'claude-opus-4-8', '클리어 후 메시지'))
    expect(findSubagentEvents(r.events)).toHaveLength(0)
  })

  it('M9: 완료(tool_result)가 모델 관찰보다 먼저 오면 — 늦게 도착한 update는 status:done을 echo', () => {
    norm.process(assistantMsg([toolUse('sa9live', 'Task', { subagent_type: 'general-purpose', description: 'Reply OK' })]))

    const r2 = norm.process(userMsg([toolResult('sa9live', 'OK')]))
    expect(r2.events.some((e) => e.type === 'tool_result')).toBe(true)

    const r3 = norm.process(subagentAssistantMsg('sa9live', 'claude-haiku-4-5-20251001', 'OK'))
    const updates = findSubagentEvents(r3.events)
    expect(updates).toHaveLength(1)
    expect(updates[0].subagent.model).toBe('claude-haiku-4-5-20251001')
    expect(updates[0].subagent.status).toBe('done')
  })

  it('M8: singlePumpCleanup / persistentPumpCleanup도 동일하게 상태 클리어(회귀 방지)', () => {
    norm.process(assistantMsg([toolUse('sa8', 'Task', { description: 'x' })]))
    norm.process(subagentAssistantMsg('sa8', 'claude-opus-4-8', '첫 메시지'))
    norm.singlePumpCleanup()
    const r1 = norm.process(subagentAssistantMsg('sa8', 'claude-opus-4-8', '이후 메시지'))
    expect(findSubagentEvents(r1.events)).toHaveLength(0)

    norm.process(assistantMsg([toolUse('sa9', 'Task', { description: 'x' })]))
    norm.process(subagentAssistantMsg('sa9', 'claude-opus-4-8', '첫 메시지'))
    norm.persistentPumpCleanup()
    const r2 = norm.process(subagentAssistantMsg('sa9', 'claude-opus-4-8', '이후 메시지'))
    expect(findSubagentEvents(r2.events)).toHaveLength(0)
  })
})
