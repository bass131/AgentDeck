/**
 * gap1-p10-dispatch-grace-cancel-lock.test.ts — 완전 역전 봉쇄 회귀 잠금 (GAP1 P10 철회 재편)
 *
 * ── 배경: P10(turnId 상관자) 철회 ─────────────────────────────────────────────────
 * GAP1 P10은 session_state 신호에 턴 상관자(turnId)를 부여해 "완전 역전"(새 턴 B의 running
 * 관찰 *뒤* 이전 턴 A의 늦은 idle 도착)을 monotonic 기각으로 걸러내려던 봉합이었다. 그러나
 * 그 봉합의 근거였던 misfire(이전 턴의 stale idle이 켠 grace가 새 dispatch를 넘어 오발동하는
 * 창)는 **현행 코드에 실재하지 않는다** — P04b가 이미 두 겹의 봉쇄로 막고 있기 때문이다.
 * 그래서 turnId 배선은 전면 철회됐고(agent-backend·shared-ipc, P04b 상태로 복원), 폐기된
 * gap1-p10-turn-id-stale-rejection.test.ts(판별력 0/false-green 자인)는 삭제됐다.
 *
 * 이 스위트는 그 철회의 *결론*을 회귀 잠금한다: **완전 역전 misfire가 실재하지 않는 이유 =
 * push(신규 dispatch)가 stale idle-grace를 봉쇄한다**는 사실을 기계로 고정한다. 봉합(turnId)이
 * 아니라 이미 존재하는 봉쇄를 지키는 가드다 — 누군가 P04b의 봉쇄 로직을 회귀시키면 여기서 RED로
 * 잡힌다.
 *
 * ── 봉쇄 메커니즘(claudeAgentRun.ts push(), 두 겹) ────────────────────────────────
 * pending idle-close grace가 대기 중일 때 신규 프롬프트 dispatch(`run.push()`)가 오면:
 *   (a) `_cancelIdleGrace()`(push:542) — 그 stale grace 타이머를 죽이고 즉시 재스케줄
 *       (`_scheduleIdleGrace()` push:547)해 카운트다운을 처음부터 다시 시작한다.
 *   (b) `_pendingSends++`(push:520) — "미소비 user turn"을 1 올린다. 재스케줄된(또는 잔존한)
 *       grace가 만료돼도 만료 재확인(`_pendingSends===0 && _inputQueue.length===0 && …`,
 *       claudeAgentRun.ts:636)이 pendingSends≠0에서 걸려 idle-close를 **미발동**시킨다.
 *
 * 즉 "이전 턴 A의 stale idle이 켠 grace가 dispatch_B를 넘어 오발동하는 창"은 존재하지 않는다 —
 * push가 grace를 취소·재스케줄하고, 늘어난 pendingSends가 재확인을 봉쇄한다. 완전 역전이
 * 결정론으로 재현되지 않는 것은 이 봉쇄 때문이지, 스트림 순서 구별 불가(turnId 부재) 때문이
 * 아니다.
 *
 * ── 판별력 실증(mutation 프로브, 이 파일 작성 시 1회 실측) ────────────────────────
 * 이 테스트의 봉쇄 잠금 관찰(graceExpired===0)이 실제 봉쇄 로직에 결속됨을 확인했다:
 *   · `_pendingSends++`(push:520) 무력화 → 재스케줄된 grace가 만료 재확인을 통과해 idle-close
 *     **오발동** → graceExpired===1 = **RED**(봉쇄 (b) 결속 실증). 원복 후 GREEN 복귀.
 *   · `_cancelIdleGrace()`(push:542) 무력화 → **GREEN 유지**. 봉쇄 (a)는 (b)와 중복(방어심층
 *     화)이라 이 관찰만으론 판별 불가 — stale grace가 잔존해도 `_scheduleIdleGrace()` 멱등
 *     가드(graceTimer≠null이면 no-op)로 재스케줄이 no-op이 되고, 늘어난 pendingSends(b)가
 *     만료 재확인을 독립적으로 막기 때문. 따라서 이 스위트의 판별점은 봉쇄 (b)다.
 *   (mutation은 판별력 실증 전용 임시 조작이었고 프로브 후 즉시 원복, git diff 순 변경 0 확인.)
 *
 * ── 결정성 ────────────────────────────────────────────────────────────────────────
 * grace는 단일 setTimeout(IDLE_CLOSE_GRACE_MS=3000)이므로 fake timer로 제어. 비중첩 Barrier
 * (gap1-p04b GraceProbe와 동형)로 push 주입 시점을 결정론적으로 고정(중첩 advance 0). 실 SDK
 * 호출 0 — mock QueryFn이 SDKMessage 형상을 흉내(gap1-p04b/lr4-p03 관례 미러).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type {
  AgentEvent,
  AgentEventSessionState,
  AgentEventAutonomyStatus,
} from '../../../02.Source/shared/agent-events'

// ── 상수(gap1-p04b 미러) ──────────────────────────────────────────────────────
/** 어떤 합리적 grace보다 큰 델타(유예 만료 close 검증). grace(≈3000)에 결속 X. */
const EXPIRE_MS = 10_000

// ── 픽스처 (gap1-p04b 관례 미러) ──────────────────────────────────────────────

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

/**
 * raw session_state_changed 라인(SDK 원시). claude-stream `mapClaudeStreamLine`가 P04에서
 * `{type:'session_state', state}`로 정규화한다(golden 스위트 참조).
 */
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

