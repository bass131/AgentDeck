/**
 * gap1-p04b-session-state-idle-authority.test.ts — session_state 권위 소비 이양 계약 (GAP1 P04b, TDD RED)
 *
 * 배경(설계 스펙): GAP1 P04는 SDK 원시 `session_state_changed`를 공통 AgentEvent
 * `{type:'session_state', state}`로 *정규화*만 했다(claude-stream.ts). 그 이벤트는 지속세션
 * 펌프(claudeAgentRun.ts `_runPersistentPump`)를 통과해 run.events로 표면화되지만, 아직
 * idle-close 결정(축1 → 축2~5)에 소비되지 *않는다*. 즉 축1(SDK 실행 상태)은 관측만 되고
 * 권위가 없다 — 현행 게이트(claudeAgentRun.ts:1010 `else if (_pendingSends===0 &&
 * !hasLoopActivity())`)는 session_state를 전혀 보지 않고 순수 pendingSends 휴리스틱으로만
 * grace를 예약한다.
 *
 * P04b(agent-backend가 구현할 승격): idle-close 예약 게이트를 session_state와 **안전 교집합**으로
 * 결합한다.
 *   - 신호 수신 세션(스트림에 session_state가 한 번이라도 온 세션): "최신 session_state==='idle'
 *     ∧ 로컬 큐 empty(_inputQueue 0 ∧ _pendingSends 0 ∧ !hasLoopActivity())"일 때만 예약.
 *   - 신호 미수신 세션(session_state 0건): 기존 pendingSends 휴리스틱 **바이트 동일**(fallback).
 *   - 축2(입력 큐 직렬화)·축4(grace 타이밍 GRACE_MS·MAX_CONSECUTIVE_AUTONOMOUS_TURNS cap)는
 *     불변 — session_state는 grace 만료 *재검증*에 조건 하나를 얹을 뿐, grace를 트리거/취소/
 *     단축/연장하지 않는다.
 *
 * 이 스위트는 그 승격의 계약을 *실패하는 테스트(RED)로 먼저* 못박는다. 앱 소스는 이 Phase에서
 * 건드리지 않는다(테스트만 — qa 영역). agent-backend가 이 스위트를 GREEN으로 만드는 게 구현 스펙.
 *
 * ── 각 시나리오의 RED/pass 성격 (실행으로 판별) ─────────────────────────────────────
 *  [RED]      = 승격 미구현이라 현행에서 실패(구현 후 GREEN).
 *  [안전불변식] = 현행·승격 후 모두 PASS. 회귀 가드(승격이 이 성질을 깨면 RED로 잡는다).
 *
 *  핵심RED  신호수신 + 큐empty + 최신 running(늦은 idle 미도착) → idle-close 예약 안 됨.  [RED]
 *  S1       idle 신호 + 대기 입력(pendingSends>0) → 로컬 큐 우선, close 강제 안 함.       [안전불변식]
 *  S2       idle→running(latest-wins) → 앞선 idle이 running에 의해 무효화 → hold.        [RED]
 *  S3       session_state 0건 → 기존 grace-expired fallback 그대로.                      [안전불변식]
 *  S4       requires_action → 권한 대기 = 살아있어야 함, idle-close 금지.                [RED]
 *  S5       running 잔존 + abort → abort 최우선, session_state 무관하게 즉시 종료.        [안전불변식]
 *  S6       grace 대기 중 idle 신호 → grace 타이밍(GRACE_MS) 불변 + continuation 흡수.    [안전불변식]
 *
 * ── 관찰 지점 ─────────────────────────────────────────────────────────────────────
 *  idle-close 예약/커밋 신호: `autonomy_status{status:'ended', reason:'grace-expired'}` 방출 ·
 *  세션 close(events 스트림 종료) · 지속 입력 pull이 done:true로 해소(secondPullDone).
 *  session_state 주입: mock queryFn 스트림에 raw `{type:'system', subtype:'session_state_changed',
 *  state}` 삽입 → claude-stream이 정규화(P04 완료) → 펌프가 관찰.
 *
 * 결정성: grace는 단일 setTimeout(IDLE_CLOSE_GRACE_MS=3000)이므로 fake timer로 제어. hold-open
 *  검증은 EXPIRE_MS(10_000, grace 초과) 진행 후 close 여부를 스냅샷 → abort로 정리(hang 방지).
 *  continuation 흡수 검증(S1·S6)은 lr4-p03의 비중첩 GraceProbe barrier를 재사용한다(중첩 advance 0).
 *
 * 신뢰경계: 실 SDK 호출 0. mock QueryFn이 SDKMessage 형상을 흉내(lr4-p03 관례 미러).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type {
  AgentEvent,
  AgentEventDone,
  AgentEventAutonomyStatus,
} from '../../../02.Source/shared/agent-events'

// ── 상수(agent-backend export 예정 — 미존재 시 하드코딩, 상수값과 일치해야 함) ──────────
/** grace(≈3000)보다 확실히 작은 델타(유예 중 continuation 흡수 검증). grace에 결속 X. */
const GRACE_PROBE_MS = 100
/** 어떤 합리적 grace보다 큰 델타(유예 만료 close 검증). grace(≈3000)에 결속 X. */
const EXPIRE_MS = 10_000

