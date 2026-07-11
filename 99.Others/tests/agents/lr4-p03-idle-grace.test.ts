/**
 * lr4-p03-idle-grace.test.ts — 자율반복 idle-close 유예/상한/생존신호 TDD (LR4 Phase 03, RED)
 *
 * 배경(설계 스펙): 지속세션 펌프(`claudeAgentRun.ts` `_runPersistentPump`)는 현재 done 직후
 * 즉시 idle-close한다(:782 `if (pendingSends===0 && !hasLoopActivity())` → `_idleClosing=true`
 * → 입력 스트림 return → 세션 종료). LR4 P03은 이 즉시 판정을 "짧은 유예(grace) 후 판정 +
 * 무한루프 상한(cap) + 생존신호(autonomy_status) 방출"로 바꾼다.
 *
 * 이 스위트는 그 스펙을 인코딩하는 **실패(RED) 테스트**다 — 현재(미구현) 코드에 대해 실패하고,
 * agent-backend가 유예/상한/신호를 구현하면 통과(GREEN)해야 한다. 앱 소스는 이 Phase에서
 * 건드리지 않는다(테스트만).
 *
 * ── 결정성(determinism) 원칙 ──────────────────────────────────────────────────
 * 유예는 진짜 `setTimeout` 기반(P01의 async-teardown 창과 다름)일 예정이므로 가짜 타이머
 * (`vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync`)로 제어한다. **정확한 grace(3000ms)에
 * 결속하지 않는다**:
 *  - "유예 중 흡수" 검증: continuation을 grace보다 확실히 작은 델타(GRACE_PROBE_MS=100) 후
 *    도착시킨다 → 세션 생존·`active` 방출 assert.
 *  - "유예 만료 close" 검증: continuation 없이 어떤 합리적 grace보다 큰 델타(EXPIRE_MS=10_000)
 *    진행 → close·`ended`(grace-expired) assert.
 *
 * ── 상수(constants) ──────────────────────────────────────────────────────────
 * agent-backend가 `IDLE_CLOSE_GRACE_MS`·`MAX_CONSECUTIVE_AUTONOMOUS_TURNS`를 export할 예정이나
 * RED 단계에선 미존재가 정상 → 값 하드코딩(영호 확정 2026-07-11) + "agent-backend 상수와 일치
 * 해야 함" 주석. export가 생기면 후속 정리 가능(필수 아님).
 *
 * 신뢰경계: 실 SDK 호출 0. mock QueryFn이 SDKMessage 형상을 흉내(lr3-p02 관례 미러).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type {
  AgentEvent,
  AgentEventDone,
  AgentEventAutonomyStatus,
  AutonomyEndedReason,
} from '../../../02.Source/shared/agent-events'

// ── 상수(agent-backend export 예정 — 미존재 시 하드코딩, 상수값과 일치해야 함) ──────────

/**
 * 연속 자율(cron-origin) 턴 상한. agent-backend `MAX_CONSECUTIVE_AUTONOMOUS_TURNS` 상수와
 * 일치해야 함(영호 확정 2026-07-11: 100). export가 생기면 import로 대체 가능.
 */
const MAX_CONSECUTIVE_AUTONOMOUS_TURNS = 100

/** grace보다 확실히 작은 probe 델타(유예 중 continuation 흡수 검증). grace(≈3000)에 결속 X. */
const GRACE_PROBE_MS = 100

/** 어떤 합리적 grace보다 큰 델타(유예 만료 close 검증). grace(≈3000)에 결속 X. */
const EXPIRE_MS = 10_000

// ── 공통 픽스처 (lr3-p02-idle-session-lifetime.test.ts 관례 미러) ──────────────────

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

function mkInit(sessionId = 'sess-test') {
  return {
    type: 'system' as const,
    subtype: 'init' as const,
    session_id: sessionId,
    apiKeySource: 'none' as const,
    cwd: '/tmp',
    tools: [],
    mcp_servers: [],
    model: 'claude-haiku-4-5-20251001',
    permissionMode: 'default' as const,
    slash_commands: [],
    uuid: 'uuid-init-0000-0000-0000-000000000002' as `${string}-${string}-${string}-${string}-${string}`,
  }
}

