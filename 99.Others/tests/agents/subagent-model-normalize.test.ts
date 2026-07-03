/**
 * subagent-model-normalize.test.ts — RunEventNormalizer가 서브에이전트를 실제로 실행한
 * 원시 모델 ID를 subagent update 이벤트로 표면화하는지 검증 (FB2 P07, TDD)
 *
 * 데이터 소스(실측, escalation 조사): 서브에이전트의 assistant 메시지 =
 *   SDKAssistantMessage(node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:2647-2666).
 *   parent_tool_use_id(부모 Task tool_use id) + message.model(BetaMessage.model,
 *   node_modules/@anthropic-ai/sdk/.../messages.d.mts:1453 — 항상 존재하는 실측 모델 ID) 보유.
 *
 * 수정 계약: eventNormalizer가 'subagent' 생성 이벤트(Task/Agent 최상위 tool_use) 시점의
 *   name/role/status를 _subagentMetaById에 스냅샷으로 저장해두고, 이후 해당 서브에이전트의
 *   assistant 메시지(parent_tool_use_id 있음)에서 message.model을 관찰하면 그 스냅샷 값을
 *   그대로 echo한 'subagent' update 이벤트(model 필드만 추가)를 emit한다.
 *
 *   왜 스냅샷을 echo해야 하는가: 렌더러 reducer/notice.ts handleSubagent의 병합은
 *   `{...existing, ...incoming, tools: existing.tools}`(tools 제외 전 필드 incoming 우선
 *   덮어쓰기)이다. update 이벤트에 name/role/status를 채우지 않거나 플레이스홀더를 채우면
 *   기존 값이 깨진다 — 그래서 claude-stream.ts(무상태)가 아니라 eventNormalizer(상태 보유)가
 *   이 필드들을 채워 넣는다.
 *
 *   중복 방지: 같은 모델이 반복 관찰되면 두 번째 이후 update를 emit하지 않는다
 *   (_subagentModelById dedup — FB1 Phase 05 _subagentToolIds 선례와 동일 패턴).
 *
 * 검증 범위:
 *  M1 Task tool_use → subagent 생성 후, 첫 assistant 메시지(parentToolId + message.model)
 *     → subagent update 이벤트 emit, name/role/status는 생성 시점 값 그대로 echo
 *  M2 같은 서브에이전트의 두 번째 assistant 메시지(동일 model) → update 미방출(dedup)
 *  M3 같은 서브에이전트의 모델이 바뀐 경우(예: 폴백) → 새 update emit(변경된 model)
 *  M4 parentToolId 없는(최상위) 일반 assistant 메시지 + message.model → subagent 이벤트 없음(무영향)
 *  M5 parentToolId 있지만 message.model 없음(필드 누락) → subagent update 없음(graceful)
 *  M6 meta 미등록 상태(Task tool_use를 보지 못함)에서 parentToolId+model 관찰 → 크래시 없이 무시
 *  M7 cleanup(abortCleanup) 후 상태 클리어 확인 — 클리어 후 동일 id 모델 재관찰해도 emit 없음(meta 소실)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { RunEventNormalizer } from '../../../02.Source/main/01_agents/eventNormalizer'
import type { AgentEvent, SubAgentInfo } from '../../../02.Source/shared/agent-events'

// ── 픽스처 (eventNormalizer.test.ts / subagent-meta-normalize.test.ts 컨벤션 미러) ──

function assistantMsg(contents: unknown[]) {
  return { type: 'assistant', message: { role: 'assistant', content: contents } }
}

function toolUse(id: string, name: string, input: unknown) {
  return { type: 'tool_use', id, name, input }
}

/** 서브에이전트 assistant 메시지(parent_tool_use_id + message.model 포함) */
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
    // Task tool_use(최상위) → subagent 생성 이벤트
    const r1 = norm.process(
      assistantMsg([toolUse('sa1', 'Task', { subagent_type: 'claude', description: 'Summarize Button.ts' })])
    )
    const created = findSubagentEvents(r1.events)
    expect(created).toHaveLength(1)
    const createdInfo = created[0].subagent
    expect(createdInfo.id).toBe('sa1')
    expect(createdInfo.status).toBe('running')
    expect(createdInfo.model).toBeUndefined()

    // 서브에이전트 첫 assistant 메시지: parentToolId='sa1' + message.model
    const r2 = norm.process(subagentAssistantMsg('sa1', 'claude-opus-4-8', '분석을 시작합니다'))
    const updates = findSubagentEvents(r2.events)
    expect(updates).toHaveLength(1)
    const updated: SubAgentInfo = updates[0].subagent
    expect(updated.id).toBe('sa1')
    expect(updated.model).toBe('claude-opus-4-8')
    // 생성 시점 name/role/status를 그대로 echo(플레이스홀더로 덮어쓰지 않음)
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

    // 같은 모델로 두 번째 메시지 → update 없음
    const r2 = norm.process(subagentAssistantMsg('sa2', 'claude-opus-4-8', '두 번째 메시지'))
    expect(findSubagentEvents(r2.events)).toHaveLength(0)

    // 세 번째도 동일 모델 → 여전히 없음
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
    // text 이벤트 자체는 정상 처리(회귀 0)
    expect(r.events.some((e) => e.type === 'text')).toBe(true)
  })

  it('M6: meta 미등록 상태(Task tool_use를 못 봄)에서 model 관찰 → 크래시 없이 무시', () => {
    // sa6에 대한 생성 이벤트를 process()에 태우지 않음(비정상 케이스 시뮬레이션)
    const r = norm.process(subagentAssistantMsg('sa6', 'claude-opus-4-8', '고아 서브에이전트 메시지'))
    expect(findSubagentEvents(r.events)).toHaveLength(0)
    // text는 정상 통과
    expect(r.events.some((e) => e.type === 'text')).toBe(true)
  })

  it('M7: abortCleanup 후 상태 클리어 — 클리어 후엔 동일 id 모델 재관찰해도 update 없음(meta 소실)', () => {
    norm.process(assistantMsg([toolUse('sa7', 'Task', { description: 'x' })]))
    norm.process(subagentAssistantMsg('sa7', 'claude-opus-4-8', '첫 메시지'))
    norm.abortCleanup()

    const r = norm.process(subagentAssistantMsg('sa7', 'claude-opus-4-8', '클리어 후 메시지'))
    expect(findSubagentEvents(r.events)).toHaveLength(0)
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
