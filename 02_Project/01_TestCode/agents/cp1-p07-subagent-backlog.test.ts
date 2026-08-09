import { describe, it, expect, beforeEach } from 'vitest'
import { RunEventNormalizer } from '../../../02_Project/00_Source/main/01_agents/eventNormalizer'
import type { AgentEvent } from '../../../02_Project/00_Source/shared/agentEvents'

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

describe('CP1 P07 ① — 서브에이전트 표시명(displayName)', () => {
  let norm: RunEventNormalizer
  beforeEach(() => {
    norm = new RunEventNormalizer('r-cp1-07-1')
  })

  it('input.name 있으면 생성 이벤트에 displayName 반영, name은 subagent_type 그대로(NG-1 계약 불변)', () => {
    const r = norm.process(
      assistantMsg([
        toolUse('sa-name-1', 'Task', {
          subagent_type: 'general-purpose',
          description: 'Reply with the number',
          name: '소네트 테스트 에이전트 1',
        }),
      ])
    )
    const created = findSubagentEvents(r.events)
    expect(created).toHaveLength(1)
    expect(created[0].subagent.name).toBe('general-purpose')
    expect(created[0].subagent.displayName).toBe('소네트 테스트 에이전트 1')
  })

  it('input.name 없으면 displayName 미부여(undefined, 회귀 0)', () => {
    const r = norm.process(
      assistantMsg([toolUse('sa-name-2', 'Task', { subagent_type: 'general-purpose', description: 'x' })])
    )
    const created = findSubagentEvents(r.events)
    expect(created[0].subagent.displayName).toBeUndefined()
  })

  it('Agent 도구(Task 동형 분기)에서도 동일하게 displayName 반영', () => {
    const r = norm.process(
      assistantMsg([
        toolUse('sa-name-3', 'Agent', { subagent_type: 'explorer', description: '탐색', name: 'Explorer-1' }),
      ])
    )
    const created = findSubagentEvents(r.events)
    expect(created[0].subagent.displayName).toBe('Explorer-1')
  })

  it('name이 빈 문자열이면 displayName 미부여(falsy 가드, 과필터 아님)', () => {
    const r = norm.process(
      assistantMsg([toolUse('sa-name-4', 'Task', { subagent_type: 'general-purpose', description: 'x', name: '' })])
    )
    const created = findSubagentEvents(r.events)
    expect(created[0].subagent.displayName).toBeUndefined()
  })
})

describe('CP1 P07 ② — 조기 model 배지(input.model 스냅샷)', () => {
  let norm: RunEventNormalizer
  beforeEach(() => {
    norm = new RunEventNormalizer('r-cp1-07-2')
  })

  it('input.model(별칭) 있으면 생성 이벤트에 즉시 반영(원문 그대로 — 변환/검증 없음)', () => {
    const r = norm.process(
      assistantMsg([
        toolUse('sa-model-1', 'Task', { subagent_type: 'general-purpose', description: 'x', model: 'opus' }),
      ])
    )
    const created = findSubagentEvents(r.events)
    expect(created[0].subagent.model).toBe('opus')
  })

  it('input.model 없으면 생성 이벤트 model 미부여(undefined, 회귀 0)', () => {
    const r = norm.process(
      assistantMsg([toolUse('sa-model-2', 'Task', { subagent_type: 'general-purpose', description: 'x' })])
    )
    const created = findSubagentEvents(r.events)
    expect(created[0].subagent.model).toBeUndefined()
  })

  it('조기 별칭(opus) 스냅샷 후 실측 message.model(원시 ID) 도착 → update로 갱신(기존 dedup 로직과 정합)', () => {
    norm.process(
      assistantMsg([
        toolUse('sa-model-3', 'Task', { subagent_type: 'general-purpose', description: 'x', model: 'opus' }),
      ])
    )
    const r2 = norm.process(subagentAssistantMsg('sa-model-3', 'claude-opus-4-8', '분석 중'))
    const updates = findSubagentEvents(r2.events)
    expect(updates).toHaveLength(1)
    expect(updates[0].subagent.model).toBe('claude-opus-4-8')
  })

  it('조기 스냅샷이 없어도(별칭 미기재) 실측 도착 시 정상 update(기존 FB2 P07 회귀 0)', () => {
    norm.process(assistantMsg([toolUse('sa-model-4', 'Task', { subagent_type: 'general-purpose', description: 'x' })]))
    const r2 = norm.process(subagentAssistantMsg('sa-model-4', 'claude-haiku-4-5-20251001', 'hi'))
    const updates = findSubagentEvents(r2.events)
    expect(updates).toHaveLength(1)
    expect(updates[0].subagent.model).toBe('claude-haiku-4-5-20251001')
  })
})

describe('CP1 P07 ③ — ok:false(is_error) 서브에이전트 tool_result 골든 케이스', () => {
  let norm: RunEventNormalizer
  beforeEach(() => {
    norm = new RunEventNormalizer('r-cp1-07-3')
  })

  it('is_error tool_result도 status:done 전이(ok 무관 — subagent-model-normalize M9의 ok:true 짝)', () => {
    norm.process(assistantMsg([toolUse('sa-err-1', 'Task', { subagent_type: 'general-purpose', description: 'x' })]))

    const r2 = norm.process(userMsg([toolResult('sa-err-1', 'Error: rate limited', true)]))
    const tr = r2.events.find((e) => e.type === 'tool_result') as
      | Extract<AgentEvent, { type: 'tool_result' }>
      | undefined
    expect(tr).toBeDefined()
    expect(tr!.ok).toBe(false)

    const r3 = norm.process(subagentAssistantMsg('sa-err-1', 'claude-haiku-4-5-20251001', '실패 보고'))
    const updates = findSubagentEvents(r3.events)
    expect(updates).toHaveLength(1)
    expect(updates[0].subagent.status).toBe('done')
    expect(updates[0].subagent.model).toBe('claude-haiku-4-5-20251001')
  })

  it('is_error tool_result의 내부 메타(agentId 지침)도 sanitize 정상 적용(ok 무관, FB1 P05 정합)', () => {
    norm.process(assistantMsg([toolUse('sa-err-2', 'Task', { subagent_type: 'general-purpose', description: 'x' })]))
    const metaText = "agentId: fail001 (use SendMessage with to: 'fail001')\n<usage>subagent_tokens: 42</usage>"
    const r2 = norm.process(userMsg([toolResult('sa-err-2', metaText, true)]))
    const tr = r2.events.find((e) => e.type === 'tool_result') as Extract<AgentEvent, { type: 'tool_result' }>
    expect(tr.output).toBe('')
    expect(tr.ok).toBe(false)
  })

  it('is_error 완료 후 model 관측 없이 종료해도(assistant 메시지 미도착) tool_result 자체는 정상 흐름(회귀 0)', () => {
    norm.process(assistantMsg([toolUse('sa-err-3', 'Task', { subagent_type: 'general-purpose', description: 'x' })]))
    const r2 = norm.process(userMsg([toolResult('sa-err-3', '실제 실패 사유 텍스트', true)]))
    const tr = r2.events.find((e) => e.type === 'tool_result') as Extract<AgentEvent, { type: 'tool_result' }>
    expect(tr.output).toBe('실제 실패 사유 텍스트')
    expect(tr.ok).toBe(false)
  })
})