// ── 이벤트 헬퍼 ────────────────────────────────────────────────────────────────

function dones(events: AgentEvent[]): AgentEventDone[] {
  return events.filter((e): e is AgentEventDone => e.type === 'done')
}
function autonomy(events: AgentEvent[]): AgentEventAutonomyStatus[] {
  return events.filter((e): e is AgentEventAutonomyStatus => e.type === 'autonomy_status')
}

// ── 가짜 타이머(유예 setTimeout 제어) ─────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

// ── 계약 1: goal 자멸 재현 → 다중 스텝 생존 ────────────────────────────────────────
//
// P01에 없던 "goal 자멸 재현"의 신설. goal stop-hook 자율 continuation을 "세션(입력 스트림)
// 생존 의존"으로 모델링한다:
//   - 현재 코드(즉시 close): turn1 done → idle-close 즉시 발동 → 2번째 input pull이 즉시
//     done:true → closed=true → mock이 turn2 안 냄 → done 1개(RED: 테스트는 ≥2·생존 기대).
//   - 유예 코드: 2번째 input pull이 park(grace 보유) → closed=false → turn2 방출 → 생존 →
//     done ≥2 + active 방출(GREEN).

describe('계약1 — goal 자멸 재현: 유예가 입력을 park시켜 자율 continuation 흡수(다중 스텝 생존)', () => {
  it('turn1 done 이후 continuation이 유예 창에 흡수돼 turn2까지 진행(done ≥2 + active)', async () => {
    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      // 초기 user 턴
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1') // user origin

      // ── goal stop-hook 자율 continuation: 세션(입력 스트림) 생존에 의존 ────────────
      // 입력 pull을 await하지 말고 캡처 → done이면 세션이 닫힌 것(자멸).
      let closed = false
      const pull = inputIter.next()
      void pull.then((r) => { if (r.done) closed = true })
      // grace보다 작은 델타 진행 — 즉시 close(현재 코드)면 pull이 microtask로 done:true 해소,
      // 유예(미래 코드)면 grace가 park시켜 미해소.
      await vi.advanceTimersByTimeAsync(GRACE_PROBE_MS)
      await Promise.resolve() // pull.then microtask 정착 보장

      if (closed) return // 자멸: 입력이 idle-close로 이미 닫힘 → turn2 없음
      yield mkResult('turn2') // 생존: 유예가 입력을 park → continuation 흡수

      // turn2 이후 자기종료(무한 방지) — 다음 유예 창에서 계속 park하지 않도록 즉시 return.
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '목표 달성까지 계속 진행해줘' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    // abort 없이 for-await가 스스로 끝나야 한다(전체 정리 경로 도달).
    for await (const e of run.events) events.push(e)

    // 다중 스텝 생존: 자율 continuation이 흡수돼 최소 2턴 진행.
    expect(dones(events).length).toBeGreaterThanOrEqual(2)
    // active 생존신호: 유예 중 continuation 흡수 시 방출.
    const actives = autonomy(events).filter((e) => e.status === 'active')
    expect(actives.length).toBeGreaterThanOrEqual(1)
    // abort로 죽인 게 아니라 자연 진행 — error 없음.
    expect(events.some((e) => e.type === 'error')).toBe(false)
  })
})

// ── 계약 2: 유예 만료 close ────────────────────────────────────────────────────────
//
// 무활동 user 턴1 → continuation 없이 큰 델타 진행 → 입력 스트림 return(다음 pull done:true)
// + ended(grace-expired) 방출 + for-await 자연 종료(abort 불필요).

