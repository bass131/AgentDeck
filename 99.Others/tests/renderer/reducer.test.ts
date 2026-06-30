/**
 * reducer.test.ts — applyAgentEvent 순수 리듀서 단위 테스트.
 * Node 환경(window.api 불필요). 각 AgentEvent 케이스를 검증.
 *
 * Phase A-2 이행: streamingText/toolCards 평면 필드 제거 → thread 인터리브 모델 기반 단언.
 * - text 이벤트 → thread의 assistant msg 누적
 * - tool_call 이벤트 → thread의 toolgroup 내 ToolCard 추가
 * - tool_result 이벤트 → thread toolgroup 내 카드 in-place 갱신
 */
import { describe, it, expect } from 'vitest'
import {
  applyAgentEvent,
  makeInitialState,
} from '../../../02.Source/renderer/src/store/reducer'
import type { AppState } from '../../../02.Source/renderer/src/store/reducer'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

const runId = 'run-001'

function payload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

// ── 헬퍼: thread에서 assistant msg 텍스트 추출 ─────────────────────────────────

function lastAssistantText(state: AppState): string {
  const msgs = state.thread
    .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> =>
      item.kind === 'msg' && item.role === 'assistant'
    )
  return msgs[msgs.length - 1]?.text ?? ''
}

function allToolCards(state: AppState) {
  return state.thread
    .filter((item): item is Extract<ThreadItem, { kind: 'toolgroup' }> => item.kind === 'toolgroup')
    .flatMap((group) => group.tools)
}

describe('applyAgentEvent', () => {
  it('text 이벤트가 thread의 assistant msg에 텍스트를 누적한다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: 'Hello' }))
    const s2 = applyAgentEvent(s1, payload({ type: 'text', delta: ' World' }))
    // thread의 assistant msg에 누적
    expect(lastAssistantText(s2)).toBe('Hello World')
    // thread에 msg 1개 있어야 함(같은 openMsgId에 누적)
    const assistantMsgs = s2.thread.filter(
      (item): item is Extract<ThreadItem, { kind: 'msg' }> =>
        item.kind === 'msg' && item.role === 'assistant'
    )
    expect(assistantMsgs).toHaveLength(1)
  })

  it('tool_call 이벤트가 thread toolgroup에 도구 카드를 추가한다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({ type: 'tool_call', id: 'tc-1', name: 'bash', input: { command: 'ls' } })
    )
    const cards = allToolCards(s1)
    expect(cards).toHaveLength(1)
    expect(cards[0].id).toBe('tc-1')
    expect(cards[0].name).toBe('bash')
    expect(cards[0].status).toBe('running')
    expect(cards[0].result).toBeUndefined()
  })

  it('tool_result 이벤트가 thread toolgroup 내 해당 카드를 갱신한다 (ok)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({ type: 'tool_call', id: 'tc-1', name: 'bash', input: {} })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({ type: 'tool_result', id: 'tc-1', ok: true, output: 'done' })
    )
    const card = allToolCards(s2).find((c) => c.id === 'tc-1')
    expect(card?.status).toBe('done')
    expect(card?.result).toBe('done')
  })

  it('tool_result 이벤트가 thread toolgroup 내 해당 카드를 갱신한다 (error)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({ type: 'tool_call', id: 'tc-2', name: 'read_file', input: {} })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({ type: 'tool_result', id: 'tc-2', ok: false, output: 'not found' })
    )
    const card = allToolCards(s2).find((c) => c.id === 'tc-2')
    expect(card?.status).toBe('error')
    expect(card?.result).toBe('not found')
  })

  it('file_changed 이벤트가 변경파일 set에 추가한다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({ type: 'file_changed', path: 'src/foo.ts', change: 'modify' })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({ type: 'file_changed', path: 'src/bar.ts', change: 'add' })
    )
    expect(s2.changedFiles.has('src/foo.ts')).toBe(true)
    expect(s2.changedFiles.has('src/bar.ts')).toBe(true)
    expect(s2.changedFiles.size).toBe(2)
  })

  it('file_changed 중복 경로가 set에 한 번만 기록된다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({ type: 'file_changed', path: 'src/foo.ts', change: 'modify' })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({ type: 'file_changed', path: 'src/foo.ts', change: 'modify' })
    )
    expect(s2.changedFiles.size).toBe(1)
  })

  it('done 이벤트가 실행 종료 상태로 전환하고 usage를 저장한다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({
        type: 'done',
        usage: { inputTokens: 100, outputTokens: 200 },
      })
    )
    expect(s1.isRunning).toBe(false)
    expect(s1.lastUsage).toEqual({ inputTokens: 100, outputTokens: 200 })
  })

  it('done 이벤트에 usage 없어도 isRunning이 false가 된다', () => {
    const s0 = { ...makeInitialState(), isRunning: true }
    const s1 = applyAgentEvent(s0, payload({ type: 'done' }))
    expect(s1.isRunning).toBe(false)
    expect(s1.lastUsage).toBeUndefined()
  })

  it('error 이벤트가 에러 메시지를 기록하고 isRunning을 false로 한다', () => {
    const s0 = { ...makeInitialState(), isRunning: true }
    const s1 = applyAgentEvent(
      s0,
      payload({ type: 'error', message: '엔진 오류' })
    )
    expect(s1.isRunning).toBe(false)
    expect(s1.errorMessage).toBe('엔진 오류')
  })

  it('리듀서는 원본 상태를 변경하지 않는다 (순수함수)', () => {
    const s0 = makeInitialState()
    const frozen = Object.freeze(s0)
    // freeze된 객체에 applyAgentEvent를 적용해도 에러가 없어야 함
    const s1 = applyAgentEvent(frozen as typeof s0, payload({ type: 'text', delta: 'x' }))
    expect(s1).not.toBe(frozen)
    // 원본 thread는 여전히 빈 배열 (불변)
    expect(frozen.thread).toHaveLength(0)
  })

  it('done 이벤트 후 thread의 assistant msg가 보존된다', () => {
    // Phase A-2: done에 별도 확정 없음 — text 도착 즉시 thread에 들어감
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: '응답 텍스트', messageId: 'msg-1' }))
    const s2 = applyAgentEvent(s1, payload({ type: 'done' }))
    // done 후에도 thread의 assistant msg 보존됨
    expect(lastAssistantText(s2)).toBe('응답 텍스트')
    expect(s2.openMsgId).toBeNull()
    expect(s2.openGroupId).toBeNull()
  })

  it('text → tool_call → text 인터리브: thread에 msg-toolgroup-msg 순서', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: '이전', messageId: 'msg-a' }))
    const s2 = applyAgentEvent(s1, payload({ type: 'tool_call', id: 'tc-1', name: 'bash', input: {} }))
    const s3 = applyAgentEvent(s2, payload({ type: 'text', delta: '이후', messageId: 'msg-b' }))
    expect(s3.thread).toHaveLength(3)
    expect(s3.thread[0].kind).toBe('msg')
    expect(s3.thread[1].kind).toBe('toolgroup')
    expect(s3.thread[2].kind).toBe('msg')
  })
})
