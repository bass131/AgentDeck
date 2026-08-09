import { describe, it, expect } from 'vitest'
import { applyAgentEvent, makeInitialState } from '../../../02_Project/00_Source/renderer/src/store/reducer'
import type { AppState } from '../../../02_Project/00_Source/renderer/src/store/reducer'
import type { AgentEventPayload } from '../../../02_Project/00_Source/shared/ipcContract'

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