describe('계약2 — 유예 만료: continuation 없으면 grace 경과 후 자연종료 + ended(grace-expired)', () => {
  it('무활동 done → 유예 만료 → 입력 스트림 닫힘 + ended(grace-expired) 방출', async () => {
    let secondPullDone: boolean | undefined = undefined

    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1') // user origin, 활동 없음

      // continuation 없이 유예 만료를 기다린다 — 큰 델타 후 pull이 done:true로 해소되면 close.
      const second = await inputIter.next()
      secondPullDone = second.done
      if (!second.done) yield mkResult('unexpected-turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '활동 없는 대화' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    // 유예 만료 발동 — 어떤 합리적 grace보다 크게 진행.
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    // 유예 만료 후 입력 스트림이 닫힌다(즉시 close도 이 assert는 만족 — 계약 보존).
    expect(secondPullDone).toBe(true)
    // 유예 만료 자연종료 신호.
    const ended = autonomy(events).filter((e) => e.status === 'ended')
    expect(ended.length).toBeGreaterThanOrEqual(1)
    const reason: AutonomyEndedReason = 'grace-expired'
    expect(ended.some((e) => e.reason === reason)).toBe(true)
    // done은 turn1 하나(user origin).
    expect(dones(events).length).toBe(1)
    expect(dones(events)[0].origin).toBe('user')
  })
})

// ── 계약 3: 상한(cap) 발동 통지 + 사용자 push 리셋 ─────────────────────────────────

describe('계약3 — 상한: 연속 자율 턴이 상한을 넘으면 유계 강제종료 + ended(cap-reached)', () => {
  it('101 연속 자율(cron-origin) 턴 구동 → 무한이 아닌 유계 종료 + ended(cap-reached)', async () => {
    // 자율 continuation을 상한+1회 방출 시도한다. 각 continuation은 입력 pull을 await하지 않고
    // 곧바로 다음 result를 yield해 "사용자 push 없는 연속 자율 턴"을 모델링한다.
    const attempts = MAX_CONSECUTIVE_AUTONOMOUS_TURNS + 1
    let autonomousYields = 0

    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('user-turn') // 초기 user 턴

      // 사용자 push 없이 연속 자율 턴을 쏟아낸다 — 상한이 없으면 무한, 있으면 유계.
      for (let i = 0; i < attempts; i++) {
        // 입력이 닫혔는지(cap 강제종료) 비차단 확인 — 닫혔으면 즉시 중단(무한 방지).
        let closed = false
        const pull = inputIter.next()
        void pull.then((r) => { if (r.done) closed = true })
        await vi.advanceTimersByTimeAsync(GRACE_PROBE_MS)
        await Promise.resolve()
        if (closed) return
        autonomousYields++
        yield mkResult(`cron-turn-${i}`)
      }
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '멈추라고 할 때까지 계속' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()
    // cap 발동을 위해 넉넉히 진행(각 자율 턴 사이 GRACE_PROBE_MS 창 소진).
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    // 무한이 아니라 유계 — 처리된 자율 done이 상한 부근에서 멈춘다(시도 attempts 전부 소진 X).
    const cronDones = dones(events).filter((e) => e.origin === 'cron')
    expect(cronDones.length).toBeLessThanOrEqual(MAX_CONSECUTIVE_AUTONOMOUS_TURNS)
    expect(autonomousYields).toBeLessThan(attempts)
    // 상한 초과 강제종료 신호.
    const ended = autonomy(events).filter((e) => e.status === 'ended')
    const reason: AutonomyEndedReason = 'cap-reached'
    expect(ended.some((e) => e.reason === reason)).toBe(true)
  })

  it('자율 턴 몇 개 → 사용자 push 개입 → 카운터 리셋(다시 자율 여유 확보)', async () => {
    // 자율 턴 몇 개 → user push(pendingSends++로 origin=user) → 카운터 리셋 → 다시 자율 진행.
    // 리셋이 없으면 push 이후 자율 여유가 사라져 곧바로 cap-reached가 나야 하지만, 리셋되면
    // push 직후에는 cap-reached가 발동하지 않는다(여유 회복).
    let pushed = false
    const preAutonomous = 3

    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('user-turn-1')

      // 자율 턴 몇 개(상한보다 훨씬 적게).
      for (let i = 0; i < preAutonomous; i++) {
        let closed = false
        const pull = inputIter.next()
        void pull.then((r) => { if (r.done) closed = true })
        await vi.advanceTimersByTimeAsync(GRACE_PROBE_MS)
        await Promise.resolve()
        if (closed) return
        yield mkResult(`cron-turn-${i}`)
      }

      // 사용자 push 대기 — run.push()가 입력 스트림에 새 user 메시지를 넣으면 pull이 값으로 해소.
      const afterPush = await inputIter.next()
      if (afterPush.done) return
      yield mkResult('user-turn-2') // 이 done은 user origin(pendingSends>0)
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '자율로 몇 번 돌려줘' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) {
        events.push(e)
        // 자율 턴 몇 개 지난 뒤 사용자 개입 push — 카운터 리셋 신호원.
        if (!pushed && e.type === 'done' && e.origin === 'cron') {
          pushed = true
          run.push('사용자 개입: 계속해')
        }
      }
    })()
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    // 사용자 push가 반영된 user-turn-2 done이 도달해야 한다(카운터 리셋으로 세션이 살아있음).
    const userDones = dones(events).filter((e) => e.origin === 'user')
    expect(userDones.length).toBeGreaterThanOrEqual(2)
    // push 개입 시점에는 cap-reached가 발동하지 않는다(리셋으로 여유 회복 — 소수 자율뿐).
    const capEnded = autonomy(events).filter((e) => e.status === 'ended' && e.reason === 'cap-reached')
    expect(capEnded.length).toBe(0)
  })
})

