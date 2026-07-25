/**
 * gap1-p11-autonomous-done-theft.repro.test.ts — 자율턴 done 탈취 오발동 RED 재현 (GAP1 P11)
 *
 * ── 목적 ─────────────────────────────────────────────────────────────────────────
 * Codex 교차검증이 제시한 "자율(cron-origin) 턴 done이 사용자 push의 pendingSends를 탈취해
 * 실행 중인 세션을 조기 종료시킨다"는 버그 스펙을 **실측으로 판정**한다. 이 파일은 *수정*이
 * 아니라 현행 HEAD 코드에서 그 오발동이 실제로 실행되는지의 RED 확인 전용이다 —
 * 단정은 **안전 기대값**으로 작성되어 있어, 버그가 실재하면 FAIL(=RED)이 뜬다.
 *
 * ── 주장(Codex repro 스펙) ────────────────────────────────────────────────────────
 * 자율 턴 A가 실행 중일 때 사용자 턴 B를 push하면:
 *   ① push(B)가 _pendingSends를 0→1로 올린다(+ grace 재스케줄).
 *   ② A의 늦은 done이 도착 → turnOrigin이 done push *직전*에 `_pendingSends>0`로 재계산돼
 *      **'user'로 오분류**되고(자율 턴인데 user), 그 done이 _pendingSends를 1→0으로
 *      감소시켜 **B의 미소비 user turn을 탈취**한다.
 *   ③ 이후 B의 실제 dispatch(running_B) → 이전 턴 A의 늦은 idle(stale idle_A) 순서로
 *      session_state가 도착하면, idle 관찰 재트리거(Wave2c)가 `_pendingSends===0`(탈취 결과)
 *      조건을 통과해 grace를 예약한다.
 *   ④ B가 grace 창(IDLE_CLOSE_GRACE_MS) 동안 침묵하면 만료 재확인
 *      (`_pendingSends===0 ∧ 큐 empty ∧ 최신 session_state==='idle'`)이 전부 통과 →
 *      **실행 중인 B 세션이 조기 idle-close**된다.
 *
 * ── 관찰점(공개 대리자) ──────────────────────────────────────────────────────────
 * Codex가 제시한 `run.onSessionClosing?.()` 콜백은 **실재한다** — AgentRun 인터페이스
 * optional 선언(AgentBackend.ts:211), ClaudeAgentRun 구현(claudeAgentRun.ts:463-465),
 * idle-close commit 시점 호출(claudeAgentRun.ts:897, `_inputGen` return 직전). 이 콜백을
 * 그대로 공개 관찰점으로 사용한다(대체 관찰점 불필요). 나머지는 events 스트림의 공개
 * 이벤트로 관찰: `done.origin`(AgentEventDone.origin) · grace-expired(AgentEventAutonomyStatus
 * status='ended' reason='grace-expired') · B pull 여부(mock 기록). IDLE_CLOSE_GRACE_MS는
 * 실제 상수를 import해 2999ms/+1ms 분할 검증에 쓴다. 모든 스냅샷은 abort() 전에 확정한다.
 *
 * ── 단정표 (Codex 예측 — 현행 HEAD에서 예측 RED 값이 나오면 버그 실증) ──────────────
 *   ┌──────────────────────────┬──────────────┬───────────────┐
 *   │ 관찰점                    │ 안전 기대값  │ 예측 RED 값   │
 *   ├──────────────────────────┼──────────────┼───────────────┤
 *   │ pull.bDone               │ false        │ false(비판별)│
 *   │ done.origin(bootstrap,A) │ [user,cron]  │ [user,user]  │
 *   │ grace-expired 이벤트 수  │ 0            │ 1            │
 *   │ 세션 close 관찰          │ 0            │ 1            │
 *   │ abort 전 afterBDone      │ false(≠true) │ true         │
 *   └──────────────────────────┴──────────────┴───────────────┘
 *
 * ── 하네스 ─────────────────────────────────────────────────────────────────────────
 * gap1-p10-dispatch-grace-cancel-lock.test.ts의 하네스를 그대로 재사용한다(실 ClaudeCodeBackend
 * + mock QueryFn · mkResult · ss · 비중첩 Barrier · flushMicrotasks · fake timer). 실 SDK
 * 호출 0. grace는 단일 setTimeout(IDLE_CLOSE_GRACE_MS)이라 fake timer로 결정론 제어하고,
 * push 주입 시점은 Barrier로 고정(중첩 advance 0).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import { IDLE_CLOSE_GRACE_MS } from '../../../02.Source/main/01_agents/claudeAgentRun'
import type {
  AgentEvent,
  AgentEventDone,
  AgentEventSessionState,
  AgentEventAutonomyStatus,
} from '../../../02.Source/shared/agent-events'

// ── 픽스처 (gap1-p10 미러) ─────────────────────────────────────────────────────

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
    session_id: 'sess-test',
  }
}

/** raw session_state_changed 라인(SDK 원시). claude-stream이 `{type:'session_state', state}`로 정규화. */
function ss(state: 'idle' | 'running' | 'requires_action') {
  return {
    type: 'system' as const,
    subtype: 'session_state_changed' as const,
    state,
    uuid: '387c0f11-6230-424c-9f7f-edefffd2df6f',
    session_id: '29c6123d-7baf-485b-a694-413dfcee6ddb',
  }
}

