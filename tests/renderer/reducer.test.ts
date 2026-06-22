/**
 * reducer.test.ts — applyAgentEvent 순수 리듀서 단위 테스트.
 * Node 환경(window.api 불필요). 각 AgentEvent 케이스를 검증.
 */
import { describe, it, expect } from 'vitest'
import {
  applyAgentEvent,
  makeInitialState,
} from '../../src/renderer/src/store/reducer'
import type { AgentEventPayload } from '../../src/shared/ipc-contract'

const runId = 'run-001'

function payload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

describe('applyAgentEvent', () => {
  it('text 이벤트가 스트리밍 텍스트를 누적한다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, payload({ type: 'text', delta: 'Hello' }))
    const s2 = applyAgentEvent(s1, payload({ type: 'text', delta: ' World' }))
    expect(s2.streamingText).toBe('Hello World')
  })

  it('tool_call 이벤트가 도구 카드를 추가한다', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({ type: 'tool_call', id: 'tc-1', name: 'bash', input: { command: 'ls' } })
    )
    expect(s1.toolCards).toHaveLength(1)
    expect(s1.toolCards[0].id).toBe('tc-1')
    expect(s1.toolCards[0].name).toBe('bash')
    expect(s1.toolCards[0].status).toBe('running')
    expect(s1.toolCards[0].result).toBeUndefined()
  })

  it('tool_result 이벤트가 해당 카드를 채운다 (ok)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({ type: 'tool_call', id: 'tc-1', name: 'bash', input: {} })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({ type: 'tool_result', id: 'tc-1', ok: true, output: 'done' })
    )
    const card = s2.toolCards.find((c) => c.id === 'tc-1')
    expect(card?.status).toBe('done')
    expect(card?.result).toBe('done')
  })

  it('tool_result 이벤트가 해당 카드를 채운다 (error)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({ type: 'tool_call', id: 'tc-2', name: 'read_file', input: {} })
    )
    const s2 = applyAgentEvent(
      s1,
      payload({ type: 'tool_result', id: 'tc-2', ok: false, output: 'not found' })
    )
    const card = s2.toolCards.find((c) => c.id === 'tc-2')
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
    expect(frozen.streamingText).toBe('')
  })
})
