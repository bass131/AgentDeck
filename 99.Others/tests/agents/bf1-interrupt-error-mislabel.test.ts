/**
 * bf1-interrupt-error-mislabel.test.ts — BF1-interrupt-loop Phase 02 RED 테스트(TDD 선작성).
 *
 * 재현 시나리오(영호 라이브 재현): "안녕 → 채팅 네모(stop) 버튼으로 interrupt → 중단은 되지만
 * 에러 이벤트가 잘못 뜬다."
 *
 * P01 확정 진단(가설 C — A:펌프가드미트립/B:SDK무효는 기각):
 *   claudeAgentRun.ts의 interrupt()(약 204-217줄)는 `_queryHandle.interrupt()`만 호출하고
 *   `_aborted` 플래그는 세우지 않는다(abort()와 구별 — abort는 세션째 종료, interrupt는
 *   turn만). SDK interrupt는 streaming-input 모드(persistent=true)에서 진행 중 turn의
 *   for-await 루프에 throw를 던져 중단시킨다. 그런데 `_runPersistentPump`의 catch 블록
 *   (약 592-599줄)은 `_aborted || _abortController.signal.aborted`만 체크한다. interrupt는
 *   `_aborted`를 안 세우므로 이 가드를 통과 못 하고
 *   `{ type:'error', message:'Agent execution error: ...' }` + `{ type:'done' }`로 오라벨된다.
 *
 * 즉 "interrupt는 작동하지만, 정상 중단이 에러로 표시된다"가 버그다.
 *
 * 핵심 RED: "interrupt 시 펌프가 error 이벤트를 push하면 안 된다 — 깔끔한 중단
 * (done 또는 전용 중단 이벤트)이어야 한다." 현재 코드는 error를 push하므로 RED.
 *
 * ⚠️ 이 파일은 테스트만 작성한다 — 02.Source/**는 R only. interrupt() 로직을 고치고
 * 싶어도 그건 P03(구현 Worker) 몫이다.
 *
 * mock 패턴: 99.Others/tests/agents/persistent-pump.test.ts의 mkResult/mkAssistant 픽스처와
 * AsyncIterable<unknown> prompt 캐스팅 관례를 재사용한다.
 */
import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

// ── 공통 픽스처 (persistent-pump.test.ts 패턴 재사용) ─────────────────────────────

