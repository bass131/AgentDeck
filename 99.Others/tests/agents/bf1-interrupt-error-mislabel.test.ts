/**
 * bf1-interrupt-error-mislabel.test.ts — BF1-interrupt-loop Phase 02 RED 테스트(TDD 선작성).
 *
 * 재현 시나리오(영호 라이브 재현): "안녕 → 채팅 네모(stop) 버튼으로 interrupt → 중단은 되지만
 * 에러 이벤트가 잘못 뜬다."
 *
 * ── P02 정정 (실측 결과 반영) ─────────────────────────────────────────────────────
 *
 * 최초 P02는 "interrupt() = throw"를 가정한 mock으로 RED를 잡았다. 그러나 *실 SDK*를
 * 스크래치 probe로 직접 관측한 결과 이 가정은 틀렸다:
 *
 *   1. `interrupt()`는 예외(throw)를 던지지 않는다 — `await q.interrupt()`가 정상 resolve.
 *   2. interrupt 직후 SDK가 **result 메시지를 emit**한다:
 *      `{ type:"result", subtype:"error_during_execution", is_error:true, num_turns:2, session_id:"…" }`.
 *   3. 진행 중이던 `for await (const msg of query)`는 예외 없이 정상 계속된다(throw 아님).
 *   4. interrupt 후 같은 query 핸들에 다음 input을 보내면 turn2가 정상 처리된다
 *      (같은 session_id, "success" result).
 *
 * 확정된 버그 메커니즘:
 *   interrupt → SDK가 result(is_error=true) emit → mapClaudeStreamLine(claude-stream.ts case
 *   'result' is_error 분기)이 `[{type:'error',message}, {type:'done'}]`을 생성 →
 *   eventNormalizer.process()(231-234줄: done은 보류·반환, error는 통과·push)가 error를
 *   events에 포함 → 펌프(_runPersistentPump, claudeAgentRun.ts 569-599줄)가 그 error를
 *   push-queue로 push(throw가 없으므로 catch 분기 자체를 안 탄다 — 정상 흐름에서 push됨) →
 *   agent-runs.ts:198의 `const terminal = event.type === 'error' || …`이 error를 무조건
 *   terminal로 판정(persistent 여부 무관) → cleanup() → 세션이 RunManager 레지스트리에서
 *   사라진다(="세션 죽음" — 펌프 자체는 held-open으로 내부적으로 계속 살아있을 수 있지만,
 *   RunManager가 더는 그 세션을 모른다 → 같은 sessionKey의 다음 start()가 기존 세션을 못 찾고
 *   새 세션을 연다).
 *
 * 즉 "interrupt는 작동하지만, 정상 중단의 결과(result is_error)가 일반 error로 표면화돼
 * persistent 세션을 죽인다"가 버그다.
 *
 * ── 레이어 분리 (정확한 RED를 위해 케이스를 3개 레벨로 나눔) ───────────────────────
 *
 *   ①② claudeAgentRun 단위(펌프 레벨, ClaudeCodeBackend.start() 직접 사용):
 *      "interrupt 시 펌프가 error 타입 AgentEvent를 push하면 안 된다"를 검증.
 *      이 레벨에서는 held-open 펌프가 끊기지 않으므로(throw 없음) consume을 끝까지 기다릴
 *      수 없다 — interrupt 후 결과 이벤트가 적재될 시간을 준 뒤 abort()로 종료시켜 스냅샷을
 *      비교한다.
 *
 *   ③ RunManager 통합(agent-runs.ts createRunManager() + 실 ClaudeCodeBackend):
 *      claudeAgentRun 단위(①②)만으로는 for-await가 안 끊겨(held-open 유지) "세션 죽음"
 *      자체를 못 잡는다 — 죽음은 펌프가 아니라 *RunManager의 별도 for-await*
 *      (agent-runs.ts:191)가 error를 보고 :198에서 cleanup하는 지점에서 일어난다. 그래서
 *      실 ClaudeCodeBackend + createRunManager()를 함께 동원해 "같은 sessionKey의 다음
 *      start()가 기존 세션을 못 찾고 새 세션을 연다(backend.start() 재호출)"를 직접 잡는다.
 *
 * ⚠️ 이 파일은 테스트만 작성한다 — 02.Source/**는 R only. interrupt-result 처리 로직을
 * 고치고 싶어도 그건 P03(구현 Worker) 몫이다.
 *
 * P03 GREEN 타깃(참고, 구현은 P03 몫): 펌프가 interrupt 이후 상태(_interrupted)면
 * interrupt-result(error_during_execution) 이벤트를 일반 error로 push하지 않고 suppress
 * → agent-runs.ts:198의 terminal 판정을 회피 → persistent 세션이 레지스트리에서 살아남는다.
 *
 * mock 패턴: 99.Others/tests/agents/persistent-pump.test.ts의 mkResult/mkAssistant 픽스처,
 * 99.Others/tests/main/persistent-session.test.ts의 controllable-run/spy 패턴을 재사용한다.
 */