// ── 픽스처 (lr4-p03 관례 미러) ─────────────────────────────────────────────────────

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
 * `{type:'session_state', state}`로 정규화한다(golden 스위트 참조). state 리터럴 외 값은 드롭.
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
function dones(events: AgentEvent[]): AgentEventDone[] {
  return events.filter((e): e is AgentEventDone => e.type === 'done')
}
function autonomy(events: AgentEvent[]): AgentEventAutonomyStatus[] {
  return events.filter((e): e is AgentEventAutonomyStatus => e.type === 'autonomy_status')
}
function graceExpiredEnded(events: AgentEvent[]): AgentEventAutonomyStatus[] {
  return autonomy(events).filter((e) => e.status === 'ended' && e.reason === 'grace-expired')
}
function sessionStates(events: AgentEvent[]): AgentEvent[] {
  return events.filter((e) => e.type === 'session_state')
}

/** fake timer 하에서 microtask만 순차 flush(타이머 미접촉) — close 전파 정착 보장. */
async function flushMicrotasks(times = 12): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

// ── GraceProbe: 비중첩 barrier (lr4-p03에서 검증된 랑데부, S1·S6에서 재사용) ──────────
// mock 제너레이터는 스스로 clock을 만지지 않고 checkpoint()로 "도달"만 신호하고 park한다.
// clock 진행은 테스트 본문 한 곳에서만 순차로 일어난다 → 중첩 advance 0, 결정적.
class GraceProbe {
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

// ── 가짜 타이머(유예 setTimeout 제어) ─────────────────────────────────────────────
beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

/**
 * hold-open 스냅샷 헬퍼.
 *
 * grace 창을 통째로 지나가게 진행(EXPIRE_MS) + microtask 정착 후, "이 시점까지 세션이 닫혔는가"를
 * 스냅샷한다. 그런 다음 abort로 정리한다(hold-open GREEN 경로는 세션이 영영 안 닫혀 consume가
 * 자연 종료하지 않으므로 반드시 abort 필요 — 현행 RED 경로에서는 이미 닫혀 abort는 멱등 no-op).
 *
 * 스냅샷은 abort *전에* 떠야 한다 — abort는 input gen을 return시켜 pull을 done:true로 해소하므로,
 * abort 후엔 hold-open 여부와 무관하게 secondPullDone가 true가 된다. 따라서 `secondPullDone`도
 * abort *직전* 시점 값을 `secondPullDoneBeforeAbort`로 스냅샷에 담는다(관찰 타이밍 봉합):
 *   - 현행(승격 없음): grace 만료가 abort *전에* 이미 세션을 닫아 pull이 done:true로 해소 →
 *     secondPullDoneBeforeAbort=true → `not.toBe(true)` 실패 = RED 유지(판별력 존치).
 *   - 승격 후: 최신 running/requires_action → hold → park 유지 → abort 전 secondPullDone=undefined.
 */
async function snapshotThenAbort(
  run: { abort(): void },
  consume: Promise<void>,
  events: AgentEvent[],
  pull: { secondPullDone: boolean | undefined }
): Promise<{ graceExpired: number; endedTotal: number; secondPullDoneBeforeAbort: boolean | undefined }> {
  await vi.advanceTimersByTimeAsync(EXPIRE_MS)
  await flushMicrotasks()
  const snap = {
    graceExpired: graceExpiredEnded(events).length,
    endedTotal: autonomy(events).filter((e) => e.status === 'ended').length,
    secondPullDoneBeforeAbort: pull.secondPullDone,
  }
  run.abort()
  await consume
  return snap
}

// ══════════════════════════════════════════════════════════════════════════════════
// 핵심 RED — 신호 수신 세션 + 큐 empty + 최신 session_state='running' → idle-close 예약 안 됨
// ══════════════════════════════════════════════════════════════════════════════════
//
// "권위 소비"의 실증 테스트(필수 RED). 현행: session_state를 무시하고 큐 empty면 grace 예약 →
// 만료 → close(secondPull done:true + grace-expired 방출) → RED. 승격 후: 최신 상태가 running이면
// (SDK가 아직 실행 중이라고 말함) idle-close 보류 → hold(secondPull 미해소 + grace-expired 0) → GREEN.

describe('핵심RED — 최신 session_state=running이면 큐 empty라도 idle-close 예약 안 함(권위 소비)', () => {
  it('running 신호 수신 후 큐 empty done → grace 예약 안 됨(hold): grace-expired 0 · 입력 스트림 미종료', async () => {
    const pull: { secondPullDone: boolean | undefined } = { secondPullDone: undefined }
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield ss('running') // SDK: 실행 중 — 늦은 idle은 아직 도착하지 않음
      yield mkResult('turn1') // user origin, pendingSends 1→0
      // 다음 입력을 park — 승격 시 running 최신이라 idle-close 보류(park 유지),
      // 현행은 grace 예약→만료로 이 pull이 done:true로 해소된다.
      const second = await inputIter.next()
      pull.secondPullDone = second.done
      if (!second.done) yield mkResult('turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'session_state 권위 소비' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    const snap = await snapshotThenAbort(run, consume, events, pull)

    // 사전 확인: running 신호가 실제로 펌프를 통과해 관측됐다(주입법 유효성).
    expect(sessionStates(events)).toContainEqual({ type: 'session_state', state: 'running' })
    // RED 핵심: 승격 전(현행)은 큐 empty라 grace-expired로 close → 아래가 실패한다.
    //   승격 후: running 최신 → idle-close 보류 → grace-expired 0 · pull 미해소.
    expect(snap.graceExpired).toBe(0)
    expect(snap.secondPullDoneBeforeAbort).not.toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// S1 — idle 신호 + 대기 입력(pendingSends>0): 로컬 큐 우선, idle 신호가 close 강제 안 함 [안전불변식]
// ══════════════════════════════════════════════════════════════════════════════════
//
// 안전 불변식(현행도 pendingSends>0이면 게이트가 false라 예약 안 함). 승격의 안전 교집합에서도
// "로컬 큐 empty"가 필수 조건이므로 idle 신호가 대기 입력을 무시하고 close를 강제하지 못한다.
// checkpoint로 turn1 done *전에* push를 결정론적으로 주입해 "idle 신호 + pendingSends>0 경계"를 만든다.

describe('S1[안전불변식] — idle 신호가 있어도 대기 입력(pendingSends>0)이 있으면 idle-close 강제 안 함', () => {
  it('turn1 경계에 pending push 존재 → turn2 처리(로컬 큐 우선) · turn1 경계에서 조기 close 없음', async () => {
    const probe = new GraceProbe()
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield ss('idle') // SDK는 idle이라 말하지만…
      await probe.checkpoint() // …여기서 테스트가 pending push 주입(pendingSends 1→2)
      yield mkResult('turn1') // pendingSends 2→1 → 게이트 !=0 → grace 예약 안 됨
      const second = await inputIter.next() // 큐의 pending push를 즉시 pull
      if (second.done) return
      yield mkResult('turn2') // user origin(pendingSends 1→0)
      const third = await inputIter.next() // 이제 큐 empty — park(잔여 grace/abort로 정리)
      if (!third.done) yield mkResult('turn3-unexpected')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '초기 대화' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    // turn1 done 전(checkpoint)에서 pending push 주입 — pendingSends를 2로 만든다.
    await probe.waitForCheckpoint()
    run.push('대기 중 사용자 입력')
    // turn1 경계 시점 스냅샷: 이 시점엔 grace-expired가 절대 없어야 한다(대기 입력 우선).
    probe.release()
    await flushMicrotasks()
    const earlyGraceExpired = graceExpiredEnded(events).length

    // 잔여 정리(turn2 후 큐 empty가 되어 발생하는 grace는 정상) — abort로 마무리.
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await flushMicrotasks()
    run.abort()
    await consume

    // idle 신호가 대기 입력을 무시하고 turn1에서 close를 강제하지 않았다.
    expect(earlyGraceExpired).toBe(0)
    // 대기 입력(push)이 실제로 처리됐다 — turn2 done이 방출됐다(user origin 2개 이상).
    const userDones = dones(events).filter((e) => e.origin === 'user')
    expect(userDones.length).toBeGreaterThanOrEqual(2)
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// S2 — latest-wins: 앞선 idle이 뒤이은 running에 의해 무효화되면 idle-close 예약 안 함 [RED]
// ══════════════════════════════════════════════════════════════════════════════════
//
// "최신 상태 추적"의 실증. 스트림에 idle → running 순서로 도착하면 최신은 running이다. 승격은
// "최신 session_state==='idle'"일 때만 예약하므로, 앞선 idle은 running에 의해 무효화(supersede)돼
// idle-close를 예약하지 않아야 한다. 현행은 session_state를 전혀 안 보고 큐 empty만으로 close → RED.
// (guards against "한 번이라도 idle을 봤으면 close 허용" 버그 — 반드시 *최신*이어야 함.)
//
// 주(정직한 범위): 스트림 도착 역전 "running(새 턴) → 늦은 idle(이전 턴)" — 즉 idle이 최신인데도
// stale이라 무효화해야 하는 케이스 — 는 session_state에 turn 상관자(turn id)가 없어 순수 스트림만으론
// 구별 불가(agent-backend/coordinator 설계 결정 필요). 본 테스트는 결정론적으로 성립하는 latest-wins
// 방향(idle→running)만 hard-RED로 고정하고, 역전 케이스는 보고서에서 설계 플래그로 남긴다.

describe('S2[RED] — latest-wins: idle 뒤 running이 오면 최신=running → idle-close 예약 안 함', () => {
  it('idle→running 순서 수신 후 큐 empty done → grace 예약 안 됨(hold): grace-expired 0 · 스트림 미종료', async () => {
    const pull: { secondPullDone: boolean | undefined } = { secondPullDone: undefined }
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield ss('idle') // 앞선 idle(무효화 대상)
      yield ss('running') // 최신 = running → idle이 supersede돼야 함
      yield mkResult('turn1') // user origin, pendingSends 1→0
      const second = await inputIter.next()
      pull.secondPullDone = second.done
      if (!second.done) yield mkResult('turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'latest-wins 검증' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    const snap = await snapshotThenAbort(run, consume, events, pull)

    // 앞선 idle·최신 running 둘 다 관측됐다(주입 유효성).
    expect(sessionStates(events)).toEqual([
      { type: 'session_state', state: 'idle' },
      { type: 'session_state', state: 'running' },
    ])
    // RED: 현행은 최신 running을 무시하고 close → grace-expired 방출 + pull 해소.
    //   승격 후: 최신 running이 앞선 idle을 무효화 → hold.
    expect(snap.graceExpired).toBe(0)
    expect(snap.secondPullDoneBeforeAbort).not.toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// S3 — session_state 0건(미수신 환경): 기존 grace-expired fallback 바이트 동일 [안전불변식]
// ══════════════════════════════════════════════════════════════════════════════════
//
// 신호 미수신 세션은 축2~5(기존 메커니즘)로만 판정 — 승격이 이 경로를 건드리면 안 된다. lr4-p03
// 계약2가 이미 이 fallback(무활동 done → grace 만료 → ended[grace-expired] + 스트림 닫힘)을
// 커버한다(아래 재확인). 본 테스트는 gap1-p04b 네임스페이스의 명시 anchor로, 승격이 fallback을
// 회귀시키지 않음을 고정한다(현행·승격 후 모두 PASS).

describe('S3[안전불변식] — session_state 0건 세션은 기존 pendingSends grace fallback 그대로', () => {
  it('신호 미수신 무활동 done → grace 만료 → ended(grace-expired) + 입력 스트림 닫힘', async () => {
    let secondPullDone: boolean | undefined = undefined
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      // session_state 이벤트 0건 — 순수 fallback 경로.
      yield mkResult('turn1') // user origin, 활동 없음
      const second = await inputIter.next()
      secondPullDone = second.done
      if (!second.done) yield mkResult('unexpected-turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '신호 없는 대화' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    // 신호 0건 확인.
    expect(sessionStates(events).length).toBe(0)
    // fallback: grace 만료로 스트림이 닫힌다(기존 거동 바이트 동일).
    expect(secondPullDone).toBe(true)
    expect(graceExpiredEnded(events).length).toBeGreaterThanOrEqual(1)
    expect(dones(events).length).toBe(1)
    expect(dones(events)[0].origin).toBe('user')
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// S4 — requires_action: 권한 대기 = 살아있어야 함, idle-close 금지 [RED]
// ══════════════════════════════════════════════════════════════════════════════════
//
// requires_action은 "사용자 action(권한 승인 등) 대기" 상태 — 세션은 살아 있어야 한다. 승격은
// "최신==='idle'"일 때만 예약하므로 requires_action(≠idle)이면 예약하지 않아야 한다. 현행은
// session_state 무시 → 큐 empty면 close → RED.

describe('S4[RED] — 최신 session_state=requires_action이면 idle-close 금지(권한 대기 생존)', () => {
  it('requires_action 수신 후 큐 empty done → grace 예약 안 됨(hold): grace-expired 0 · 스트림 미종료', async () => {
    const pull: { secondPullDone: boolean | undefined } = { secondPullDone: undefined }
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield ss('requires_action') // 권한/action 대기 — 살아있어야 함
      yield mkResult('turn1') // user origin, pendingSends 1→0
      const second = await inputIter.next()
      pull.secondPullDone = second.done
      if (!second.done) yield mkResult('turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '권한 대기 세션' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    const snap = await snapshotThenAbort(run, consume, events, pull)

    expect(sessionStates(events)).toContainEqual({ type: 'session_state', state: 'requires_action' })
    // RED: 현행은 requires_action 무시하고 close. 승격 후: ≠idle → idle-close 금지 → hold.
    expect(snap.graceExpired).toBe(0)
    expect(snap.secondPullDoneBeforeAbort).not.toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// S5 — running 잔존 + abort: abort는 session_state와 독립 최우선 경로 [안전불변식]
// ══════════════════════════════════════════════════════════════════════════════════
//
// abort는 idle-close와 분리된 무조건 종료 경로(claudeAgentRun _inputGen 불변조건). session_state가
// running(=승격 시 hold 대상)이어도 abort는 즉시 세션을 끝낸다 — 승격이 running 신호로 abort를
// 막지 않음을 고정한다(현행·승격 후 모두 PASS). 렌더러측 interrupt-stuck 회귀는 lr4-p01이 커버.

describe('S5[안전불변식] — running 신호 잔존에도 abort는 최우선으로 세션을 종료한다', () => {
  it('running 수신 후 abort → 입력 스트림 즉시 종료(consume 자연 해소) · error 없음', async () => {
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield ss('running') // 승격 시 hold 대상 상태
      yield mkResult('turn1')
      const second = await inputIter.next() // park — abort가 깨워 종료시킨다
      if (!second.done) yield mkResult('turn2-unexpected')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'abort 최우선' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    // turn1까지 처리되도록 microtask 정착 후 abort(타이머 진행 없이 — grace 무관하게 abort가 이긴다).
    await flushMicrotasks()
    run.abort()
    // abort가 hang 없이 consume를 종료시켜야 한다(running 신호가 종료를 막지 않는다).
    await consume

    expect(sessionStates(events)).toContainEqual({ type: 'session_state', state: 'running' })
    // abort는 정상 종료 — error 이벤트를 만들지 않는다.
    expect(events.some((e) => e.type === 'error')).toBe(false)
    // 예기치 않은 turn2가 방출되지 않았다(abort가 park를 깨워 종료) — turn1 done 하나뿐.
    expect(dones(events).length).toBe(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// S6 — grace 대기 중 idle 신호: grace 타이밍(GRACE_MS) 불변 + continuation 흡수(active) [안전불변식]
// ══════════════════════════════════════════════════════════════════════════════════
//
// 축4 존치 확인. 자율 grace 대기 중 idle 신호가 도착해도 (a) grace를 즉시 만료시키지 않고(짧은
// 델타로는 close 안 됨), (b) continuation 흡수(active 방출) 거동은 그대로다. session_state는 grace
// *예약 게이트*에만 조건을 얹을 뿐 grace 타이머 자체를 트리거/취소/단축/연장하지 않는다. lr4-p03의
// 비중첩 GraceProbe barrier를 재사용해 결정론을 보장한다(현행·승격 후 모두 PASS).

describe('S6[안전불변식] — grace 대기 중 idle 신호가 grace 타이밍을 바꾸지 않고 continuation 흡수 불변', () => {
  it('turn1 grace 예약 → grace 창 안에 idle 신호+continuation 도착 → active 방출 · 즉시 close 없음', async () => {
    const probe = new GraceProbe()
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1') // user origin → grace 예약(pendingSends 1→0)

      // 유예 창에 흡수되는 자율 continuation — 도착 전 checkpoint로 park.
      let closed = false
      const pending = inputIter.next()
      void pending.then((r) => {
        if (r.done) closed = true
      })
      await probe.checkpoint()
      if (closed) return
      yield ss('idle') // grace 대기 중 idle 신호 — grace를 즉시 만료시키면 안 됨
      yield mkResult('turn2') // 흡수됨(cron origin) → active
      // 이후 continuation 없이 park한다 — 세션을 살려둬 grace *타이머*가 만료로 close시키게 한다.
      // (여기서 return하면 pump finally의 gracePendingAtExit가 grace-expired를 즉시 방출해
      //  "idle 신호가 grace를 즉시 만료시키지 않았다"는 타이밍 검증이 오염된다.)
      const third = await inputIter.next()
      if (!third.done) yield mkResult('turn3-unexpected')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '목표까지 자율 진행' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    // turn2 흡수(1회 checkpoint) — GRACE_PROBE_MS(<grace)만 진행. 이 짧은 델타로는 close 안 됨.
    const gotCheckpoint = await Promise.race([
      probe.waitForCheckpoint().then(() => true as const),
      consume.then(() => false as const),
    ])
    expect(gotCheckpoint).toBe(true) // 세션이 GRACE_PROBE 진행 전에 죽지 않았다.
    await vi.advanceTimersByTimeAsync(GRACE_PROBE_MS)
    await Promise.resolve()
    probe.release()
    await flushMicrotasks()

    // (a) idle 신호가 grace를 즉시 만료시키지 않았다 — 짧은 델타 시점엔 grace-expired 없음.
    const endedBeforeExpire = graceExpiredEnded(events).length
    // 잔여 유예 만료(축4 존치) — 이제서야 grace-expired가 나야 한다.
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    // idle 신호는 grace를 즉시 만료시키지 않았다(GRACE_MS 타이밍 존치).
    expect(endedBeforeExpire).toBe(0)
    // continuation 흡수 신호(active) 방출 — grace 흡수 거동 불변.
    const actives = autonomy(events).filter((e) => e.status === 'active')
    expect(actives.length).toBeGreaterThanOrEqual(1)
    // 다중 스텝 생존(turn1+turn2) — idle 신호가 continuation을 죽이지 않았다.
    expect(dones(events).length).toBeGreaterThanOrEqual(2)
    // 최종적으로는 grace 만료로 정상 종료(ended[grace-expired]).
    expect(graceExpiredEnded(events).length).toBeGreaterThanOrEqual(1)
    // abort로 죽인 게 아니라 자연 진행 — error 없음.
    expect(events.some((e) => e.type === 'error')).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// 실순서RED — running→result(done)→idle(done 뒤!): 후행 idle이 idle-close 트리거 [RED]
// ══════════════════════════════════════════════════════════════════════════════════
//
// reviewer 실측 회귀(GAP1 P04b Wave2c). 실 SDK 방출 순서는 `running`(별개 system msg) →
// `result`(done) → `idle`(별개 system msg) — **idle이 done 뒤에 도착**한다(fixture 증거:
// 99.Others/tests/fixtures/gap1-p03/probe-2b-session-state-env.jsonl L3 running · L13 result ·
// L14 idle). 기존 이 스위트의 시나리오(핵심RED·S2)는 전부 `running`을 result *앞*에만 주입해
// 이 순서를 놓쳤다.
//
// 현행 P04b 구현의 결함: idle-close 게이트는 done 경계(claudeAgentRun.ts:1080)에서만 평가된다.
// running→result 순서라 done 경계 시점 최신 session_state는 'running'(늦은 idle 미도착) →
// `_sessionStateGateOpen()`=false → grace 미예약(else 분기 cancelIdleGrace). 뒤이어 도착한
// idle은 관찰 지점(1025-1028)에서 **필드만 갱신·재평가 트리거 없음** → 무활동 턴이 **영영
// idle-close 안 됨**(secondPull 미해소·grace-expired 0) = LR4 P03 회귀.
//
// 봉합(agent-backend 구현): idle 신호 관찰(관찰 지점)이 idle-close 트리거가 된다 — 신호 수신
// 세션에서 `idle` 관찰 시 `큐 empty(_pendingSends 0) ∧ !hasLoopActivity() ∧ grace 미대기 ∧
// !_idleClosing`이면 `_scheduleIdleGrace()` 재트리거 → grace 만료 → close.
//
// 방향(핵심RED의 반대): 핵심RED는 running만 오고 idle이 안 오면 hold(grace-expired 0 · pull
// 미해소)를 기대한다. 이 테스트는 idle이 (done 뒤에라도) 오면 결국 close(grace-expired≥1 ·
// pull done:true)를 기대한다 — 둘이 공존해야 한다("running이면 hold, 늦은 idle이 오면 close").

describe('실순서RED — running→result(done)→idle(done 뒤)이면 후행 idle이 grace 재트리거 → 결국 close', () => {
  it('running→turn1 done(큐 empty)→idle(done 뒤!) 순서 → idle 관찰이 grace 재트리거 → grace-close: grace-expired≥1 · 입력 스트림 done:true', async () => {
    const pull: { secondPullDone: boolean | undefined } = { secondPullDone: undefined }
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield ss('running') // SDK 별개 system msg: 실행 중
      yield mkResult('turn1') // result(done) — 이 시점 최신=running이라 done 경계 grace 게이트 닫힘
      yield ss('idle') // ★ done 뒤에 도착하는 idle(실 SDK 순서) — 이 관찰이 idle-close 트리거가 돼야
      // 다음 입력 park — 봉합 시 후행 idle이 grace 재트리거 → 만료가 이 pull을 done:true로 해소.
      // 현행은 후행 idle이 재평가를 안 해 grace 미예약 → 이 pull이 영영 park(hold).
      const second = await inputIter.next()
      pull.secondPullDone = second.done
      if (!second.done) yield mkResult('turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '실 SDK 순서 idle-close' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    const snap = await snapshotThenAbort(run, consume, events, pull)

    // 사전 확인: running·idle 둘 다 관측 — idle이 result *뒤*에 온 실 SDK 순서(주입 유효성).
    expect(sessionStates(events)).toEqual([
      { type: 'session_state', state: 'running' },
      { type: 'session_state', state: 'idle' },
    ])
    // RED 핵심: 현행은 후행 idle을 필드 갱신만 하고 재평가 안 함 → grace 미예약 → held.
    //   봉합 후: idle 관찰이 grace 재트리거 → 만료 → close(grace-expired 방출 · pull 해소).
    expect(snap.graceExpired).toBeGreaterThanOrEqual(1)
    expect(snap.secondPullDoneBeforeAbort).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// 실순서+continuation RED — 후행 idle이 grace 켜도 continuation이 흡수, 이후 무활동에서 close
// ══════════════════════════════════════════════════════════════════════════════════
//
// 위 실순서RED의 S6 인접 확장. 후행 idle이 grace를 *켜더라도*(봉합 거동) 유예 창 안에 자율
// continuation(turn2)이 도착하면 흡수(active 방출 + grace 취소)하고, 이후 진짜 무활동에서만
// close한다. 즉 후행-idle 트리거가 continuation 흡수(S6 안전불변식)를 깨지 않음을 고정한다.
//
// RED 판별력: continuation 흡수 신호(active)는 "turn2 도착 시 grace가 대기 중"일 때만 방출된다
// (claudeAgentRun.ts:1000). 현행은 running→result로 done 경계 grace 게이트가 닫혔고 후행 idle이
// 재트리거를 안 하므로 turn2 도착 시 grace 미대기 → active 미방출(actives 0) = RED. 봉합 후:
// 후행 idle이 grace 재트리거 → turn2가 그 창에 흡수 → active 방출(actives≥1) = GREEN.
// 최종 close(grace-expired≥1)는 turn2 done 경계 시점 최신=idle이라 현행·봉합 모두 성립한다
// (그래서 close 자체는 판별점이 아니고, active 방출이 판별점이다).
//
// 결정론: S6의 비중첩 GraceProbe barrier 재사용(중첩 advance 0). 짧은 델타(GRACE_PROBE_MS)로는
// grace가 만료되지 않음을 함께 확인해 "후행 idle이 grace를 즉시 만료시키지 않는다"도 고정한다.

describe('실순서+continuation RED — 후행 idle이 grace를 켜도 continuation이 흡수(active) · 이후 무활동에서 close', () => {
  it('running→turn1 done→idle(done 뒤)→continuation turn2 흡수(active) → 최종 grace-close', async () => {
    const probe = new GraceProbe()
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield ss('running') // 실행 중
      yield mkResult('turn1') // done, 큐 empty. 현행: 최신 running → done 경계 grace 게이트 닫힘
      yield ss('idle') // done 뒤 idle — 봉합: 여기서 grace 재트리거(이후 continuation이 흡수)

      // 유예 창에 흡수되는 자율 continuation(S6 관례) — 도착 전 checkpoint로 park.
      let closed = false
      const pending = inputIter.next()
      void pending.then((r) => {
        if (r.done) closed = true
      })
      await probe.checkpoint()
      if (closed) return
      yield mkResult('turn2') // 봉합 시 grace 대기 중이라 흡수(cron origin) → active. 현행은 grace 미대기 → active 없음
      // 이후 continuation 없이 park — turn2 done 경계(최신=idle)가 grace를 예약해 만료로 close시킨다.
      const third = await inputIter.next()
      if (!third.done) yield mkResult('turn3-unexpected')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '실 순서 continuation 흡수' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    // turn2 흡수(1회 checkpoint) — GRACE_PROBE_MS(<grace)만 진행. 이 짧은 델타로는 close 안 됨.
    const gotCheckpoint = await Promise.race([
      probe.waitForCheckpoint().then(() => true as const),
      consume.then(() => false as const),
    ])
    expect(gotCheckpoint).toBe(true) // 세션이 GRACE_PROBE 진행 전에 죽지 않았다.
    await vi.advanceTimersByTimeAsync(GRACE_PROBE_MS)
    await Promise.resolve()
    probe.release()
    await flushMicrotasks()

    // (a) 후행 idle이 grace를 즉시 만료시키지 않았다 — 짧은 델타 시점엔 grace-expired 없음.
    const endedBeforeExpire = graceExpiredEnded(events).length
    // 잔여 유예 만료(축4 존치) — turn2 done 경계가 예약한 grace가 이제야 만료.
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    // 후행 idle 관찰 + 최신=running(사전) + 최신=idle(후행) 순서 관측(주입 유효성).
    expect(sessionStates(events)).toContainEqual({ type: 'session_state', state: 'running' })
    expect(sessionStates(events)).toContainEqual({ type: 'session_state', state: 'idle' })
    // 후행 idle이 grace를 즉시 만료시키지 않았다(GRACE_MS 타이밍 존치, S6 정합).
    expect(endedBeforeExpire).toBe(0)
    // RED 판별: continuation 흡수 신호(active) — 후행 idle이 grace를 켰어야 turn2가 흡수돼 방출된다.
    //   현행은 turn2 도착 시 grace 미대기 → active 0 = RED. 봉합 후 grace 재트리거 → 흡수 → active≥1.
    const actives = autonomy(events).filter((e) => e.status === 'active')
    expect(actives.length).toBeGreaterThanOrEqual(1)
    // 다중 스텝 생존(turn1+turn2) — 후행 idle이 continuation을 죽이지 않았다.
    expect(dones(events).length).toBeGreaterThanOrEqual(2)
    // 최종적으로는 grace 만료로 정상 종료(turn2 done 경계가 예약 — 현행·봉합 공통).
    expect(graceExpiredEnded(events).length).toBeGreaterThanOrEqual(1)
    // abort로 죽인 게 아니라 자연 진행 — error 없음.
    expect(events.some((e) => e.type === 'error')).toBe(false)
  })
})