// ── 계약 4: 신호 방출 정합 ─────────────────────────────────────────────────────────
//
// active는 continuation 흡수 시, ended는 close 시 reason과 함께. active가 ended보다 먼저
// (라이브 goal 세션). reason 리터럴이 계약(grace-expired/cap-reached)과 일치.

describe('계약4 — 신호 방출 정합: active(흡수) → ended(reason) 순서 + reason 리터럴 계약 일치', () => {
  it('goal 세션: active가 ended보다 먼저 방출되고 ended.reason이 계약 리터럴과 일치', async () => {
    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkInit('sess-lr4-p03-c4')
      yield mkResult('turn1') // user origin

      // 유예 창에 흡수되는 자율 continuation 1회(→ active).
      let closed = false
      const pull = inputIter.next()
      void pull.then((r) => { if (r.done) closed = true })
      await vi.advanceTimersByTimeAsync(GRACE_PROBE_MS)
      await Promise.resolve()
      if (closed) return
      yield mkResult('turn2') // 흡수됨(cron origin)
      // 이후 continuation 없음 → 다음 유예 만료로 ended(grace-expired).
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '목표까지 자율 진행' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()
    // turn2 흡수 후 다음 유예 만료까지 진행.
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    const statuses = autonomy(events)
    const firstActiveIdx = statuses.findIndex((e) => e.status === 'active')
    const firstEndedIdx = statuses.findIndex((e) => e.status === 'ended')
    // active·ended 둘 다 존재.
    expect(firstActiveIdx).toBeGreaterThanOrEqual(0)
    expect(firstEndedIdx).toBeGreaterThanOrEqual(0)
    // active가 ended보다 먼저(라이브 goal 세션).
    expect(firstActiveIdx).toBeLessThan(firstEndedIdx)
    // active에는 reason 미부여, ended에는 계약 리터럴 reason 부여.
    const active = statuses[firstActiveIdx]
    expect(active.reason).toBeUndefined()
    const ended = statuses[firstEndedIdx]
    const validReasons: AutonomyEndedReason[] = ['grace-expired', 'cap-reached']
    expect(ended.reason).toBeDefined()
    expect(validReasons).toContain(ended.reason!)
  })
})

