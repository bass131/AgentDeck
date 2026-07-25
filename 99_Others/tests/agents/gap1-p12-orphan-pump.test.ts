/**
 * gap1-p12-orphan-pump.test.ts — RunManager 에러 후 고아 pump 종결 (GAP1 P12 (a) — TDD RED 선행)
 *
 * ── 버그(Codex triage High, 2026-07-14) ─────────────────────────────────────────────
 * persistent 세션에서 엔진이 `result is_error:true`를 방출하면 claude-stream이 error+done으로
 * 정규화하고, RunManager 소비 IIFE(agent-runs.ts:225-257)는 error를 terminal로 판정해
 * cleanup(레지스트리 정리)만 하고 **run.abort()를 호출하지 않는다**. backend pump는
 * `_aborted=false`인 채 입력·자율 이벤트를 계속 기다리는 **고아(orphan) 세션**이 된다 —
 * SDK query(mock queryFn)는 다음 입력 pull에 영원히 park, abort signal은 영영 미발화.
 *
 * ── 4단정 공개 관찰면 (Phase 12 (a) 정본 — private 상태 단정 금지) ─────────────────────
 *  ① run abort 신호  = mock QueryFn에 전달된 `options.abortController.signal` 발화 관찰.
 *      근거: claudeAgentRun `_prepareQuery()` → buildClaudeSdkOptions가 run의 AbortController를
 *      `options.abortController`로 그대로 전달(sdkOptions.ts:237). run.abort()가 이를 abort().
 *      → 현행 **RED**(abort 미배선 — signal 미발화).
 *  ② pump/query 종료 = (등가 대체, Phase (a) 허용) mock QueryFn 쪽 prompt AsyncIterable의
 *      선행 park된 pull이 `done:true`로 해소 + 생산자 제너레이터 finally 실행 관찰.
 *      run.events의 return은 RunManager 소비 IIFE의 `break` 자체가 트리거하므로 판별력이
 *      없다 — 진짜 고아는 *생산자* 쪽(입력 generator·queryFn 제너레이터)이 잠드는 것이라
 *      prompt-iterable 종료가 정확한 관찰면이다. → 현행 **RED**(park 영구 미해소).
 *  ③ 후행 방출 0     = error terminal 이후 onEvent로 도착하는 tool_call/permission_request 0.
 *      mock 스트림에 후행 tool_use를 심어 두고 통과하지 않음을 확인.
 *      → 현행 **GREEN**(소비 IIFE가 error에서 break해 이미 미전달) — 회귀 핀.
 *        봉합 후에도 abort 가드/close가 같은 결과를 보장해야 한다(봉합이 이를 깨면 RED).
 *  ④ 활성 run 1개    = 동일 sessionKey 후속 `manager.start()` 시 backend.start 호출 수 2
 *      (= 죽은 세션 재사용이 아니라 새 세션. gap1-p11 §2 countingBackend 관례 재사용).
 *      error terminal의 cleanup이 persistentRuns에서 엔트리를 제거하므로 후속 start는
 *      **새 run이 정답**(start 2회). 죽은 엔트리로 push 라우팅되면(start 1회) 버그.
 *      → 현행 **GREEN**(레지스트리 정리는 현행도 수행) — 회귀 핀.
 *
 * ── 봉합 계약(Phase 12 (b), 코드 Worker 참조) ──────────────────────────────────────
 * error terminal 경로(agent-runs.ts:240-244 부근)에서 cleanup 후 run.abort()(또는 등가 종료)
 * 호출 → ①②가 GREEN으로 전이. 단 정상 done·idle-close 경로는 건드리지 않는다(P04b/P10/P11
 * 회귀 스위트가 판사).
 *
 * ── 결정론 ─────────────────────────────────────────────────────────────────────────
 * 시나리오는 전부 microtask 구동(타이머 무접촉). fake timer는 파일 전체에 걸되 advance하지
 * 않는다 — mock 스트림이 ss('running')을 error보다 먼저 방출해 session_state 게이트(P04b)가
 * done 경계 grace 예약을 막으므로(최신='running') 잔여 grace 타이머 자체가 없다.
 * 실 SDK 호출 0. wall-clock 의존 0(waitUntil = 유계 microtask 폴링).
 *
 * ⚠️ 테스트만 작성한다 — 02.Source/** R only(미변경). qa 영역.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRunManager } from '../../../02.Source/main/00_ipc/agent-runs'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentBackend, AgentRunInput } from '../../../02.Source/main/01_agents/AgentBackend'
import type { AgentEvent, AgentEventDone } from '../../../02.Source/shared/agent-events'

// ── 픽스처 (gap1-p11/bf1 관례 미러) ─────────────────────────────────────────────────

/** result(success) → done. */
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
    usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    errors: [],
    uuid: 'uuid-0000-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-p12',
  }
}

