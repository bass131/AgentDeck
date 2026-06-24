/**
 * thread-interleave.test.ts — Phase A-2: ThreadItem 인터리브 reducer 단위 테스트.
 *
 * TDD: 이 파일이 먼저 FAIL → threadTypes + reducer 재작성 후 PASS.
 *
 * 검증:
 * 1. text(msgId=a)→tool_call→text(msgId=b) → thread=[msg(a),toolgroup,msg(b)] (msg 2개 분리)
 * 2. 연속 tool 2개 + 사이 text → 새 toolgroup(openGroupId reset)
 * 3. 같은 messageId 연속 text → 1 msg 누적
 * 4. tool_result가 thread toolgroup 내 카드 갱신
 * 5. done이 openMsgId/openGroupId reset
 * 6. degrade: messageId undefined → 단일 버블(회귀 아님)
 * 7. round-trip: user msg push → thread에 반영
 * 8. makeInitialState thread:[], openGroupId:null, openMsgId:null, seq:0
 */
import { describe, it, expect } from 'vitest'
import {
  applyAgentEvent,
  makeInitialState,
} from '../../src/renderer/src/store/reducer'
import type { AppState } from '../../src/renderer/src/store/reducer'
import type { ThreadItem } from '../../src/renderer/src/store/threadTypes'
import type { AgentEventPayload } from '../../src/shared/ipc-contract'

const runId = 'run-thread'

function payload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

// ── 헬퍼: thread 타입 단언 ──────────────────────────────────────────────────────

function thread(s: AppState): ThreadItem[] {
  return (s as AppState & { thread: ThreadItem[] }).thread
}

function openGroupId(s: AppState): string | null {
  return (s as AppState & { openGroupId: string | null }).openGroupId
}