import { describe, it, expect, vi } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import { createRunManager } from '../../../02.Source/main/00_ipc/agent-runs'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

// ── 공통 픽스처 (persistent-pump.test.ts 패턴 재사용) ─────────────────────────────

/** result(done, success) 메시지 픽스처. */
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

/**
 * result(is_error=true, subtype='error_during_execution') 메시지 픽스처.
 *
 * 실측: interrupt 직후 SDK가 *emit*하는 메시지(throw 아님). 이 모양 그대로 mock 제너레이터가
 * `yield`한다 — claude-stream.ts의 'result' is_error 분기가 [error, done]을 생성해
 * eventNormalizer.process()를 거쳐 error가 push-queue에 들어가는 버그 경로를 그대로 재현.
 */
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

const wait = (ms = 50) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * "진행 중 turn에서 interrupt() → SDK가 result(is_error) 메시지를 emit한다"(실측 동작)를 모델링.
 *
 * blockKind에 따라 텍스트/추론(thinking) 블록을 먼저 yield한 뒤, 컨트롤 가능한 Promise에서
 * 멈춘다(=진행 중 turn 모델링). interrupt() 호출 시 그 Promise를 **resolve**(reject 아님 —
 * 실측: interrupt()는 throw하지 않는다) → mock 제너레이터가 깨어나 result(is_error) 메시지를
 * **yield**(throw 아님)한다. 그 후에도 제너레이터는 살아있어(held-open) 다음 input을 받으면
 * turn2(success result)를 처리할 수 있다 — 실측 4번 항목 반영.
 *
 * ready: 제너레이터가 "interrupt 대기 지점"(=진행 중 turn)에 도달하면 resolve.
 *   테스트는 이걸 await한 뒤 run.interrupt()를 호출해 타이밍 경쟁을 없앤다.
 */
function makeInterruptibleQueryFn(blockKind: 'text' | 'thinking'): {
  queryFn: QueryFn
  ready: Promise<void>
} {
  let resolveInterruptWait: (() => void) | null = null
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

      // 진행 중 turn 모델링: interrupt()가 호출될 때까지 대기(실측: resolve, throw 아님).
      await new Promise<void>((resolve) => {
        resolveInterruptWait = resolve
        readyResolve?.()
      })

      // 실측 핵심: interrupt 직후 SDK는 throw하지 않고 result(is_error) 메시지를 emit한다.
      yield mkErrorDuringExecutionResult()

      // 실측 4번: held-open — 같은 query 핸들이 살아있어 다음 input을 받으면 turn2를 처리한다.
      const second = await inputIter.next()
      if (!second.done) {
        yield mkResult('turn2-after-interrupt')
      }
    })()

    // SDK query 핸들의 interrupt() — 실측: 예외 없이 정상 resolve.
    ;(gen as unknown as Record<string, unknown>)['interrupt'] = async () => {
      if (resolveInterruptWait) {
        const r = resolveInterruptWait
        resolveInterruptWait = null
        r()
      }
    }

    return gen as AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
  }

  return { queryFn, ready }
}

