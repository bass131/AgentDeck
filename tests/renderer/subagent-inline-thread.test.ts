/**
 * subagent-inline-thread.test.ts — F-G: 서브에이전트 채팅 인라인 위치 마커 (TDD)
 *
 * 사용자 요구: 멀티에이전트 패널엔 우측 표시 패널이 없으니, 단일·멀티 둘 다 채팅 안에서
 * Claude Code CLI처럼 SubAgent 도는 걸 동적으로 보여준다. reducer가 subagent 스폰 시
 * thread에 {kind:'subagent', id} 위치 마커를 push(데이터는 state.subagents 단일출처,
 * 인라인 컴포넌트가 id로 조회). cmdresult/orchestration 인라인 패턴 미러.
 *
 * SG1: subagent 이벤트(신규) → thread에 {kind:'subagent', id} 마커 push
 * SG2: 같은 id 재이벤트(merge) → 마커 중복 push 안 함(1개 유지)
 * SG3: 인터리브 text→subagent→text → thread [msg, subagent, msg]
 * SG4: 마커 push 시 인터리브 포인터 닫힘(openMsgId/openGroupId=null)
 */
import { describe, it, expect } from 'vitest'
import { applyAgentEvent, makeInitialState } from '../../src/renderer/src/store/reducer'
import type { AppState } from '../../src/renderer/src/store/reducer'
import type { AgentEventPayload } from '../../src/shared/ipc-contract'

const runId = 'run-fg'
function payload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

function mkSubagentEvent(id: string, name = 'explorer') {
  return {
    type: 'subagent' as const,
    subagent: { id, name, role: 'x', status: 'running' as const, tools: [] },
  }
}

function subagentMarkers(state: AppState) {
  return state.thread.filter((it) => it.kind === 'subagent')
}

describe('F-G — reducer 서브에이전트 thread 인라인 마커', () => {
  it('SG1: subagent 이벤트(신규) → thread에 {kind:"subagent", id} 마커 push', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(mkSubagentEvent('sa-1')))

    const markers = subagentMarkers(s1)
    expect(markers).toHaveLength(1)
    expect((markers[0] as { id: string }).id).toBe('sa-1')
    // state.subagents에도 정상 upsert(단일출처)
    expect(s1.subagents.find((sa) => sa.id === 'sa-1')).toBeDefined()
  })

  it('SG2: 같은 id 재이벤트(merge) → 마커 중복 안 됨(1개)', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload(mkSubagentEvent('sa-1')))
    s = applyAgentEvent(s, payload(mkSubagentEvent('sa-1', 'explorer-updated')))

    expect(subagentMarkers(s)).toHaveLength(1)
  })

  it('SG3: 인터리브 text→subagent→text → thread에 msg, subagent, msg 순', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'text', delta: '먼저' }))
    s = applyAgentEvent(s, payload(mkSubagentEvent('sa-1')))
    s = applyAgentEvent(s, payload({ type: 'text', delta: '나중' }))

    const kinds = s.thread.map((it) => it.kind)
    // msg(먼저) → subagent 마커 → msg(나중) 순서 (서브에이전트 마커가 사이에)
    const saIdx = kinds.indexOf('subagent')
    expect(saIdx).toBeGreaterThan(-1)
    expect(kinds.slice(0, saIdx)).toContain('msg')
    expect(kinds.slice(saIdx + 1)).toContain('msg')
  })

  it('SG4: 마커 push 시 인터리브 포인터 닫힘(openMsgId/openGroupId=null)', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload({ type: 'text', delta: '앞' }))
    s = applyAgentEvent(s, payload(mkSubagentEvent('sa-1')))

    expect(s.openMsgId).toBeNull()
    expect(s.openGroupId).toBeNull()
  })
})