/** result(done) 메시지 픽스처. */
function mkResult(turnLabel = 'turn') {
  return {
    type: 'result' as const,
    subtype: 'success' as const,
    is_error: false,
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: 1,
    result: turnLabel,
    stop_reason: 'end_turn',
    total_cost_usd: 0,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0
    },
    modelUsage: {},
    permission_denials: [],
    errors: [],
    uuid: 'uuid-0000-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

/** assistant(text) 메시지 픽스처. */
function mkAssistantText(text: string) {
  return {
    type: 'assistant' as const,
    message: {
      id: 'msg_001',
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'text', text }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: 'uuid-asst-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

/** assistant(thinking) 메시지 픽스처. */
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

const wait = (ms = 30) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * "진행 중 turn에서 interrupt() → SDK가 for-await에 throw를 던진다"(P01 확정 동작)를 모델링.
 *
 * blockKind에 따라 텍스트/추론(thinking) 블록을 먼저 yield한 뒤, 컨트롤 가능한 Promise에서
 * 멈춘다(=진행 중 turn 모델링). interrupt() 호출 시 그 Promise를 reject →
 * mock 제너레이터 내부 await가 throw → _runPersistentPump의 for-await로 전파된다.
 *
 * ready: 제너레이터가 "interrupt 대기 지점"(=진행 중 turn)에 도달하면 resolve.
 *   테스트는 이걸 await한 뒤 run.interrupt()를 호출해 타이밍 경쟁을 없앤다.
 */
function makeInterruptibleQueryFn(blockKind: 'text' | 'thinking'): {
  queryFn: QueryFn
  ready: Promise<void>
} {
  let rejectPending: ((err: Error) => void) | null = null
  let readyResolve: (() => void) | null = null
  const ready = new Promise<void>((r) => { readyResolve = r })

  const queryFn: QueryFn = function (p) {
    // ADR-003: QueryFn 타입 string 유지. 지속세션 호출부가 AsyncIterable로 캐스트해 넘긴다
    // (claudeAgentRun.ts _runPersistentPump 참고). mock 내부에서 unknown 경유해 수신.
    const promptIterable = (p.prompt as unknown) as AsyncIterable<unknown>

    const gen = (async function* () {
      const inputIter = promptIterable[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return

      // 턴1 진행 중: 텍스트/추론 블록 1개 yield.
      yield blockKind === 'text' ? mkAssistantText('생각 중...') : mkAssistantThinking('reasoning…')

      // 진행 중 turn 모델링: SDK interrupt가 throw할 지점(컨트롤 가능한 Promise).
      await new Promise<void>((_, reject) => {
        rejectPending = reject
        readyResolve?.()
      })
      // 도달 불가 — 위 Promise는 interrupt()가 reject한다.
    })()

    // SDK query 핸들의 interrupt() — P01 확정 동작 모델링.
    ;(gen as unknown as Record<string, unknown>)['interrupt'] = async () => {
      if (rejectPending) {
        const r = rejectPending
        rejectPending = null
        r(new Error('Claude Code process interrupted by user'))
      }
    }

    return gen as AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
  }

  return { queryFn, ready }
}

// ── ① 일반 텍스트 turn 중 interrupt ──────────────────────────────────────────────

describe('BF1-interrupt ① 일반 텍스트 turn 중 interrupt', () => {
  it('재현: "안녕" 전송 후 텍스트 스트리밍 중 interrupt() → error 이벤트가 push되면 안 된다(현재 RED)', async () => {
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

    await ready // mock이 진행 중 turn에서 interrupt 대기 지점에 도달
    run.interrupt()
    await consume

    const types = events.map((e) => e.type)

    // 핵심 RED: 정상 중단(interrupt)은 error로 표시되면 안 된다.
    // 현재(버그): claudeAgentRun.ts _runPersistentPump의 catch가 _aborted만 체크 →
    // interrupt가 던진 throw를 'Agent execution error'로 오라벨 → 이 assert가 실패한다.
    expect(types).not.toContain('error')
    // 깔끔한 중단이라면 done(또는 전용 중단 이벤트)으로는 끝나야 한다(이 부분은 현재도 성립).
    expect(types).toContain('done')
  })
})

// ── ② 추론(thinking) 블록 중 interrupt ───────────────────────────────────────────

describe('BF1-interrupt ② 추론(thinking) 블록 중 interrupt', () => {
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
    await consume

    const types = events.map((e) => e.type)

    // thinking 블록 중 interrupt도 텍스트 케이스와 동일한 가드(플래그 방식)로 잡혀야 한다.
    // 현재(버그): 블록 종류와 무관하게 catch가 _aborted만 체크 → 동일하게 오라벨 → RED.
    expect(types).not.toContain('error')
    expect(types).toContain('done')
  })
})

// ── ③ interrupt 후 세션 생존 ─────────────────────────────────────────────────────

describe('BF1-interrupt ③ interrupt 후 세션 생존', () => {
  it('재현: interrupt 후에도 같은 세션이 살아있어 후속 push가 다음 turn으로 처리돼야 한다(목표 동작, 현재 RED)', async () => {
    /**
     * ⚠️ P03 크기 분기점 — 이 케이스의 실제 SDK 동작은 라이브 미확정.
     * ADR-024 불변식(interrupt ≠ abort, 세션 유지)에 따른 "목표 동작"을 여기서 단정한다.
     * 라이브 관측(P03 또는 그 이후) 후 mock·단정을 조정할 수 있다.
     *
     * mock 설계: SDK query 핸들을 수동 구현 AsyncIterable(객체, async function* 아님)로
     * 만들어 next() 호출 횟수를 직접 통제한다.
     *   - next() 호출 1회차: 초기 user 메시지 소비 → 턴1 assistant 텍스트.
     *   - next() 호출 2회차: 진행 중 turn(=interrupt 대기 지점) — 컨트롤 가능한 Promise에서 멈춤.
     *   - next() 호출 3회차(목표 동작에서만 도달): 후속 push() 메시지를 소비 → 턴2 result.
     *
     * 현재 버그: _runPersistentPump의 for-await는 catch에서 영구 종료된다(JS의 for-await는
     * 한번 reject되면 같은 루프를 재개할 수 없다 — 새 for-await/수동 재진입이 있어야 함).
     * 그 결과 queryIterable.next()가 3번째로 호출되는 일이 영원히 없다 → push()한 후속
     * 메시지는 _inputQueue에 적재된 채 영원히 미소비 → turn2Consumed가 true가 되지 못한다.
     */
    let turn2Consumed = false
    let nextCallCount = 0
    let rejectPending: ((err: Error) => void) | null = null
    let readyResolve: (() => void) | null = null
    const ready = new Promise<void>((r) => { readyResolve = r })

    const queryFn: QueryFn = function (p) {
      const promptIterable = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = promptIterable[Symbol.asyncIterator]()

      const iterable = {
        async next(): Promise<IteratorResult<unknown>> {
          nextCallCount++
          if (nextCallCount === 1) {
            await inputIter.next() // 초기 user 메시지 소비
            return { value: mkAssistantText('첫 턴 진행 중...'), done: false }
          }
          if (nextCallCount === 2) {
            // 턴1 진행 중 — interrupt 대기 지점(throw 시점).
            await new Promise<void>((_, reject) => {
              rejectPending = reject
              readyResolve?.()
            })
            return { value: undefined, done: true } // 도달 불가(위에서 reject)
          }
          // 3회차 이상 — 목표 동작: 세션 생존 시 후속 입력을 소비해 턴2 처리.
          const second = await inputIter.next()
          if (second.done) return { value: undefined, done: true }
          turn2Consumed = true
          return { value: mkResult('turn2-after-interrupt'), done: false }
        },
        [Symbol.asyncIterator]() {
          return this
        },
        interrupt: async () => {
          if (rejectPending) {
            const r = rejectPending
            rejectPending = null
            r(new Error('Claude Code process interrupted by user'))
          }
        },
      }

      return iterable as AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '안녕' }],
      persistent: true,
      sessionKey: 'bf1-conv-3',
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await ready
    run.interrupt()
    await consume // 현재 버그: catch가 error+done push 후 close() → 스트림 종료

    // interrupt 후에도 세션이 살아있다면, push()한 후속 메시지가 다음 turn으로 처리돼야 한다.
    run.push('후속 메시지')
    await wait(50)

    // 목표(GREEN, P03 이후): 세션 생존 → 후속 입력이 소비되어 턴2 처리됨.
    // 현재(RED): for-await가 catch에서 영구 종료돼 후속 push가 유실된다(아래 관찰 보고 참고).
    expect(turn2Consumed).toBe(true)
  })
})
