/**
 * orchestration-reducer.test.ts — reducer orchestration 이벤트 단위 테스트 (TDD RED)
 *
 * 대상 모듈: src/renderer/src/store/reducer.ts (applyAgentEvent — orchestration case 추가 필요)
 * 대상 타입: src/renderer/src/store/threadTypes.ts (kind:'orchestration' 추가 필요)
 *
 * 검증 범위:
 *   R1: orchestration 이벤트 → thread에 kind:'orchestration' 카드 push (running:true)
 *   R2: B-1 포인터 닫기: orchestration push 후 openMsgId=null, openGroupId=null
 *   R3: 인터리브: text → orchestration → text 순 적용 → 별개 3항목
 *   R4: done 매칭: orchestration push 후 tool_result(ok:true) → running:false, result 설정
 *   R5: failed 매칭: tool_result(ok:false) → running:false, failed:true
 *   R6: P-2 매칭 우선/격리: orchestration + toolgroup 공존 시 각자 독립 매칭
 *   R7: 미매칭 안전: 엉뚱 id tool_result → 기존 동작 무파손
 */

import { describe, it, expect } from 'vitest'
import { applyAgentEvent, makeInitialState } from '../../src/renderer/src/store/reducer'
import type { AppState } from '../../src/renderer/src/store/reducer'
import type { ThreadItem } from '../../src/renderer/src/store/threadTypes'
import type { AgentEventPayload } from '../../src/shared/ipc-contract'

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function payload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId: 'run-orch', event }
}

/** thread에서 orchestration 카드 목록 추출 */
function orchCards(state: AppState) {
  return state.thread.filter((item: ThreadItem) => item.kind === 'orchestration')
}