// ── 이벤트 헬퍼 ────────────────────────────────────────────────────────────────
function sessionStates(events: AgentEvent[]): AgentEventSessionState[] {
  return events.filter((e): e is AgentEventSessionState => e.type === 'session_state')
}
function dones(events: AgentEvent[]): AgentEventDone[] {
  return events.filter((e): e is AgentEventDone => e.type === 'done')
}
function autonomy(events: AgentEvent[]): AgentEventAutonomyStatus[] {
  return events.filter((e): e is AgentEventAutonomyStatus => e.type === 'autonomy_status')
}
function graceExpiredEnded(events: AgentEvent[]): AgentEventAutonomyStatus[] {
  return autonomy(events).filter((e) => e.status === 'ended' && e.reason === 'grace-expired')
}

/** fake timer 하에서 microtask만 순차 flush(타이머 미접촉). */
async function flushMicrotasks(times = 12): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

// ── Barrier: 비중첩 랑데부(gap1-p10 동형) ────────────────────────────────────────
class Barrier {
  private arrivedCount = 0
  private consumedCount = 0
  private arrivedResolvers: Array<() => void> = []
  private releaseResolvers: Array<() => void> = []
  async checkpoint(): Promise<void> {
    this.arrivedCount++
    const resolvers = this.arrivedResolvers
    this.arrivedResolvers = []
    resolvers.forEach((r) => r())
    await new Promise<void>((resolve) => {
      this.releaseResolvers.push(resolve)
    })
  }
  async waitForCheckpoint(): Promise<void> {
    if (this.consumedCount < this.arrivedCount) {
      this.consumedCount++
      return
    }
    await new Promise<void>((resolve) => this.arrivedResolvers.push(resolve))
    this.consumedCount++
  }
  release(): void {
    const r = this.releaseResolvers.shift()
    if (r) r()
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

// ══════════════════════════════════════════════════════════════════════════════════
// RED 재현 — 자율턴 A의 done이 push(B)의 pendingSends를 탈취 → stale idle_A grace가 B 조기종료
// ══════════════════════════════════════════════════════════════════════════════════
//
// Codex generator 스펙을 그대로 구현. 실 SDK 순서(running/result/idle 별개 system msg) 미러.
//   bootstrap: inputIter.next()(초기 pull) → running_bootstrap → done_bootstrap(pending 1→0)
//     → idle_bootstrap(grace 예약)
//   자율 턴 A: running_A(push 없이 시작 — bootstrap grace 흡수/취소) → [checkpoint#1: test가
//     run.push('B') — pending 0→1, grace 재스케줄] → done_A(주장: turnOrigin 'user' 오분류,
//     pending 1→0 탈취)
//   dispatch_B: inputIter.next()로 'B' pull(pull.bDone) → running_B → stale idle_A(grace 재예약)
//   park: 다음 input pull을 park(_inputGen 대기) → grace 창 통과 → 만료 시 세션 close 관찰

describe('RED 재현 — 자율턴 done 탈취로 실행중 B 세션 조기 idle-close (완전 역전 misfire)', () => {
  it('running_A→push(B)→done_A(pending 탈취)→running_B→stale idle_A→침묵: grace 만료가 세션을 조기 종료', async () => {
    const barrier = new Barrier()
    const pull: { bDone: boolean | undefined; afterBDone: boolean | undefined } = {
      bDone: undefined,
      afterBDone: undefined,
    }
    let closeObserved = 0

    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const bootstrap = await inputIter.next() // 초기 메시지 pull(pendingSends=1)
      if (bootstrap.done) return

      // ── bootstrap 턴 ──
      yield ss('running') // running_bootstrap — 최신 상태 running(done 시 grace 미예약)
      yield mkResult('bootstrap') // done_bootstrap — pending 1→0, origin 'user'
      yield ss('idle') // 늦은 idle_bootstrap → 관찰이 grace 예약(Wave2c)

      // ── 자율 턴 A 시작(push 없이) — bootstrap grace 흡수/취소 ──
      yield ss('running') // running_A → "before processing" 블록이 bootstrap grace 취소

      await barrier.checkpoint() // #1: test가 run.push('B') 주입(pending 0→1, grace 재스케줄)

      // ── 자율 턴 A의 늦은 done ──
      yield mkResult('A') // 주장: turnOrigin=_pendingSends>0?'user'(오분류); done이 pending 1→0 탈취

      // ── dispatch_B: 큐의 'B'를 pull ──
      const second = await inputIter.next()
      pull.bDone = second.done

      yield ss('running') // running_B — B가 실제 실행 시작
      yield ss('idle') // stale idle_A(이전 턴 늦은 idle) → 관찰 재트리거가 grace 예약(pending 0 탈취 결과)

      // ── 침묵 + park: 다음 input pull을 park(_inputGen 대기). grace 만료가 이 park를
      //   깨우면(idle-close commit) inputIter.next()가 done으로 resolve된다 = 세션 조기종료. ──
      const third = await inputIter.next()
      pull.afterBDone = third.done // grace가 세션을 닫았으면 true(park가 done으로 풀림)
      await barrier.checkpoint() // #2: 세션이 실제로 닫혔을 때만 도달(park가 풀림)
      if (!third.done) yield mkResult('C-unexpected')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '자율턴 done 탈취 재현' }],
      persistent: true,
    })
    // 공개 관찰점: idle-close commit 시점(claudeAgentRun.ts:897)에 1회 동기 호출.
    run.onSessionClosing?.(() => {
      closeObserved++
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    // checkpoint#1 도달(running_A까지 처리, bootstrap grace 흡수).
    await barrier.waitForCheckpoint()
    await flushMicrotasks()
    const idleObservedBeforeDispatch = sessionStates(events).some((e) => e.state === 'idle')

    // dispatch_B 주입 — pending 0→1, grace 재스케줄. (여기서 탈취의 씨앗이 심어진다.)
    run.push('B')
    await flushMicrotasks()
    barrier.release() // checkpoint#1 해제 → mock이 done_A→pull B→running_B→stale idle_A 진행
    await flushMicrotasks()

    // ── 분할 검증: grace 창 통째 전(2999ms)에는 아직 close 안 됨(만료 재확인 미도달) ──
    await vi.advanceTimersByTimeAsync(IDLE_CLOSE_GRACE_MS - 1)
    await flushMicrotasks()
    const graceExpiredBeforeExpiry = graceExpiredEnded(events).length
    const closeBeforeExpiry = closeObserved

    // ── +1ms로 grace 만료 경계 통과 → 만료 재확인 발화 ──
    await vi.advanceTimersByTimeAsync(2)
    await flushMicrotasks()

    // ── 스냅샷(전부 abort 전) ──
    const doneOrigins = dones(events).map((e) => e.origin)
    const graceExpiredCount = graceExpiredEnded(events).length
    const observed = {
      bDone: pull.bDone,
      doneOrigins,
      graceExpiredCount,
      closeObserved,
      afterBDone: pull.afterBDone === true,
    }

    // 정리(hang 방지): abort로 스트림 종료 + 남은 park 해제.
    run.abort()
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()
    await consume

    // ── 사전 확인(주입 유효성) ──
    const seenStates = sessionStates(events).map((e) => e.state)
    expect(seenStates).toContain('running')
    expect(seenStates).toContain('idle')
    expect(idleObservedBeforeDispatch).toBe(true) // grace 예약 조건이 dispatch_B 전에 성립
    // 분할 검증: grace 만료 경계 전(2999ms)에는 아직 세션 종료 신호 없음(경계 정확성).
    expect(graceExpiredBeforeExpiry).toBe(0)
    expect(closeBeforeExpiry).toBe(0)

    // ── 핵심 단정(안전 기대값) — 버그 실재 시 이 toEqual이 RED ──────────────────────
    //   현행 HEAD가 Codex 예측 RED 값을 내면 아래 diff에 전 항목이 한 번에 드러난다:
    //     doneOrigins ['user','cron']→['user','user'] · graceExpiredCount 0→1 ·
    //     closeObserved 0→1 · afterBDone false→true.
    expect(observed).toEqual({
      bDone: false, // B는 실제 dispatch됨(비판별 — 안전/RED 공통)
      doneOrigins: ['user', 'cron'], // bootstrap=user, A=cron(자율) — 안전 기대
      graceExpiredCount: 0, // 실행중 B에서 grace 만료 미발동
      closeObserved: 0, // 세션 조기 close 없음
      afterBDone: false, // 다음 input pull이 done으로 풀리지 않음(세션 유지)
    })
  })
})
