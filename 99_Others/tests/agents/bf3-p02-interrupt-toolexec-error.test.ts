/**
 * bf3-p02-interrupt-toolexec-error.test.ts — BF3-backlog-sweep Phase 02 RED 테스트(TDD 선작성).
 *
 * 배경(01.Phases/BF3-backlog-sweep/02-interrupt-error-copy.md):
 *   BF1-interrupt-loop P03이 잡은 경로는 "interrupt() 호출 → SDK가 result(is_error) 메시지를
 *   *emit*(throw 아님)" 케이스뿐이다(bf1-interrupt-error-mislabel.test.ts, 이미 GREEN).
 *   그 경로는 정규 for-await 루프 안에서 `_interrupted && e.type==='error'`로 이미 suppress된다
 *   (claudeAgentRun.ts _runPersistentPump 정규 루프, ~:626-629).
 *
 *   이 파일이 겨누는 잔여 경로는 다르다: tool_use(도구) **실행 도중** interrupt() 호출 시
 *   진행 중이던 SDK 스트림/도구 프로미스가 **throw**로 귀결하는 경우(예: 실행 중이던 프로세스가
 *   중단 신호로 reject) — 그 throw는 for-await 밖으로 전파돼 펌프의 catch 블록
 *   (claudeAgentRun.ts _runPump ~:480-488, _runPersistentPump ~:672-679)에 도달한다. 그 catch는
 *   `_interrupted` 여부를 확인하지 않고 무조건 `Agent execution error: ${msg}`로 재라벨해
 *   push한다 — 정지 자체는 되지만(펌프가 종료·done) 사용자에게 위협적인 영문 기술 에러 문구가
 *   뜬다(재현: "안녕 → 채팅 네모(stop) → 정상 중단되지만 에러 배너 노출").
 *
 * ── 시나리오 모델링 ──────────────────────────────────────────────────────────────
 *
 *   mock queryFn: tool_use(assistant) 블록 1개를 yield한 뒤(=도구 실행 착수 모델링),
 *   "도구 실행 중" 대기 지점에서 멈춘다. interrupt()가 호출되면 그 대기 Promise를
 *   **reject**(bf1 스위트의 resolve와 대비 — 여기가 그 잔여 경로) → for-await가 throw.
 *
 * ⚠️ 이 파일은 테스트만 작성한다(RED 우선). 02.Source/main/01_agents/claudeAgentRun.ts의
 *   catch 2곳 수리는 이 커밋의 GREEN 단계에서 함께 반영한다(TDD: RED 커밋 로그는
 *   실행 트랜스크립트로 남긴다 — 파일 자체는 최종 GREEN 상태로 저장).
 *
 * mock 패턴: bf1-interrupt-error-mislabel.test.ts의 makeInterruptibleQueryFn(resolve 버전)을
 *   reject 버전으로 변형 재사용.
 */
import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

// ── 공통 픽스처 ───────────────────────────────────────────────────────────────

/** assistant(tool_use) 메시지 픽스처 — 도구 실행 착수 모델링. */
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

/**
 * "tool_use 실행 도중 interrupt() → SDK 스트림이 throw로 귀결한다"를 모델링(잔여 경로).
 *
 * bf1 스위트의 makeInterruptibleQueryFn과 대비: 대기 지점에서 interrupt() 호출 시
 * **reject**(throw) — bf1은 resolve(SDK가 result 메시지 emit) 케이스만 다뤘다.
 *
 * persistent: true/false 양쪽에서 재사용할 수 있도록 prompt를 string과 AsyncIterable
 * 양쪽으로 처리한다(단발은 string, 지속세션은 AsyncIterable — claudeAgentRun.ts 분기 미러).
 */
function makeToolExecInterruptThrowQueryFn(): {
  queryFn: QueryFn
  ready: Promise<void>
} {
  let rejectInterruptWait: ((err: Error) => void) | null = null
  let readyResolve: (() => void) | null = null
  const ready = new Promise<void>((r) => { readyResolve = r })

  const queryFn: QueryFn = function (p) {
    const gen = (async function* () {
      // 지속세션(AsyncIterable prompt)이면 초기 input을 1개 소비(단발은 string이라 스킵).
      if (p.prompt !== null && typeof p.prompt === 'object' && Symbol.asyncIterator in (p.prompt as object)) {
        const promptIterable = (p.prompt as unknown) as AsyncIterable<unknown>
        const inputIter = promptIterable[Symbol.asyncIterator]()
        const first = await inputIter.next()
        if (first.done) return
      }

      // tool_use 착수 (도구 실행 중 모델링)
      yield mkAssistantToolUse('tool-exec-1', 'Bash', { command: 'sleep 100' })

      // 도구 실행 도중 대기 — interrupt() 호출 시 reject(throw)로 귀결(bf1과 대비되는 잔여 경로)
      await new Promise<void>((_resolve, reject) => {
        rejectInterruptWait = reject
        readyResolve?.()
      })
    })()

    // SDK query 핸들의 interrupt() — reject를 트리거해 진행 중 for-await를 throw시킨다.
    ;(gen as unknown as Record<string, unknown>)['interrupt'] = async () => {
      if (rejectInterruptWait) {
        const r = rejectInterruptWait
        rejectInterruptWait = null
        r(new Error('Claude Code process exited with code 143'))
      }
    }

    return gen as AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
  }

  return { queryFn, ready }
}

/** interrupt와 무관한 순수 SDK 장애(회귀 기준 — genuine error) mock. */
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

// ── ① 단발 펌프: tool_use 실행 도중 interrupt throw ───────────────────────────────

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

// ── ② 지속세션 펌프: tool_use 실행 도중 interrupt throw ─────────────────────────────

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
    // 지속세션 catch는 finally에서 close() → for-await 자연 종료. abort() 불필요하나,
    // 혹시 close가 지연되는 경우를 대비해 테스트 hang 방지로 abort() 후 consume.
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

// ── ③ 회귀: interrupt 아닌 진짜 SDK 에러는 기존과 동일하게 표면화 ───────────────────

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