/**
 * result(is_error:true) → claude-stream(mapClaudeStreamLine result 분기)이 [error, done]으로
 * 정규화(claude-stream.ts:539-545). errors 배열이 extractErrorMessage의 1순위 소스.
 */
function mkErrorResult(msg = 'engine stream failure (P12 fixture)') {
  return {
    type: 'result' as const,
    subtype: 'error_during_execution' as const,
    is_error: true,
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: 1,
    stop_reason: null,
    total_cost_usd: 0,
    usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    errors: [msg],
    uuid: 'uuid-0000-0000-0000-0000-0000000000e1' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-p12',
  }
}

/** raw session_state_changed(SDK 원시) → `{type:'session_state', state}` 정규화. */
function ss(state: 'idle' | 'running' | 'requires_action') {
  return {
    type: 'system' as const,
    subtype: 'session_state_changed' as const,
    state,
    uuid: '387c0f11-6230-424c-9f7f-edefffd2df6f',
    session_id: 'sess-p12',
  }
}

/** 후행(late) tool_use — error terminal *이후* 스트림에 심는 ③용 이벤트. */
function mkAssistantToolUse(id: string) {
  return {
    type: 'assistant' as const,
    message: {
      content: [{ type: 'tool_use' as const, id, name: 'Bash', input: { command: 'echo late-after-error' } }],
    },
  }
}

// ── 이벤트/대기 헬퍼 ─────────────────────────────────────────────────────────────

type AgentEventError = Extract<AgentEvent, { type: 'error' }>

function errorsIn(events: AgentEvent[]): AgentEventError[] {
  return events.filter((e): e is AgentEventError => e.type === 'error')
}
function donesIn(events: AgentEvent[]): AgentEventDone[] {
  return events.filter((e): e is AgentEventDone => e.type === 'done')
}

/** fake timer 하에서 microtask만 순차 flush(타이머 무접촉). */
async function flushMicrotasks(times = 32): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

/**
 * 유계 microtask 폴링 — wall-clock/타이머 무접촉 결정론 대기.
 * 조건 미충족으로 상한 소진 시 명시적 실패(throw) — 조용한 timeout hang 방지.
 */
async function waitUntil(cond: () => boolean, label: string, maxFlushes = 400): Promise<void> {
  for (let i = 0; i < maxFlushes; i++) {
    if (cond()) return
    await Promise.resolve()
  }
  throw new Error(`waitUntil 상한 초과(microtask ${maxFlushes}회): ${label}`)
}

// ── countingBackend (gap1-p11 §2 / lr4-p01 관례 미러) ─────────────────────────────

