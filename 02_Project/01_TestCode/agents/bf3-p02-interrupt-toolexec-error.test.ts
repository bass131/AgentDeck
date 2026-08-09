import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../../02_Project/00_Source/shared/agentEvents'
import { makeInterruptibleQueryFn } from './helpers/fakeQuery'

function mkAssistantToolUse(id: string, name: string, input: unknown) {
  return {
    type: 'assistant' as const,
    message: {
      role: 'assistant' as const,
      content: [{ type: 'tool_use', id, name, input }],
    },
    parent_tool_use_id: null,
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
        case 'tool_call':
          return `[${i}]tool_call(name=${JSON.stringify(rec['name'])})`
        case 'done':
          return `[${i}]done(origin=${JSON.stringify(rec['origin'])})`
        default:
          return `[${i}]${e.type}`
      }
    })
    .join(' → ')
}

function makeToolExecInterruptThrowQueryFn(): {
  queryFn: QueryFn
  ready: Promise<void>
} {
  return makeInterruptibleQueryFn({
    before: [mkAssistantToolUse('tool-exec-1', 'Bash', { command: 'sleep 100' })],
    reject: new Error('Claude Code process exited with code 143'),
  })
}

function makeGenuineThrowQueryFn(message: string): QueryFn {
  return function (p) {
    const gen = (async function* () {
      if (p.prompt !== null && typeof p.prompt === 'object' && Symbol.asyncIterator in (p.prompt as object)) {
        const promptIterable = (p.prompt as unknown) as AsyncIterable<unknown>
        const inputIter = promptIterable[Symbol.asyncIterator]()
        const first = await inputIter.next()
        if (first.done) return
      }
      yield mkAssistantToolUse('tool-exec-2', 'Bash', { command: 'echo hi' })
      throw new Error(message)
    })()
    return gen as AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
  }
}

describe('BF3-P02 ① 단발 펌프(_runPump): tool_use 실행 도중 interrupt throw', () => {
  it('재현: 도구 실행 중 interrupt() → catch가 던지는 "Agent execution error" 노출 금지', async () => {
    const { queryFn, ready } = makeToolExecInterruptThrowQueryFn()
    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '긴 작업 실행해줘' }],
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await ready
    run.interrupt()
    await consume

    const types = events.map((e) => e.type)

    expect(
      types,
      `tool_use 중 interrupt throw가 "Agent execution error"로 오표면화됨 — 실제 시퀀스: ${describeEvents(events)}`
    ).not.toContain('error')
    expect(
      events.some((e) => e.type === 'error' && (e as { message: string }).message.includes('Agent execution error')),
      `error 이벤트에 "Agent execution error" 문자열 포함 — 실제 시퀀스: ${describeEvents(events)}`
    ).toBe(false)
    expect(types, describeEvents(events)).toEqual(['tool_call', 'done'])
  })
})

describe('BF3-P02 ② 지속세션 펌프(_runPersistentPump): tool_use 실행 도중 interrupt throw', () => {
  it('재현: 도구 실행 중 interrupt() → catch가 던지는 "Agent execution error" 노출 금지', async () => {
    const { queryFn, ready } = makeToolExecInterruptThrowQueryFn()
    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '긴 작업 실행해줘' }],
      persistent: true,
      sessionKey: 'bf3-p02-conv-1',
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
      `지속세션: tool_use 중 interrupt throw가 "Agent execution error"로 오표면화됨 — 실제 시퀀스: ${describeEvents(events)}`
    ).not.toContain('error')
    expect(
      types,
      `interrupt 후 done 미관측(중단 흐름 붕괴 의심) — 실제 시퀀스: ${describeEvents(events)}`
    ).toContain('done')
  })
})

describe('BF3-P02 ③ 회귀: interrupt() 미호출 상태의 진짜 SDK throw는 여전히 "Agent execution error:"로 표면화', () => {
  it('단발 펌프: interrupt() 호출 없이 발생한 throw는 기존과 동일하게 라벨링된다', async () => {
    const backend = new ClaudeCodeBackend(makeGenuineThrowQueryFn('ECONNRESET: socket hang up'))
    const run = backend.start({
      messages: [{ role: 'user', content: 'test' }],
    })

    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    const errorEvent = events.find((e) => e.type === 'error') as { message: string } | undefined
    expect(errorEvent, describeEvents(events)).toBeDefined()
    expect(errorEvent?.message, describeEvents(events)).toBe(
      'Agent execution error: ECONNRESET: socket hang up'
    )
    expect(events[events.length - 1].type, describeEvents(events)).toBe('done')
  })

  it('지속세션 펌프: interrupt() 호출 없이 발생한 throw는 기존과 동일하게 라벨링된다(세션은 종료되어도 문구 회귀는 무관)', async () => {
    const backend = new ClaudeCodeBackend(makeGenuineThrowQueryFn('ECONNRESET: socket hang up'))
    const run = backend.start({
      messages: [{ role: 'user', content: 'test' }],
      persistent: true,
      sessionKey: 'bf3-p02-conv-2',
    })

    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    const errorEvent = events.find((e) => e.type === 'error') as { message: string } | undefined
    expect(errorEvent, describeEvents(events)).toBeDefined()
    expect(errorEvent?.message, describeEvents(events)).toBe(
      'Agent execution error: ECONNRESET: socket hang up'
    )
    expect(events[events.length - 1].type, describeEvents(events)).toBe('done')
  })
})