// ── ① 일반 텍스트 turn 중 interrupt (펌프 레벨) ───────────────────────────────────

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

    await ready // mock이 진행 중 turn에서 interrupt 대기 지점에 도달
    run.interrupt()

    // 실측: interrupt()는 throw하지 않고 SDK가 result(is_error)를 emit한다 — 펌프는
    // for-await를 끊지 않고 계속 살아있다(held-open). 그 결과가 push-queue에 적재될
    // 시간을 준 뒤, 테스트 종료를 위해 abort()로 세션을 닫는다(loops 없으므로 abort
    // cleanup이 'error'를 추가하지 않는다 — 스냅샷 비교에 영향 없음).
    await wait()
    run.abort()
    await consume

    const types = events.map((e) => e.type)

    // 핵심 RED: 정상 중단(interrupt) 결과(result is_error)는 error로 표면화되면 안 된다.
    // 현재(버그): claude-stream.ts 'result' is_error 분기 → eventNormalizer.process()가
    // error를 통과시킴 → 펌프가 그대로 push → 이 assert가 실패한다.
    expect(types).not.toContain('error')
    // 깔끔한 중단이라면 done(또는 전용 중단 이벤트)으로는 끝나야 한다(이 부분은 현재도 성립).
    expect(types).toContain('done')
  })
})

// ── ② 추론(thinking) 블록 중 interrupt (펌프 레벨) ────────────────────────────────

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

    // thinking 블록 중 interrupt도 텍스트 케이스와 동일한 가드(suppress 방식)로 잡혀야 한다.
    // 현재(버그): 블록 종류와 무관하게 interrupt-result가 동일하게 error로 표면화 → RED.
    expect(types).not.toContain('error')
    expect(types).toContain('done')
  })
})

// ── ③ interrupt 후 세션 생존 (RunManager 통합 — 세션 죽음 재현) ────────────────────

describe('BF1-interrupt ③ interrupt 후 세션 생존 (RunManager 통합)', () => {
  it('P03 GREEN: interrupt-result error가 suppress돼 agent-runs.ts:198 terminal 판정을 피함 → 같은 sessionKey 재시작이 기존 세션을 찾아 push로 라우팅된다(backend.start는 1회만)', async () => {
    /**
     * claudeAgentRun 단위(①②)로는 for-await가 안 끊겨(held-open 유지) "세션 죽음" 자체를
     * 못 잡는다 — 펌프는 내부적으로 계속 살아있을 수 있지만, *RunManager의 별도 for-await*
     * (agent-runs.ts:191)가 error 이벤트를 보고 :198에서 무조건 terminal로 판정해
     * cleanup하는 순간 RunManager 레지스트리에서만 세션이 사라진다. 그래서 실 ClaudeCodeBackend
     * + createRunManager()를 함께 동원해 "같은 sessionKey의 다음 start()가 기존 세션을 못
     * 찾고 새 세션을 연다(backend.start 재호출)"를 직접 잡는다 — 실측이 보여준 진짜 지점.
     */
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
    // interrupt-result(error+done) 이벤트가 펌프 → push-queue → RunManager의 for-await →
    // onEvent → terminal 판정(:198) → cleanup()까지 전파될 시간을 준다.
    await wait()

    // (GREEN) interrupt-result error가 suppress돼 RunManager까지 표면화되지 않음 — 이게
    // 세션 유지의 메커니즘이다. P03(claudeAgentRun.ts)이 펌프 레벨에서 interrupt-result를
    // 일반 error로 push하지 않게 막은 결과, RunManager의 for-await(agent-runs.ts:191)도
    // error를 보지 못해 :198의 terminal 판정 자체가 트리거되지 않는다.
    expect(events.some((e) => e.type === 'error')).toBe(false)

    // 같은 sessionKey로 후속 메시지 전송 — 세션이 살아있다면(목표 동작) backend.start()는
    // 다시 호출되지 않고 기존 run.push()로 라우팅돼야 한다.
    await manager.start(
      backend,
      { messages: [{ role: 'user', content: '후속 메시지' }], persistent: true, sessionKey: 'bf1-conv-3' },
      () => {},
    )

    // 핵심(GREEN): backend.start()가 1회만 호출돼야 한다(세션 유지, push로 라우팅).
    // P03 이전(버그): interrupt-result가 error로 표면화 → :198 terminal 판정 →
    // cleanup() → persistentRuns에서 sessionKey 삭제 → 두 번째 start()가 새 세션을 염
    // (backend.start 2회 호출) — 그게 "세션 죽음"의 실측 증거였다. P03 이후엔 위 line 327의
    // suppress(error 미표면화) 덕에 cleanup이 트리거되지 않아 여기서 1회로 유지된다.
    expect(startSpy).toHaveBeenCalledTimes(1)
  })
})