// ── 계약 5: origin-gate — 사용자 push continuation은 spurious active를 방출하지 않는다 ──────
//
// reviewer LR4-P03 🟡#1(과소검증) 봉합 회귀 가드. active의 계약 의미(agent-events.ts)는
// "자율(cron-origin) 연속 턴이 유예 창에 흡수됨"이다. push()(사용자 send)는 대기 중이던
// 유예를 취소한 뒤 곧바로 재스케줄하므로(push() JSDoc), 사용자 turn이 유예 창(grace) 안에
// 응답되면 그 응답 msg가 흡수 블록(_graceTimer!==null)에 진입한다 — 하지만 그건 자율
// continuation이 아니라 "사용자 turn의 응답"이다. agent-backend가 흡수 블록의 active 방출에
// `&& this._pendingSends === 0` origin-gate를 추가해, 사용자 push(pendingSends>0)는 차단하고
// 자율 continuation(pendingSends===0)만 방출하도록 봉합했다.
//
// 이 스위트는 그 origin-gate를 고정한다. 대조군: 자율 continuation이 active를 *방출함*은
// 계약1(위)이 이미 커버한다 — 여기선 push 경로에서 active가 *부재*함만 확정한다.
//
// ── "gate 없으면 RED"의 논리 근거(트레이스) ──────────────────────────────────────
// origin-gate(`&& _pendingSends===0`)가 없던 수정 전 코드라면:
//  1. turn1(user) done → _pendingSends 1→0 → `_scheduleIdleGrace()`(유예 armed,
//     `_autonomyActiveEmitted=false`).
//  2. 소비 루프가 done#1을 받아 `run.push()` 호출 → _pendingSends 0→1 →
//     `_cancelIdleGrace()` 후 `_scheduleIdleGrace()` 재스케줄(`_autonomyActiveEmitted=false`로
//     리셋) → `_graceTimer!==null` 유지 → _inputGen wake → SDK가 turn2 방출.
//  3. turn2 msg가 펌프 `for await`에 도착 — `_graceTimer!==null`이라 흡수 블록 진입.
//     수정 전에는 조건이 `!_autonomyActiveEmitted`뿐 → `!false=true` → **active 1개 방출**.
// 즉 gate가 없으면 이 흐름에서 spurious active 1개가 방출돼 아래 assert 2(active===0)가
// RED가 된다. 지금은 gate가 `_pendingSends===1`(push 후 미차감)을 보고 차단하므로 GREEN.
// (직접 revert 없이 mock 흐름·소스 트레이스로 확인 — 결정적 타이머로 flaky 0.)

describe('계약5 — origin-gate: 사용자 push continuation은 spurious active를 방출하지 않는다', () => {
  it('사용자 push continuation은 spurious active를 방출하지 않는다', async () => {
    let pushed = false

    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1') // user origin — done 직후 유예 창이 열린다

      // 유예 창(grace) 안에서 사용자 push를 기다린다 — run.push()가 _inputQueue에 넣고
      // _resolveInput을 깨우면 이 pull이 값으로 해소된다(_inputGen이 큐를 즉시 yield).
      const afterPush = await inputIter.next()
      if (afterPush.done) return
      // 사용자 push의 응답 turn. push()로 _pendingSends>0 상태 → origin='user'.
      // _graceTimer는 push()가 재스케줄해 non-null → 흡수 블록 진입하지만, origin-gate가
      // pendingSends>0을 보고 active 방출을 차단해야 한다(회귀 가드 핵심).
      yield mkResult('turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '초기 사용자 대화' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) {
        events.push(e)
        // 첫 done(turn1, user)은 유예 창이 막 열린 시점 — grace 만료(아래 큰 advance) *전에*
        // 사용자 후속을 주입해 "유예 창 안 사용자 개입"을 재현한다(IC2 push 관례 미러).
        if (!pushed && e.type === 'done') {
          pushed = true
          run.push('사용자 후속')
        }
      }
    })()
    // 흐름은 push→wake→turn2로 microtask 구동되며, 잔여 유예/finally 정착을 위해 넉넉히 진행.
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    // 1. turn2가 정상 처리됨 — 사용자 continuation 흡수는 정상(세션 유지). done ≥ 2(둘 다 user).
    expect(dones(events).length).toBeGreaterThanOrEqual(2)
    expect(dones(events).every((e) => e.origin === 'user')).toBe(true)
    // 2. 핵심 회귀 가드 — 이 push 흐름에서 active는 단 하나도 방출되지 않는다(origin-gate).
    expect(events.filter((e) => e.type === 'autonomy_status' && e.status === 'active').length).toBe(0)
  })
})