function openMsgId(s: AppState): string | null {
  return (s as AppState & { openMsgId: string | null }).openMsgId
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('makeInitialState — thread 필드', () => {
  it('thread:[], openGroupId:null, openMsgId:null, seq:0', () => {
    const s = makeInitialState()
    expect(thread(s)).toEqual([])
    expect(openGroupId(s)).toBeNull()
    expect(openMsgId(s)).toBeNull()
    expect((s as AppState & { seq: number }).seq).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('인터리브 렌더링 — text(messageId) 경계', () => {
  it('같은 messageId text 이벤트 연속 → 1개 msg에 누적', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: 'hello ', messageId: 'msg-a' }))
    const s2 = applyAgentEvent(s1, payload({ type: 'text', delta: 'world', messageId: 'msg-a' }))
    const th = thread(s2)
    // msg 1개만 있어야 함
    expect(th.filter(i => i.kind === 'msg')).toHaveLength(1)
    const msg = th.find(i => i.kind === 'msg') as Extract<ThreadItem, { kind: 'msg' }>
    expect(msg.text).toBe('hello world')
    expect(msg.id).toBe('msg-a')
  })

  it('서로 다른 messageId → 2개 별도 msg', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: 'first', messageId: 'msg-a' }))
    // tool_call 중간에 삽입 (openGroupId를 리셋해야 함)
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_call', id: 'tc-1', name: 'bash', input: {} }))
    const s3 = applyAgentEvent(s2, payload({ type: 'text', delta: 'second', messageId: 'msg-b' }))
    const th = thread(s3)
    const msgs = th.filter(i => i.kind === 'msg') as Extract<ThreadItem, { kind: 'msg' }>[]
    expect(msgs).toHaveLength(2)
    expect(msgs[0].text).toBe('first')
    expect(msgs[1].text).toBe('second')
  })

  it('text → tool_call → text 순서 → thread=[msg-a, toolgroup, msg-b]', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: 'before', messageId: 'msg-a' }))
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_call', id: 'tc-1', name: 'bash', input: {} }))
    const s3 = applyAgentEvent(s2, payload({ type: 'text', delta: 'after', messageId: 'msg-b' }))

    const th = thread(s3)
    expect(th).toHaveLength(3)
    expect(th[0].kind).toBe('msg')
    expect(th[1].kind).toBe('toolgroup')
    expect(th[2].kind).toBe('msg')
    const msg0 = th[0] as Extract<ThreadItem, { kind: 'msg' }>
    const msg2 = th[2] as Extract<ThreadItem, { kind: 'msg' }>
    expect(msg0.text).toBe('before')
    expect(msg2.text).toBe('after')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('인터리브 렌더링 — tool_call 그룹핑', () => {
  it('연속 tool_call 2개 → 같은 toolgroup에 속함', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'tool_call', id: 'tc-1', name: 'bash', input: {} }))
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_call', id: 'tc-2', name: 'read_file', input: {} }))
    const th = thread(s2)
    const groups = th.filter(i => i.kind === 'toolgroup') as Extract<ThreadItem, { kind: 'toolgroup' }>[]
    expect(groups).toHaveLength(1)
    expect(groups[0].tools).toHaveLength(2)
  })

  it('text 이벤트 → tool_call 시 새 toolgroup 생성 (openGroupId reset)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'tool_call', id: 'tc-1', name: 'bash', input: {} }))
    // text 이벤트로 openGroupId 닫힘
    const s2 = applyAgentEvent(s1, payload({ type: 'text', delta: 'x', messageId: 'msg-a' }))
    // 다시 tool_call → 새 그룹
    const s3 = applyAgentEvent(s2, payload({ type: 'tool_call', id: 'tc-2', name: 'write', input: {} }))
    const th = thread(s3)
    const groups = th.filter(i => i.kind === 'toolgroup') as Extract<ThreadItem, { kind: 'toolgroup' }>[]
    expect(groups).toHaveLength(2)
    expect(groups[0].tools).toHaveLength(1)
    expect(groups[1].tools).toHaveLength(1)
  })

  it('tool_call → thread에 toolgroup 추가, openGroupId 설정', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'tool_call', id: 'tc-1', name: 'bash', input: {} }))
    expect(openGroupId(s1)).not.toBeNull()
    const th = thread(s1)
    expect(th.filter(i => i.kind === 'toolgroup')).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('tool_result → thread toolgroup 내 카드 갱신', () => {
  it('tool_result ok → thread toolgroup의 해당 카드 status=done', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'tool_call', id: 'tc-1', name: 'bash', input: {} }))
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_result', id: 'tc-1', ok: true, output: 'done' }))
    const th = thread(s2)
    const group = th.find(i => i.kind === 'toolgroup') as Extract<ThreadItem, { kind: 'toolgroup' }>
    expect(group).toBeDefined()
    expect(group.tools[0].status).toBe('done')
    expect(group.tools[0].result).toBe('done')
  })

  it('tool_result error → thread toolgroup의 해당 카드 status=error', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'tool_call', id: 'tc-x', name: 'write', input: {} }))
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_result', id: 'tc-x', ok: false, output: 'failed' }))
    const th = thread(s2)
    const group = th.find(i => i.kind === 'toolgroup') as Extract<ThreadItem, { kind: 'toolgroup' }>
    expect(group.tools[0].status).toBe('error')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('done 이벤트 → openMsgId/openGroupId reset', () => {
  it('done 이벤트 → openMsgId=null, openGroupId=null', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: 'x', messageId: 'msg-a' }))
    const s2 = applyAgentEvent(s1, payload({ type: 'done' }))
    expect(openMsgId(s2)).toBeNull()
    expect(openGroupId(s2)).toBeNull()
  })

  it('done 이벤트 → isRunning=false', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: 'x', messageId: 'msg-a' }))
    const s2 = applyAgentEvent(s1, payload({ type: 'done' }))
    expect(s2.isRunning).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('degrade: messageId 없으면 단일 버블', () => {
  it('messageId undefined → openMsgId에 누적(없으면 새 합성)', () => {
    const s0 = makeInitialState()
    // messageId 없는 text 2회 → 같은 버블에 누적
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: 'a' }))
    const s2 = applyAgentEvent(s1, payload({ type: 'text', delta: 'b' }))
    const th = thread(s2)
    const msgs = th.filter(i => i.kind === 'msg') as Extract<ThreadItem, { kind: 'msg' }>[]
    expect(msgs).toHaveLength(1)
    expect(msgs[0].text).toBe('ab')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('text 이벤트 → openGroupId=null (도구 그룹 닫기)', () => {
  it('text 이벤트 후 openGroupId=null', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'tool_call', id: 'tc-1', name: 'bash', input: {} }))
    expect(openGroupId(s1)).not.toBeNull()
    const s2 = applyAgentEvent(s1, payload({ type: 'text', delta: 'x', messageId: 'msg-a' }))
    expect(openGroupId(s2)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('tool_call 이벤트 → openMsgId=null (텍스트 블록 닫기)', () => {
  it('tool_call 이벤트 후 openMsgId=null', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: 'x', messageId: 'msg-a' }))
    expect(openMsgId(s1)).toBe('msg-a')
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_call', id: 'tc-1', name: 'bash', input: {} }))
    expect(openMsgId(s2)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('user msg thread push (round-trip)', () => {
  it('thread에 user msg kind 있음', () => {
    // appStore의 sendMessage가 thread에 push하는 것을 직접 테스트하기 어려우므로
    // thread에 직접 user msg가 있을 때 검증
    const s0 = makeInitialState()
    // thread에 user msg 수동 추가 후 assistant text 추가
    const userMsg: ThreadItem = { kind: 'msg', id: 'u1', role: 'user', text: 'hello' }
    const withUser = { ...s0, thread: [userMsg] } as AppState & { thread: ThreadItem[] }
    const s1 = applyAgentEvent(withUser as AppState, payload({ type: 'text', delta: 'reply', messageId: 'msg-a' }))
    const th = thread(s1)
    expect(th[0].kind).toBe('msg')
    expect((th[0] as Extract<ThreadItem, { kind: 'msg' }>).role).toBe('user')
    expect(th[1].kind).toBe('msg')
    expect((th[1] as Extract<ThreadItem, { kind: 'msg' }>).role).toBe('assistant')
  })
})