/** orchestration 이벤트 페이로드 픽스처 */
function mkOrchEvent(opts: { id: string; name: string; description?: string; phases?: string[]; script?: string }) {
  return {
      type: 'orchestration' as const,
    id: opts.id,
    name: opts.name,
    ...(opts.description !== undefined ? { description: opts.description } : {}),
    ...(opts.phases !== undefined ? { phases: opts.phases } : {}),
    ...(opts.script !== undefined ? { script: opts.script } : {}),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('reducer — R1 orchestration 이벤트 → thread push', () => {
  it('R1-a: orchestration 이벤트 → thread에 kind:\'orchestration\' 카드 추가', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(mkOrchEvent({ id: 'wf1', name: 'my-flow' })))

    const cards = orchCards(s1)
    expect(cards).toHaveLength(1)
  })

  it('R1-b: push된 카드는 running:true', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(mkOrchEvent({ id: 'wf1', name: 'my-flow' })))

    const cards = orchCards(s1)
      expect(cards[0].running).toBe(true)
  })

  it('R1-c: push된 카드의 id, name, phases 보존', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(mkOrchEvent({
      id: 'wf1',
      name: 'my-flow',
      description: '내 워크플로우',
      phases: ['Phase1', 'Phase2'],
    })))

    const cards = orchCards(s1)
      expect(cards[0].id).toBe('wf1')
      expect(cards[0].name).toBe('my-flow')
      expect(cards[0].description).toBe('내 워크플로우')
      expect(cards[0].phases).toEqual(['Phase1', 'Phase2'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('reducer — R2 B-1 포인터 닫기', () => {
  it('R2-a: orchestration push 후 openMsgId === null', () => {
    const s0 = makeInitialState()
    // text 이벤트로 openMsgId 열기
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: 'hi', messageId: 'msg-a' }))
    expect(s1.openMsgId).toBe('msg-a')

    // orchestration push → openMsgId 닫기
    const s2 = applyAgentEvent(s1, payload(mkOrchEvent({ id: 'wf1', name: 'flow' })))
    expect(s2.openMsgId).toBeNull()
  })

  it('R2-b: orchestration push 후 openGroupId === null', () => {
    const s0 = makeInitialState()
    // tool_call로 openGroupId 열기
    const s1 = applyAgentEvent(s0, payload({ type: 'tool_call', id: 'tc1', name: 'Read', input: {} }))
    expect(s1.openGroupId).not.toBeNull()

    // orchestration push → openGroupId 닫기
    const s2 = applyAgentEvent(s1, payload(mkOrchEvent({ id: 'wf1', name: 'flow' })))
    expect(s2.openGroupId).toBeNull()
  })

  it('R2-c: done 매칭 시 포인터 불변 (thread in-place 갱신만)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(mkOrchEvent({ id: 'wf1', name: 'flow' })))
    // 다시 text 이벤트로 openMsgId 열기
    const s2 = applyAgentEvent(s1, payload({ type: 'text', delta: 'bye', messageId: 'msg-b' }))
    expect(s2.openMsgId).toBe('msg-b')

    // tool_result(done) 매칭 → openMsgId 불변
    const s3 = applyAgentEvent(s2, payload({
      type: 'tool_result',
      id: 'wf1',
      ok: true,
      output: '결과텍스트',
    }))
    // 포인터는 tool_result에서 변경되지 않아야 함
    expect(s3.openMsgId).toBe('msg-b')
    expect(s3.openGroupId).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('reducer — R3 인터리브 (cmdresult 선례 미러)', () => {
  it('R3: text → orchestration → text 순 적용 → thread 3항목, 별개 버블', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: 'hi', messageId: 'msg-before' }))
    const s2 = applyAgentEvent(s1, payload(mkOrchEvent({ id: 'wf1', name: 'flow' })))
    const s3 = applyAgentEvent(s2, payload({ type: 'text', delta: 'bye', messageId: 'msg-after' }))

    // thread: [msg('hi'), orchestration, msg('bye')]
    expect(s3.thread).toHaveLength(3)

    const t = s3.thread
    expect(t[0].kind).toBe('msg')
    expect((t[0] as Extract<ThreadItem, { kind: 'msg' }>).text).toBe('hi')

    expect(t[1].kind).toBe('orchestration')

    expect(t[2].kind).toBe('msg')
    expect((t[2] as Extract<ThreadItem, { kind: 'msg' }>).text).toBe('bye')
  })

  it('R3-b: orchestration이 경계 역할 → 앞뒤 text가 같은 버블에 합쳐지지 않음', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: 'hi', messageId: 'msg-a' }))
    const s2 = applyAgentEvent(s1, payload(mkOrchEvent({ id: 'wf1', name: 'flow' })))
    const s3 = applyAgentEvent(s2, payload({ type: 'text', delta: 'bye', messageId: 'msg-b' }))

    const msgs = s3.thread.filter(i => i.kind === 'msg') as Extract<ThreadItem, { kind: 'msg' }>[]
    expect(msgs).toHaveLength(2)
    expect(msgs[0].text).toBe('hi')
    expect(msgs[1].text).toBe('bye')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('reducer — R4 done 매칭', () => {
  it('R4-a: orchestration push 후 tool_result(ok:true) → running:false', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(mkOrchEvent({ id: 'wf1', name: 'my-flow' })))
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_result', id: 'wf1', ok: true, output: '결과텍스트' }))

    const cards = orchCards(s2)
      expect(cards[0].running).toBe(false)
  })

  it('R4-b: done 매칭 → result 필드 설정', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(mkOrchEvent({ id: 'wf1', name: 'my-flow' })))
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_result', id: 'wf1', ok: true, output: '결과텍스트' }))

    const cards = orchCards(s2)
      expect(cards[0].result).toBe('결과텍스트')
  })

  it('R4-c: done 매칭 → failed falsy', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(mkOrchEvent({ id: 'wf1', name: 'my-flow' })))
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_result', id: 'wf1', ok: true, output: '결과' }))

    const cards = orchCards(s2)
      expect(cards[0].failed).toBeFalsy()
  })

  it('R4-d: done 매칭 후 thread 항목 수 불변 (새 카드 추가 0)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(mkOrchEvent({ id: 'wf1', name: 'my-flow' })))
    const lenAfterPush = s1.thread.length

    const s2 = applyAgentEvent(s1, payload({ type: 'tool_result', id: 'wf1', ok: true, output: '결과' }))
    expect(s2.thread.length).toBe(lenAfterPush) // in-place 갱신
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('reducer — R5 failed 매칭', () => {
  it('R5-a: tool_result(ok:false) → running:false, failed:true', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(mkOrchEvent({ id: 'wf1', name: 'my-flow' })))
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_result', id: 'wf1', ok: false, output: 'err' }))

    const cards = orchCards(s2)
      expect(cards[0].running).toBe(false)
      expect(cards[0].failed).toBe(true)
  })

  it('R5-b: failed → result 필드에 오류 출력 포함', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(mkOrchEvent({ id: 'wf1', name: 'my-flow' })))
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_result', id: 'wf1', ok: false, output: 'err-msg' }))

    const cards = orchCards(s2)
      expect(cards[0].result).toBe('err-msg')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('reducer — R6 P-2 매칭 우선/격리', () => {
  it('R6-a: orchestration + toolgroup 공존 시, orchestration tool_result → orchestration만 갱신', () => {
    const s0 = makeInitialState()
    // 일반 tool_call (toolgroup 생성)
    const s1 = applyAgentEvent(s0, payload({ type: 'tool_call', id: 'read-001', name: 'Read', input: {} }))
    // orchestration 카드 push
    const s2 = applyAgentEvent(s1, payload(mkOrchEvent({ id: 'wf1', name: 'flow' })))
    // orchestration tool_result
    const s3 = applyAgentEvent(s2, payload({ type: 'tool_result', id: 'wf1', ok: true, output: '완료' }))

    // orchestration 카드 갱신됨
    const orchs = orchCards(s3)
      expect(orchs[0].running).toBe(false)
      expect(orchs[0].result).toBe('완료')

    // toolgroup의 Read 카드는 여전히 running
    const toolgroups = s3.thread.filter(i => i.kind === 'toolgroup') as Extract<ThreadItem, { kind: 'toolgroup' }>[]
    expect(toolgroups).toHaveLength(1)
    expect(toolgroups[0].tools[0].status).toBe('running')
  })

  it('R6-b: 일반 도구 tool_result는 toolgroup 갱신(orchstration 무영향)', () => {
    const s0 = makeInitialState()
    // 일반 tool_call
    const s1 = applyAgentEvent(s0, payload({ type: 'tool_call', id: 'read-001', name: 'Read', input: {} }))
    // orchestration 카드
    const s2 = applyAgentEvent(s1, payload(mkOrchEvent({ id: 'wf1', name: 'flow' })))
    // 일반 tool_result(read-001)
    const s3 = applyAgentEvent(s2, payload({ type: 'tool_result', id: 'read-001', ok: true, output: 'file content' }))

    // orchestration 카드는 여전히 running
    const orchs = orchCards(s3)
      expect(orchs[0].running).toBe(true)

    // toolgroup의 Read 카드는 done으로 갱신됨
    const toolgroups = s3.thread.filter(i => i.kind === 'toolgroup') as Extract<ThreadItem, { kind: 'toolgroup' }>[]
    expect(toolgroups[0].tools[0].status).toBe('done')
  })

  it('R6-c: 두 orchestration 카드 공존 시 id 매칭 정확도', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(mkOrchEvent({ id: 'wf1', name: 'flow-1' })))
    const s2 = applyAgentEvent(s1, payload(mkOrchEvent({ id: 'wf2', name: 'flow-2' })))
    // wf1만 done
    const s3 = applyAgentEvent(s2, payload({ type: 'tool_result', id: 'wf1', ok: true, output: '결과1' }))

    const orchs = orchCards(s3)
    expect(orchs).toHaveLength(2)

    // wf1 → done
      const wf1 = orchs.find((c: unknown) => (c as { id: string }).id === 'wf1')
      expect(wf1?.running).toBe(false)

    // wf2 → 여전히 running
      const wf2 = orchs.find((c: unknown) => (c as { id: string }).id === 'wf2')
      expect(wf2?.running).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('reducer — R7 미매칭 안전', () => {
  it('R7-a: 매칭되는 orchestration 없는 tool_result → 기존 toolgroup 매칭 시도 (무파손)', () => {
    const s0 = makeInitialState()
    // 일반 tool_call
    const s1 = applyAgentEvent(s0, payload({ type: 'tool_call', id: 'read-999', name: 'Read', input: {} }))
    // 엉뚱한 id로 tool_result (orchestration 없음)
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_result', id: 'read-999', ok: true, output: 'content' }))

    // toolgroup 내 카드가 정상 갱신됨 (기존 동작 보장)
    const toolgroups = s2.thread.filter(i => i.kind === 'toolgroup') as Extract<ThreadItem, { kind: 'toolgroup' }>[]
    expect(toolgroups[0].tools[0].status).toBe('done')
    // orchestration 카드 없음
    expect(orchCards(s2)).toHaveLength(0)
  })

  it('R7-b: 완전히 미매칭 tool_result(id 누구도 없음) → state 구조 무파손', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload(mkOrchEvent({ id: 'wf1', name: 'flow' })))
    // 존재하지 않는 id
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_result', id: 'nonexistent-999', ok: true, output: 'x' }))

    // orchestration 카드는 여전히 running (미매칭이므로 갱신 안 됨)
    const orchs = orchCards(s2)
      expect(orchs[0].running).toBe(true)
    // 크래시 없음 (여기까지 도달하면 정상)
    expect(s2.thread.length).toBe(s1.thread.length)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// F-C: orchestration_progress 라이브 갱신 + done 백스톱
// ═══════════════════════════════════════════════════════════════════════════════

/** orchestration_progress 이벤트 픽스처 */
function mkProgressEvent(opts: {
  id: string
  status: 'running' | 'completed' | 'failed'
  summary?: string
  phases?: string[]
  agents?: { label: string; phase?: string; state: 'queued' | 'running' | 'done'; tokens?: number; resultPreview?: string }[]
}) {
  return {
    type: 'orchestration_progress' as const,
    id: opts.id,
    status: opts.status,
    ...(opts.summary !== undefined ? { summary: opts.summary } : {}),
    ...(opts.phases !== undefined ? { phases: opts.phases } : {}),
    ...(opts.agents !== undefined ? { agents: opts.agents } : {}),
  }
}

describe('reducer — F-C orchestration_progress 라이브 갱신', () => {
  it('P1: 카드 존재 시 progress(running, phases, agents) → 라이브 필드 갱신, running 유지', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload(mkOrchEvent({ id: 'wf1', name: 'flow' })))
    s = applyAgentEvent(s, payload(mkProgressEvent({
      id: 'wf1', status: 'running', phases: ['Probe'],
      agents: [{ label: 'a', phase: 'Probe', state: 'running', tokens: 100 }],
    })))

    const card = orchCards(s)[0] as Record<string, unknown>
    expect(card.running).toBe(true)
    expect(card.liveStatus).toBe('running')
    expect(card.livePhases).toEqual(['Probe'])
    expect((card.agents as unknown[])).toHaveLength(1)
    expect((card.agents as Array<{ label: string }>)[0].label).toBe('a')
  })

  it('P2: progress(completed) → 카드 running:false + liveStatus:completed', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload(mkOrchEvent({ id: 'wf1', name: 'flow' })))
    s = applyAgentEvent(s, payload(mkProgressEvent({ id: 'wf1', status: 'completed', summary: 'done!' })))

    const card = orchCards(s)[0] as Record<string, unknown>
    expect(card.running).toBe(false)
    expect(card.liveStatus).toBe('completed')
    expect(card.liveSummary).toBe('done!')
  })

  it('P3: progress(failed) → 카드 running:false + failed:true', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload(mkOrchEvent({ id: 'wf1', name: 'flow' })))
    s = applyAgentEvent(s, payload(mkProgressEvent({ id: 'wf1', status: 'failed' })))

    const card = orchCards(s)[0] as Record<string, unknown>
    expect(card.running).toBe(false)
    expect(card.failed).toBe(true)
    expect(card.liveStatus).toBe('failed')
  })

  it('P4: 병합 — phases 없는 후속 progress는 이전 livePhases 유지', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload(mkOrchEvent({ id: 'wf1', name: 'flow' })))
    s = applyAgentEvent(s, payload(mkProgressEvent({ id: 'wf1', status: 'running', phases: ['Probe'] })))
    // 후속 progress: phases 없음, agents만
    s = applyAgentEvent(s, payload(mkProgressEvent({
      id: 'wf1', status: 'running',
      agents: [{ label: 'a', state: 'done', resultPreview: 'OK' }],
    })))

    const card = orchCards(s)[0] as Record<string, unknown>
    expect(card.livePhases).toEqual(['Probe'])   // 이전 값 유지
    expect((card.agents as Array<{ state: string }>)[0].state).toBe('done')
  })

  it('P5: 미존재 id progress → state 무파손(graceful)', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload(mkOrchEvent({ id: 'wf1', name: 'flow' })))
    const before = orchCards(s)[0]
    s = applyAgentEvent(s, payload(mkProgressEvent({ id: 'NOPE', status: 'completed' })))
    const after = orchCards(s)[0]
    expect(after).toEqual(before)   // 변화 없음
  })

  it('P6: done 백스톱 — running 카드 + done 이벤트 → running:false', () => {
    let s = makeInitialState()
    s = applyAgentEvent(s, payload(mkOrchEvent({ id: 'wf1', name: 'flow' })))
    // progress 완료 신호 없이 곧장 done (task_notification 누락 시나리오)
    s = applyAgentEvent(s, payload({ type: 'done' }))

    const card = orchCards(s)[0] as Record<string, unknown>
    expect(card.running).toBe(false)
  })
})