function makeCountingBackend(queryFn: QueryFn): { backend: AgentBackend; startCount: () => number } {
  const claudeBackend = new ClaudeCodeBackend(queryFn)
  let count = 0
  const backend: AgentBackend = {
    id: 'claude-code',
    isAvailable: () => claudeBackend.isAvailable(),
    version: () => claudeBackend.version(),
    latestVersion: () => claudeBackend.latestVersion(),
    start: (req: AgentRunInput) => {
      count++
      return claudeBackend.start(req)
    },
    listSupportedCommands: (workspaceRoot) => claudeBackend.listSupportedCommands(workspaceRoot),
  }
  return { backend, startCount: () => count }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

// ══════════════════════════════════════════════════════════════════════════════════
// §1 — orphan 4단정 중 ①②③: error terminal 후 run abort 신호·생산자 종결·후행 방출 0
// ══════════════════════════════════════════════════════════════════════════════════

describe('§1 error terminal 고아 pump 종결 — ① abort 신호 · ② 생산자(prompt/queryFn) 종결 · ③ 후행 방출 0', () => {
  it('persistent is_error result → RunManager terminal cleanup 후: signal 발화(①RED)·park 해소+제너레이터 종결(②RED)·후행 tool 0(③핀)', async () => {
    // 관찰 상태 — 전부 mock QueryFn의 공개 계약면(options·prompt iterable)에서만 채집.
    const state = {
      abortController: undefined as AbortController | undefined,
      /** ② park된 후속 pull의 해소 여부 — abort 배선 시 input generator return이 done:true로 해소. */
      promptEnded: undefined as boolean | undefined,
      /** ② 생산자 제너레이터 종결(자연 완주든 iterator.return()이든 finally 실행). */
      generatorFinalized: false,
    }

    const queryFn: QueryFn = async function* (p) {
      try {
        // ① 관찰면 캡처: sdkOptions.abortController — run의 AbortController가 그대로 전달됨.
        state.abortController = (p.options as { abortController?: AbortController } | undefined)
          ?.abortController
        const prompt = p.prompt as unknown as AsyncIterable<unknown>
        const inputIter = prompt[Symbol.asyncIterator]()
        const first = await inputIter.next() // 초기 메시지 pull
        if (first.done) return

        // ② 관찰면: 후속 입력 pull을 *미리* park시켜 둔다(비차단 캡처, lr4-p03 관례).
        //    세션이 종결되면(입력 generator return) done:true로 해소된다 — 현행(고아)은 영영 미해소.
        //    제너레이터 진행과 독립적으로 .then이 기록하므로, 봉합 후 pump가 어느 지점에서
        //    return()을 걸든 관찰이 유실되지 않는다(race-free).
        const pendingPull = inputIter.next()
        void pendingPull.then((r) => {
          state.promptEnded = r.done === true
        })

        yield ss('running') // 최신 session_state='running' → done 경계 grace 예약 차단(시나리오 격리)
        yield mkErrorResult() // → error+done 정규화 → RunManager error terminal(cleanup)
        yield mkAssistantToolUse('tu-late-1') // ③ 후행 이벤트 — terminal 후 onEvent 통과 금지

        // 종결까지 park — 봉합 후에는 abort가 입력 generator를 닫아 여기서 깨어나고,
        // 현행(고아)은 여기(또는 위 yield의 다음 pull)에서 영원히 잠든다.
        await pendingPull
      } finally {
        state.generatorFinalized = true
      }
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const manager = createRunManager()
    const seen: AgentEvent[] = []
    const onEvent = (event: AgentEvent, _runId: string): void => {
      seen.push(event)
    }
    const KEY = 'conv-p12-orphan-1'

    const runId = await manager.start(
      backend,
      { messages: [{ role: 'user', content: '고아 pump 재현 턴' }], persistent: true, sessionKey: KEY },
      onEvent,
    )

    // error가 onEvent에 도달(=소비 IIFE가 terminal 처리) 후 잔여 microtask 정착.
    await waitUntil(() => errorsIn(seen).length >= 1, 'error 이벤트 onEvent 도달')
    await flushMicrotasks()

    const observed = {
      runIdStable: runId === KEY,
      errorsSeen: errorsIn(seen).length, // 1 — 시나리오 유효성(정규화 error 전달)
      errorMessage: errorsIn(seen)[0]?.message ?? null,
      // ① run abort 신호 — 현행 false(RED). 봉합: error terminal에서 run.abort() → signal 발화.
      signalAborted: state.abortController?.signal.aborted === true,
      // ② 생산자 종결 — 현행 false/미해소(RED). 봉합: 입력 generator return → pull done:true
      //    + queryFn 제너레이터 finally 실행.
      promptEnded: state.promptEnded === true,
      generatorFinalized: state.generatorFinalized,
      // ③ 후행 방출 0 — 현행도 GREEN(소비 IIFE break) — 봉합이 이 핀을 깨면 안 된다(회귀 핀).
      lateToolCalls: seen.filter((e) => e.type === 'tool_call').length,
      latePermissions: seen.filter((e) => e.type === 'permission_request').length,
    }

    // 기대값 = 봉합 후(GREEN 타깃) 상태. 현행은 signalAborted/promptEnded/generatorFinalized
    // 3개 키가 diff로 갈려 RED가 되는 게 정답이다(고아 pump 실재 증명).
    expect(observed).toEqual({
      runIdStable: true,
      errorsSeen: 1,
      errorMessage: 'engine stream failure (P12 fixture)',
      signalAborted: true,
      promptEnded: true,
      generatorFinalized: true,
      lateToolCalls: 0,
      latePermissions: 0,
    })

    // 정리(잔여 활성 run 없음 — error cleanup이 레지스트리는 이미 정리. 방어적 멱등 호출).
    manager.closeAll()
    await flushMicrotasks()
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// §2 — orphan 4단정 ④: 동일 sessionKey 후속 start = 새 세션(backend.start 2회) [현행 GREEN 회귀 핀]
// ══════════════════════════════════════════════════════════════════════════════════
//
// error terminal의 cleanup(agent-runs.ts:143-152)이 persistentRuns 엔트리를 제거하므로,
// 동일 sessionKey의 후속 manager.start()는 죽은 세션으로 push 라우팅되지 않고 **새 run**을
// 연다(backend.start 2회째) — 활성 run이 그 시점 1개뿐임의 공개 관찰면. 죽은 엔트리로
// 라우팅되면(start 1회 유지) 사용자 후속 메시지가 응답 없는 유령 세션에 삼켜지는 버그다.
// 현행도 GREEN(레지스트리 정리는 수행됨) — (b) abort 배선이 이 라우팅 거동을 바꾸지 않아야
// 한다는 회귀 핀으로 명시한다.

describe('§2 error terminal 후 동일 sessionKey 재시작 — 죽은 라우팅 잔존 없음(backend.start 2회, GREEN 핀)', () => {
  it('persistent error 종결 → 동일 sessionKey 후속 start가 새 세션을 열고(start 2회) 그 턴이 완주(done 도달)', async () => {
    let invocation = 0
    const queryFn: QueryFn = async function* (p) {
      invocation++
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return

      if (invocation === 1) {
        // ── 세션 1: error terminal 유발 ──
        yield ss('running') // grace 예약 차단(§1과 동일 격리 — 잔여 타이머 0)
        yield mkErrorResult('first session failure (P12 fixture)')
        // 고아 park(현행) 또는 abort 해소(봉합 후) — ④ 판정과 무관, 세션1은 여기서 끝.
        await inputIter.next()
      } else {
        // ── 세션 2: 정상 턴 완주(새 세션 생존 증명) ──
        yield mkResult('second-session-turn')
        // held-open park — 테스트 말미 closeAll()이 abort로 해소.
        await inputIter.next()
      }
    }

    const { backend, startCount } = makeCountingBackend(queryFn)
    const manager = createRunManager()
    const seen: AgentEvent[] = []
    const onEvent = (event: AgentEvent, _runId: string): void => {
      seen.push(event)
    }
    const KEY = 'conv-p12-orphan-2'

    const runId1 = await manager.start(
      backend,
      { messages: [{ role: 'user', content: '세션1 — error로 죽을 턴' }], persistent: true, sessionKey: KEY },
      onEvent,
    )
    await waitUntil(() => errorsIn(seen).length >= 1, '세션1 error 도달')
    await flushMicrotasks()
    const errorIdx = seen.findIndex((e) => e.type === 'error')

    // ── 동일 sessionKey 후속 전송 — 죽은 엔트리 라우팅(버그)이면 start 1회 유지 + 응답 없음. ──
    const runId2 = await manager.start(
      backend,
      { messages: [{ role: 'user', content: '세션2 — 재시작 턴' }], persistent: true, sessionKey: KEY },
      onEvent,
    )
    // 새 세션의 done이 error 이후에 도달해야 한다(세션2 완주).
    await waitUntil(
      () => seen.slice(errorIdx + 1).some((e) => e.type === 'done'),
      '세션2 done 도달(error 이후)',
    )

    const observed = {
      startCallsAfterResend: startCount(), // 2 — 새 세션(죽은 세션 재사용 아님)
      runIdsStable: runId1 === KEY && runId2 === KEY, // 안정 runId(=sessionKey) 재사용
      doneAfterError: donesIn(seen.slice(errorIdx + 1)).length >= 1,
    }

    manager.closeAll()
    await flushMicrotasks()

    expect(observed).toEqual({
      startCallsAfterResend: 2,
      runIdsStable: true,
      doneAfterError: true,
    })
  })
})