// ── Barrier: 비중첩 랑데부(gap1-p04b GraceProbe와 동형) ───────────────────────────
// mock 제너레이터는 스스로 clock을 만지지 않고 checkpoint()로 "도달"만 신호하고 park한다.
// push 주입·clock 진행은 테스트 본문 한 곳에서만 순차로 일어난다 → 중첩 advance 0, 결정적.
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
// 봉쇄잠금 — stale idle_A가 켠 grace를 dispatch_B(push)가 봉쇄 → idle-close 미발동
// ══════════════════════════════════════════════════════════════════════════════════
//
// 완전 역전 misfire의 봉쇄를 직접 회귀 잠금한다. 순서(실 SDK 순서 미러: running→result→idle):
//   ① 턴 A: running_A → done_A(pendingSends 1→0) → **늦은 idle_A**(done_A *뒤*, 실 SDK 순서) →
//      idle 관찰이 grace를 예약(P04b Wave2c). 이 grace가 "이전 턴 A의 stale idle이 켠 grace"다.
//   ② barrier로 park한 상태에서 테스트가 dispatch_B(`run.push('B')`) 주입 — grace는 아직 대기 중.
//      봉쇄: push가 (a) 그 grace를 취소·재스케줄 + (b) _pendingSends를 1로 올린다.
//   ③ dispatch_B 이후 **침묵**(SDK 중간 메시지 0 — 봉쇄 로직만 남기고 다른 취소 경로[관찰 지점의
//      _cancelIdleGrace, continuation 흡수]가 끼어들지 않게 한다). grace 창을 통째로 통과.
//   ④ 봉쇄 성립: idle-close **미발동**(graceExpired===0). "stale idle_A grace가 dispatch_B를
//      넘어 오발동하는 창"이 없음을 기계로 고정.
//
// 판별점(봉쇄 (b) _pendingSends++): 무력화하면 재스케줄된 grace 만료 재확인이 통과해 idle-close
//   오발동(graceExpired≥1) = RED. mutation 프로브로 실측(파일 헤더 참조).

describe('봉쇄잠금 — dispatch_B(push)가 stale idle_A grace를 봉쇄 → idle-close 미발동(완전 역전 misfire 부재)', () => {
  it('running_A→done_A→idle_A(grace 예약)→dispatch_B 침묵→grace 창 통과: graceExpired===0 · B는 실제 dispatch됨(미close)', async () => {
    const barrier = new Barrier()
    const pull: { secondDone: boolean | undefined } = { secondDone: undefined }
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield ss('running') // running_A(턴 A) — done 경계 게이트를 닫아 done_A에서 grace 미예약
      yield mkResult('A') // done_A — pendingSends 1→0. 이 시점 최신=running이라 done 경계 미예약
      yield ss('idle') // ★ 늦은 idle_A(done_A *뒤*, 실 SDK 순서) → 관찰이 grace 예약(Wave2c).
      //   이 grace가 "이전 턴 A의 stale idle이 켠 grace" — dispatch_B가 봉쇄해야 한다.
      await barrier.checkpoint() // 여기서 test가 dispatch_B(push) 주입 — grace는 아직 대기 중
      const second = await inputIter.next() // dispatch_B: 큐의 'B'를 pull
      pull.secondDone = second.done
      // ★ 침묵: dispatch_B 이후 SDK 중간 메시지 0 — park만 하고 아무것도 yield하지 않는다.
      //   (running_B 등을 yield하면 pump 관찰 지점의 _cancelIdleGrace/continuation 흡수가 먼저
      //    발화해 push 봉쇄 경로가 관찰되지 않는다 — 봉쇄 (a)(b)만 고립시키기 위한 침묵.)
      const third = await inputIter.next()
      if (!third.done) yield mkResult('C-unexpected')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '완전 역전 봉쇄' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    // idle_A까지 처리(grace 예약) 후 park 지점 도달.
    await barrier.waitForCheckpoint()
    await flushMicrotasks()
    // 사전 확인 스냅샷: idle_A가 실제로 관측됐다(= grace가 예약될 조건 성립).
    const idleObservedBeforeDispatch = sessionStates(events).some((e) => e.state === 'idle')

    // dispatch_B 주입 — 봉쇄 발화 지점(grace 취소·재스케줄 + pendingSends++).
    run.push('B')
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()

    // grace 창을 통째로 지나가게 진행(침묵 유지) → idle-close 발동 여부 스냅샷.
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await flushMicrotasks()
    const graceExpired = graceExpiredEnded(events).length
    const secondDone = pull.secondDone

    // 정리(hang 방지) — 봉쇄가 성립하면 세션이 안 닫혀 consume가 자연 종료하지 않으므로 abort 필요.
    run.abort()
    await consume

    // 사전 확인(주입 유효성): running_A·idle_A 관측 + dispatch_B가 실제로 일어났다(B가 pull됨).
    const observed = sessionStates(events).map((e) => e.state)
    expect(observed).toContain('running')
    expect(observed).toContain('idle')
    expect(idleObservedBeforeDispatch).toBe(true) // grace 예약 조건이 dispatch_B 전에 성립했다.
    expect(secondDone).toBe(false) // dispatch_B: 'B'가 pull됐다(입력 스트림이 닫혀 done된 게 아님).

    // ── 봉쇄 잠금(핵심): stale idle_A grace가 dispatch_B를 넘어 오발동하지 않았다 ──────────
    //   봉쇄 (b) _pendingSends++가 재스케줄된 grace의 만료 재확인(pendingSends===0)을 막아
    //   idle-close 미발동. (mutation 프로브: (b) 무력화 시 이 단정이 RED — 파일 헤더 실측.)
    expect(graceExpired).toBe(0)
  })
})
