import { describe, it, expect, vi } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import { createRunManager } from '../../../02_Source/main/00_ipc/agentRuns'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'
import { makeInterruptibleQueryFn as makeInterruptibleQuery } from './helpers/fakeQuery'
import { mkAssistantText, mkResult as mkResultFixture } from './helpers/sdkFixtures'

const mkResult = (turnLabel = 'turn') =>
  mkResultFixture({ result: turnLabel, uuid: 'uuid-0000-0000-0000-0000-000000000000' })

function mkErrorDuringExecutionResult(numTurns = 2) {
  return {
    type: 'result' as const,
    subtype: 'error_during_execution' as const,
    is_error: true,
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: numTurns,
    total_cost_usd: 0,
    permission_denials: [],
    errors: [],
    uuid: 'uuid-err-0000-0000-0000-000000000099' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

function mkAssistantThinking(text: string) {
  return {
    type: 'assistant' as const,
    message: {
      id: 'msg_002',
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'thinking', thinking: text }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: 'uuid-think-0000-0000-0000-000000000003' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

const wait = (ms = 50) => new Promise<void>((r) => setTimeout(r, ms))

function describeEvents(events: AgentEvent[]): string {
  if (events.length === 0) return '(이벤트 0개 — 아무것도 수집되지 않음)'
  return events
    .map((e, i) => {
      const rec = e as unknown as Record<string, unknown>
      switch (e.type) {
        case 'error':
          return `[${i}]error(message=${JSON.stringify(rec['message'])})`
        case 'text':
          return `[${i}]text(delta=${JSON.stringify(rec['delta'])})`
        case 'thinking':
          return `[${i}]thinking(text=${JSON.stringify(rec['text'])})`
        case 'done':
          return `[${i}]done(origin=${JSON.stringify(rec['origin'])})`
        default:
          return `[${i}]${e.type}`
      }
    })
    .join(' → ')
}

function makeInterruptibleQueryFn(blockKind: 'text' | 'thinking'): {
  queryFn: QueryFn
  ready: Promise<void>
} {
  return makeInterruptibleQuery({
    before: [blockKind === 'text' ? mkAssistantText('생각 중...') : mkAssistantThinking('reasoning…')],
    after: [mkErrorDuringExecutionResult()],
    onNextInput: [mkResult('turn2-after-interrupt')],
  })
}

describe('BF1-interrupt ① 일반 텍스트 turn 중 interrupt (claudeAgentRun 펌프 레벨)', () => {
  it('재현: "안녕" 전송 후 텍스트 스트리밍 중 interrupt() → interrupt-result가 error 이벤트로 push되면 안 된다(현재 RED)', async () => {
    const { queryFn, ready } = makeInterruptibleQueryFn('text')
    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '안녕' }],
      persistent: true,
      sessionKey: 'bf1-conv-1',
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await ready
    run.interrupt()

    await wait()
    run.abort()
    await consume

    const types = events.map((e) => e.type)

    expect(
      types,
      `interrupt-result가 error로 오표면화됨(현재 RED 재현 시) — 실제 시퀀스: ${describeEvents(events)}`
    ).not.toContain('error')
    expect(
      types,
      `interrupt 후 done 미관측(중단 흐름 붕괴 의심) — 실제 시퀀스: ${describeEvents(events)}`
    ).toContain('done')
    expect(types, describeEvents(events)).toEqual(['text', 'done'])
  })
})

describe('BF1-interrupt ② 추론(thinking) 블록 중 interrupt (claudeAgentRun 펌프 레벨)', () => {
  it('재현: thinking 스트리밍 중 interrupt() → 텍스트 케이스와 동일하게 error 없이 처리돼야 한다(현재 RED)', async () => {
    const { queryFn, ready } = makeInterruptibleQueryFn('thinking')
    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '복잡한 질문' }],
      persistent: true,
      sessionKey: 'bf1-conv-2',
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await ready
    run.interrupt()
    await wait()
    run.abort()
    await consume

    const types = events.map((e) => e.type)

    expect(
      types,
      `interrupt-result가 error로 오표면화됨(thinking 블록, 현재 RED 재현 시) — 실제 시퀀스: ${describeEvents(events)}`
    ).not.toContain('error')
    expect(
      types,
      `interrupt 후 done 미관측(중단 흐름 붕괴 의심) — 실제 시퀀스: ${describeEvents(events)}`
    ).toContain('done')
    expect(types, describeEvents(events)).toEqual(['thinking', 'done'])
  })
})

describe('BF1-interrupt ③ interrupt 후 세션 생존 (RunManager 통합)', () => {
  it('P03 GREEN: interrupt-result error가 suppress돼 agentRuns.ts:198 terminal 판정을 피함 → 같은 sessionKey 재시작이 기존 세션을 찾아 push로 라우팅된다(backend.start는 1회만)', async () => {
    const { queryFn, ready } = makeInterruptibleQueryFn('text')
    const backend = new ClaudeCodeBackend(queryFn)
    const startSpy = vi.spyOn(backend, 'start')
    const manager = createRunManager()

    const events: AgentEvent[] = []
    const runId = await manager.start(
      backend,
      { messages: [{ role: 'user', content: '안녕' }], persistent: true, sessionKey: 'bf1-conv-3' },
      (e) => events.push(e),
    )

    await ready
    manager.interrupt(runId)

    await manager.start(
      backend,
      { messages: [{ role: 'user', content: '후속 메시지' }], persistent: true, sessionKey: 'bf1-conv-3' },
      () => {},
    )

    await wait()

    expect(
      events.some((e) => e.type === 'error'),
      `RunManager onEvent에 error가 표면화됨(:198 terminal 오판정 재현 시) — 실제 시퀀스: ${describeEvents(events)}`
    ).toBe(false)

    expect(
      startSpy.mock.calls.length,
      `backend.start() 호출 횟수 불일치(세션 재시작 = 죽음 재현 의심) — ` +
        `실제 ${startSpy.mock.calls.length}회, sessionKey들: ` +
        `${JSON.stringify(startSpy.mock.calls.map((call) => (call[0] as { sessionKey?: string }).sessionKey))}, ` +
        `이벤트 시퀀스: ${describeEvents(events)}`
    ).toBe(1)
  })
})
