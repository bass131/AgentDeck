/**
 * gap1-p11-send-token-accounting.test.ts — send-token 턴 귀속 회계 불변식 ①~⑦ (GAP1 P11, TDD 선행)
 *
 * ── 목적 ─────────────────────────────────────────────────────────────────────────
 * P11 봉합("어댑터 내부 send-token 회계: queued→delivered→owned→completed. done은 자기 turn
 * epoch에 귀속된 token만 완료")의 완료 조건인 **회계 불변식 7항**을 실패-우선(RED)으로 못박는다.
 * repro(gap1-p11-autonomous-done-theft.repro.test.ts)가 이 Phase의 done 판사라면, 이 파일은 그
 * 판정을 회계 관점에서 세분화한 회귀 격자다 — 단정은 전부 **안전 기대값**(봉합 후 GREEN)으로
 * 쓰였고, 버그 경로를 태우는 것은 현행 HEAD에서 자연히 RED가 된다.
 *
 * ── 관찰 규율(공개 대리자만) ──────────────────────────────────────────────────────
 * 내부 필드(_pendingSends·sendSeq·_consecutiveAutonomousTurns 등)를 **직접 만지지 않는다**.
 * 봉합 후에도 유효한 잠금이 되려면 구현 세부가 아니라 계약 표면만 봐야 한다. 관찰점:
 *   · `run.events`의 공개 이벤트 — `done.origin` · `autonomy_status`(status/reason) · `loops`.
 *   · `run.onSessionClosing?.()` 콜백(idle-close commit 1회 동기 호출).
 *   · mock의 pull 기록(입력 스트림이 B를 실제로 당겼는가).
 *
 * ── 불변식별 현행 HEAD RED/GREEN 예측 ────────────────────────────────────────────
 *   ┌─────┬──────────────────────────────────────────────┬───────────────────────────┐
 *   │ 불변식 │ 내용                                         │ 현행 HEAD 예측            │
 *   ├─────┼──────────────────────────────────────────────┼───────────────────────────┤
 *   │ ①a  │ delivered→owned 앵커(B pull 후 A late done)   │ RED (버그 경로)           │
 *   │ ①b  │ pull-after-done 변형                          │ RED (버그 경로)           │
 *   │ ②   │ 연속 push 2건 = 각 user done 1:1              │ GREEN-both (회귀 잠금)    │
 *   │ ③   │ pending push 중 자율 done = 'cron'(무토큰)     │ RED (오분류 봉합 핵심)    │
 *   │ ④a  │ interrupt-result = 귀속 token 1회 완료         │ GREEN-both (회귀 잠금)    │
 *   │ ④b  │ interrupt throw 경로 = done 1개·잔여 token 0   │ GREEN-both (회귀 잠금)    │
 *   │ ⑤a  │ resume 모드 token 보존                        │ GREEN-both (회귀 잠금)    │
 *   │ ⑤b  │ 신호 미수신 fallback token 보존(session_state 무의존) │ GREEN-both (회귀 잠금) │
 *   │ ⑥   │ isReplay 제거가 token/epoch 비진행            │ GREEN-both (회귀 잠금)    │
 *   │ ⑦a  │ done.origin 원장 정합(리스크1)                │ RED (버그 경로)           │
 *   │ ⑦b  │ CronTracker 턴종료 판정 미오염(리스크1)        │ RED (버그 경로)           │
 *   │ ⑦c  │ 자율 cap 증감 origin 기준(리스크1)            │ GREEN-both (회귀 잠금)    │
 *   └─────┴──────────────────────────────────────────────┴───────────────────────────┘
 *   delivered→owned 전이 앵커(🟡#1) named 식별자 = 불변식 ① 첫 it('①a').
 *
 * ── 하네스 ─────────────────────────────────────────────────────────────────────────
 * gap1-p10/repro와 동형: 실 ClaudeCodeBackend + mock QueryFn · mkResult · 비중첩 Barrier ·
 * flushMicrotasks · fake timer. 실 SDK 호출 0. push/pull 시점은 Barrier로 결정론 고정(중첩
 * advance 0). cap 경계(⑦c)만 lr4-p03 driveCheckpoints 패턴으로 grace clock을 순차 advance.
 *
 * ⚠️ 이 파일은 테스트만 작성한다 — 02.Source/**는 R only. repro 파일도 미변경.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import { MAX_CONSECUTIVE_AUTONOMOUS_TURNS } from '../../../02.Source/main/01_agents/claudeAgentRun'
import type {
  AgentEvent,
  AgentEventDone,
  AgentEventAutonomyStatus,
  AgentEventLoops,
} from '../../../02.Source/shared/agent-events'

// ── 상수 ──────────────────────────────────────────────────────────────────────
/** grace(3000ms) 미만 델타 — 흡수 창 재현(lr4-p03 GRACE_PROBE_MS 미러). */
const GRACE_PROBE_MS = 100
/** 어떤 합리적 grace보다 큰 델타(유예 만료 close 검증, lr4-p03 EXPIRE_MS 미러). */
const EXPIRE_MS = 10_000

// ── SDK 원시 메시지 픽스처 (기존 스위트 미러) ─────────────────────────────────────

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
    session_id: 'sess-test',
  }
}

/** result(is_error, error_during_execution) — interrupt 직후 SDK가 emit(bf1 실측 미러). */
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

/**
 * raw session_state_changed 라인(SDK 원시). claude-stream이 `{type:'session_state', state}`로
 * 정규화. repro(gap1-p11-autonomous-done-theft.repro)의 ss() 미러 — 실 SDK는 매 턴 running을
 * result 이전에 방출한다(fixture probe-2b-session-state-env.jsonl: line3 running → line13 result
 * → line14 idle).
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

/** assistant(text) — 턴 진행 중/오너십 전이 마커. */
function mkAssistantText(text: string, msgId = 'msg_txt') {
  return {
    type: 'assistant' as const,
    message: {
      id: msgId,
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'text', text }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    parent_tool_use_id: null,
    uuid: `uuid-asst-${msgId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

/** assistant(tool_use) — 도구 실행 착수(interrupt throw 경로용). */
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

/** ScheduleWakeup tool_use — self-paced 루프 arm(wakeup-tracking.test.ts 미러). */
function mkWakeupToolUse(toolUseId: string, delaySeconds: number, reason: string, prompt = '') {
  return {
    type: 'assistant' as const,
    message: {
      id: `msg_${toolUseId}`,
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'tool_use', id: toolUseId, name: 'ScheduleWakeup', input: { delaySeconds, reason, prompt } }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    parent_tool_use_id: null,
    uuid: `uuid-asst-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

/** ScheduleWakeup tool_result(ok). */
function mkWakeupToolResult(toolUseId: string, content: string) {
  return {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content }],
    },
    parent_tool_use_id: null,
    uuid: `uuid-user-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

/** isReplay:true user(tool_result) — resume replay(mapClaudeStreamLine이 [] 드롭, gap1-p04 미러). */
function mkReplayUser(toolUseId = 'toolu_replayed_001') {
  return {
    type: 'user' as const,
    isReplay: true,
    parent_tool_use_id: null,
    tool_use_result: { ok: true },
    uuid: 'uuid-replay-0000-0000-000000000009' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
    message: {
      role: 'user' as const,
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content: [{ type: 'text', text: 'replayed output' }] }],
    },
  }
}

// ── 이벤트 헬퍼 ────────────────────────────────────────────────────────────────
function dones(events: AgentEvent[]): AgentEventDone[] {
  return events.filter((e): e is AgentEventDone => e.type === 'done')
}
function doneOrigins(events: AgentEvent[]): Array<'user' | 'cron' | undefined> {
  return dones(events).map((e) => e.origin)
}
function autonomy(events: AgentEvent[]): AgentEventAutonomyStatus[] {
  return events.filter((e): e is AgentEventAutonomyStatus => e.type === 'autonomy_status')
}
function loopsEvents(events: AgentEvent[]): AgentEventLoops[] {
  return events.filter((e): e is AgentEventLoops => e.type === 'loops')
}

/** fake timer 하에서 microtask만 순차 flush(타이머 미접촉). */
async function flushMicrotasks(times = 16): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

/** microtask를 predicate 충족까지(또는 bound까지) 순차 flush — push/pull 체인 정착용. */
async function settle(pred: () => boolean, rounds = 400): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    if (pred()) return
    await Promise.resolve()
  }
}

// ── Barrier: 비중첩 랑데부(repro/gap1-p10 동형) ───────────────────────────────────
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

/**
 * 비중첩 barrier 드라이버(lr4-p03 driveCheckpoints 미러) — mock checkpoint를 순차 구동.
 * 각 순회: (1) 다음 checkpoint 대기(또는 consume 선-종료 감지) (2) GRACE_PROBE_MS advance
 * (3) park 1개 release. consume이 먼저 settle(cap-reached 입력 스트림 close)하면 break.
 */
async function driveCheckpoints(barrier: Barrier, consume: Promise<void>, bound: number): Promise<void> {
  for (let i = 0; i < bound; i++) {
    const gotCheckpoint = await Promise.race([
      barrier.waitForCheckpoint().then(() => true as const),
      consume.then(() => false as const),
    ])
    if (!gotCheckpoint) break
    await vi.advanceTimersByTimeAsync(GRACE_PROBE_MS)
    await Promise.resolve()
    barrier.release()
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

// ══════════════════════════════════════════════════════════════════════════════════
// 불변식 ① — 자율 A의 무토큰 done이 B token을 완료(탈취)할 수 없다 (B pull 전후 무관)
// ══════════════════════════════════════════════════════════════════════════════════
//
// 회계 모델: push(B)는 B epoch에 귀속된 token을 발급한다. 자율 턴 A(무토큰 epoch)의 late done은
// 어떤 token도 완료하지 못한다 → B origin 보존('user') + 조기 close 0. done.origin 원장이 유일한
// 공개 판별자(B의 자기 done이 'user'로 완료되는가 vs A에게 탈취돼 'cron'으로 굶는가).

describe('불변식 ① — 자율 A done이 B token 완료 불가 (B origin 보존·조기 close 0)', () => {
  // 🟡#1 delivered→owned 전이 앵커: B가 pull(delivered)됐지만 아직 turn epoch 시작 전 상태에서
  // A의 late done이 도착. B token은 A의 done이 아니라 "A done 이후 B의 첫 스트림 메시지 = B 턴
  // 시작(owned 전이)"으로만 완료돼야 한다. 봉합 후 GREEN, 현행 RED. Step4에서 이 전이를 무력화하면
  // 이 케이스가 다시 RED로 뒤집혀 mutation 판별력을 재실증한다(named 격리 대상).
  it('①a [delivered→owned 앵커] B가 A late done 前 pull(delivered)돼도 A가 B token 완료 불가 — B 첫 스트림 후 B done이 자기 token 완료', async () => {
    const barrier = new Barrier()
    const pull: { bPulled: boolean } = { bPulled: false }
    let closeObserved = 0

    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const bootstrap = await inputIter.next()
      if (bootstrap.done) return
      yield mkResult('bootstrap') // done_bootstrap: user(초기 token 완료)
      // ── 자율 턴 A(push 없이 시작) ──
      // GAP1 P11(2026-07-14 영호 GO, 설계분기 옵션1): 실 SDK는 매 턴 session_state:running을
      // result 이전에 방출한다(fixture probe-2b-session-state-env.jsonl 순거: running→result→idle).
      // 이 running_A가 A의 turn epoch를 *B token delivery 前* 무토큰으로 앵커(_ownedSendSeq=null→
      // cron)한다 — repro(gap1-p11-autonomous-done-theft.repro)의 running_A 방출과 동형. 이 이벤트가
      // 없으면 done_A가 epoch 첫 메시지가 되어 delivered(B)를 owned로 승격·탈취하는 인위적 모순이
      // 발생했다(현행 실 SDK엔 부재하는 순서). running_A로 A epoch를 선-앵커해 그 탈취를 봉쇄한다.
      yield ss('running') // running_A: 자율 턴 A epoch 시작(무토큰) — B token delivery 前
      await barrier.checkpoint() // #1: test가 push('B') — B epoch token 발급
      // delivered-but-not-owned: B를 A의 late done *前*에 pull(입력 스트림에 전달됨, 그러나 B 턴 미시작)
      const second = await inputIter.next()
      pull.bPulled = !second.done
      yield mkResult('A') // done_A: 안전=cron(무토큰), 버그=user(B token 탈취)
      // ── B 턴 시작(owned 전이): B의 첫 스트림 메시지 ──
      yield mkAssistantText('B 첫 스트림 — B 턴 시작', 'msg_b')
      yield mkResult('B') // done_B: 안전=user(자기 token 완료), 버그=cron(굶음)
      await barrier.checkpoint() // #2: park
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '앵커 재현' }], persistent: true })
    run.onSessionClosing?.(() => {
      closeObserved++
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await barrier.waitForCheckpoint() // #1(done_bootstrap 처리 후)
    await flushMicrotasks()
    run.push('B') // B epoch token 발급 + 큐 적재
    await flushMicrotasks()
    barrier.release() // #1 해제 → pull B → done_A → B 첫 스트림 → done_B → #2
    await flushMicrotasks()
    await barrier.waitForCheckpoint() // #2
    await flushMicrotasks()

    const observed = { origins: doneOrigins(events), close: closeObserved, bPulled: pull.bPulled }

    run.abort()
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()
    await consume

    // 안전 기대값(봉합 후 GREEN, 현행 RED): A는 무토큰 자율(cron), B는 자기 token으로 완료(user).
    expect(observed).toEqual({ origins: ['user', 'cron', 'user'], close: 0, bPulled: true })
  })

  it('①b [pull-after-done 변형] B가 A late done 後 pull돼도 A가 B token 완료 불가', async () => {
    const barrier = new Barrier()
    const pull: { bPulled: boolean } = { bPulled: false }
    let closeObserved = 0

    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const bootstrap = await inputIter.next()
      if (bootstrap.done) return
      yield mkResult('bootstrap') // user
      await barrier.checkpoint() // #1: push('B')
      yield mkResult('A') // done_A: 안전 cron
      const second = await inputIter.next() // B를 A done 後 pull
      pull.bPulled = !second.done
      yield mkAssistantText('B 첫 스트림', 'msg_b')
      yield mkResult('B') // done_B: 안전 user
      await barrier.checkpoint() // #2
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '변형 재현' }], persistent: true })
    run.onSessionClosing?.(() => {
      closeObserved++
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await barrier.waitForCheckpoint()
    await flushMicrotasks()
    run.push('B')
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()
    await barrier.waitForCheckpoint()
    await flushMicrotasks()

    const observed = { origins: doneOrigins(events), close: closeObserved, bPulled: pull.bPulled }

    run.abort()
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()
    await consume

    expect(observed).toEqual({ origins: ['user', 'cron', 'user'], close: 0, bPulled: true })
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// 불변식 ② — 연속 push 2건 = 각 사용자 done과 1:1 완료 (순수 사용자 턴, 회귀 잠금 GREEN)
// ══════════════════════════════════════════════════════════════════════════════════

describe('불변식 ② — 연속 push 2건이 각 user done과 1:1 완료 (회귀 잠금, GREEN now)', () => {
  it('bootstrap + push×2 = user done 3개(순수 사용자 인터리브)', async () => {
    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1') // user
      const s2 = await inputIter.next() // push B1
      if (s2.done) return
      yield mkResult('turn2') // user
      const s3 = await inputIter.next() // push B2
      if (s3.done) return
      yield mkResult('turn3') // user
      await inputIter.next() // park
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '순수 사용자 턴' }], persistent: true })

    const events: AgentEvent[] = []
    let pushCount = 0
    const consume = (async () => {
      for await (const e of run.events) {
        events.push(e)
        if (e.type === 'done' && pushCount < 2) {
          pushCount++
          run.push(pushCount === 1 ? 'B1' : 'B2')
        }
      }
    })()

    await settle(() => dones(events).length >= 3)
    const origins = doneOrigins(events)

    run.abort()
    await flushMicrotasks()
    await consume

    // 각 사용자 turn이 자기 token으로 완료 — 3개 전부 user(1:1).
    expect(origins).toEqual(['user', 'user', 'user'])
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// 불변식 ③ — pending user push 중에 도착한 자율 done = 항상 무토큰·origin 'cron'
// ══════════════════════════════════════════════════════════════════════════════════
//
// 오분류 봉합의 핵심(현행 RED 예상). repro의 doneOrigins 단정을 최소 격리한 회계 단위:
// 자율 턴 A의 done은 push(B)로 pending token이 있어도 그 token을 완료하지 않는다 → 'cron'.

describe('불변식 ③ — pending push 중 자율 done = 무토큰·cron (오분류 봉합 핵심, RED 예상)', () => {
  it('done_A는 push(B) 이후에 도착해도 B token을 완료하지 않고 origin=cron', async () => {
    const barrier = new Barrier()

    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('bootstrap') // user
      await barrier.checkpoint() // #1: push('B')
      yield mkResult('A') // done_A: 안전 cron, 버그 user
      await barrier.checkpoint() // #2 park
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '자율 done' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await barrier.waitForCheckpoint()
    await flushMicrotasks()
    run.push('B')
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()
    await barrier.waitForCheckpoint()
    await flushMicrotasks()

    const origins = doneOrigins(events)

    run.abort()
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()
    await consume

    // bootstrap=user(초기 token), A=cron(무토큰 — pending B token 미소비).
    expect(origins).toEqual(['user', 'cron'])
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// 불변식 ④ — interrupt-result는 귀속 token만 1회 완료 · throw 경로 잔여 token 0 (회귀 잠금)
// ══════════════════════════════════════════════════════════════════════════════════

describe('불변식 ④ — interrupt 경로 token 회계 (회귀 잠금, GREEN now)', () => {
  it('④a interrupt-result(is_error emit)는 error 억제 + 귀속(user) token 1회 완료', async () => {
    let resolveWait: (() => void) | null = null
    let readyResolve: (() => void) | null = null
    const ready = new Promise<void>((r) => {
      readyResolve = r
    })

    const queryFn: QueryFn = function (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const gen = (async function* () {
        const first = await inputIter.next()
        if (first.done) return
        yield mkAssistantText('작업 진행 중...', 'msg_prog') // 진행 중 user 턴(귀속 token 보유)
        await new Promise<void>((resolve) => {
          resolveWait = resolve
          readyResolve?.()
        })
        yield mkErrorDuringExecutionResult() // interrupt-result: [error(억제), done(user)]
        const second = await inputIter.next() // held-open
        if (!second.done) yield mkResult('turn2')
      })()
      ;(gen as unknown as Record<string, unknown>)['interrupt'] = async () => {
        const r = resolveWait
        resolveWait = null
        r?.()
      }
      return gen as AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '긴 작업' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await ready
    run.interrupt()
    await settle(() => dones(events).length >= 1)

    const observed = { origins: doneOrigins(events), hasError: events.some((e) => e.type === 'error') }

    run.abort()
    await flushMicrotasks()
    await consume

    // interrupt-result의 error는 억제, done은 귀속 token(user) 정확히 1회 완료.
    expect(observed).toEqual({ origins: ['user'], hasError: false })
  })

  it('④b interrupt throw 경로 = done 1개(무origin)·error 미표면화·잔여 autonomy 신호 0(잔여 token 0)', async () => {
    let rejectRef: ((e: Error) => void) | null = null
    let readyResolve: (() => void) | null = null
    const ready = new Promise<void>((r) => {
      readyResolve = r
    })

    const queryFn: QueryFn = function (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const gen = (async function* () {
        const first = await inputIter.next()
        if (first.done) return
        yield mkAssistantToolUse('tool-1', 'Bash', { command: 'sleep 100' }) // 도구 실행 중
        await new Promise<void>((_resolve, reject) => {
          rejectRef = reject
          readyResolve?.()
        })
      })()
      ;(gen as unknown as Record<string, unknown>)['interrupt'] = async () => {
        const r = rejectRef
        rejectRef = null
        r?.(new Error('Claude Code process exited with code 143'))
      }
      return gen as AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '도구 작업' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await ready
    run.interrupt() // throw 경로 → catch가 done만 push 후 close
    await settle(() => dones(events).length >= 1)

    const observed = {
      doneCount: dones(events).length,
      hasError: events.some((e) => e.type === 'error'),
      autonomyEnded: autonomy(events).filter((e) => e.status === 'ended').length,
    }

    run.abort()
    await flushMicrotasks()
    await consume

    // throw 경로: done 1개(무origin), error 미표면화. 잔여 token으로 인한 phantom grace-ended 0.
    expect(observed).toEqual({ doneCount: 1, hasError: false, autonomyEnded: 0 })
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// 불변식 ⑤ — resume·신호 미수신 fallback에서 token 보존 (회귀 잠금)
// ══════════════════════════════════════════════════════════════════════════════════

describe('불변식 ⑤ — resume·미수신 fallback token 보존 (회귀 잠금, GREEN now)', () => {
  it('⑤a resume(resumeSessionId) 모드에서 push token이 정확히 완료(user)', async () => {
    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1') // user
      const second = await inputIter.next() // push B
      if (second.done) return
      yield mkResult('turn2') // user
      await inputIter.next() // park
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: 'resume 후속' }],
      persistent: true,
      resumeSessionId: 'resume-sess-abc',
    })

    const events: AgentEvent[] = []
    let pushed = false
    const consume = (async () => {
      for await (const e of run.events) {
        events.push(e)
        if (e.type === 'done' && !pushed) {
          pushed = true
          run.push('resume 후속 메시지')
        }
      }
    })()

    await settle(() => dones(events).length >= 2)
    const origins = doneOrigins(events)

    run.abort()
    await flushMicrotasks()
    await consume

    expect(origins).toEqual(['user', 'user'])
  })

  it('⑤b 신호 미수신(session_state 무방출) fallback에서 자율 턴이 무토큰·cron으로 보존', async () => {
    // session_state를 한 번도 방출하지 않는 세션 — 회계는 session_state 신호에 의존하지 않고
    // 순수 pending-token 원리로만 origin을 산출해야 한다(fallback 바이트 보존).
    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1') // user(초기 token 완료)
      yield mkResult('turn2') // 자율 continuation(무토큰) → cron
      yield mkResult('turn3') // 자율 continuation(무토큰) → cron
      await inputIter.next() // park
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '미수신 fallback' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await settle(() => dones(events).length >= 3)
    const origins = doneOrigins(events)

    run.abort()
    await flushMicrotasks()
    await consume

    expect(origins).toEqual(['user', 'cron', 'cron'])
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// 불변식 ⑥ — isReplay 메시지 제거가 token/epoch를 진행시키지 않음 (회귀 잠금)
// ══════════════════════════════════════════════════════════════════════════════════

describe('불변식 ⑥ — isReplay 제거가 token/epoch 비진행 (회귀 잠금, GREEN now)', () => {
  it('push(B) 이후 isReplay 메시지가 끼어들어도 B token을 소비하지 않고 done_B=user', async () => {
    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1') // user
      const second = await inputIter.next() // push B
      if (second.done) return
      yield mkReplayUser() // isReplay → [] (드롭): epoch/ token 비진행이어야 함
      yield mkResult('turn2') // done_B: B token 완료(user)
      await inputIter.next() // park
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'replay 회계' }], persistent: true })

    const events: AgentEvent[] = []
    let pushed = false
    const consume = (async () => {
      for await (const e of run.events) {
        events.push(e)
        if (e.type === 'done' && !pushed) {
          pushed = true
          run.push('replay 이후 사용자 메시지')
        }
      }
    })()

    await settle(() => dones(events).length >= 2)
    const observed = {
      origins: doneOrigins(events),
      // replay가 phantom done/token을 만들지 않았다(정확히 2개 done).
      doneCount: dones(events).length,
    }

    run.abort()
    await flushMicrotasks()
    await consume

    expect(observed).toEqual({ origins: ['user', 'user'], doneCount: 2 })
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// 불변식 ⑦ — 리스크1 흡수: done.origin(⑦a)·CronTracker loop(⑦b)·autonomous cap(⑦c)
//   plan-auditor 🟡#2 의무: compound 금지, 3개 독립 named 단정으로 분리.
// ══════════════════════════════════════════════════════════════════════════════════

// ── ⑦a: done.origin 원장 정합 (RED 예상) ─────────────────────────────────────────
describe('불변식 ⑦a — done.origin 원장이 인터리브 전 구간에서 실제 token 소속을 반영 (RED 예상)', () => {
  it('bootstrap(user)→자율 A(cron)→user B(user)→자율 C(cron) 원장 정합', async () => {
    const barrier = new Barrier()

    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('bootstrap') // user
      await barrier.checkpoint() // #1: 자율 A 도중 push('B')
      yield mkResult('A') // 안전 cron
      const second = await inputIter.next() // pull B
      if (second.done) return
      yield mkResult('B') // 안전 user(B token 완료)
      yield mkResult('C') // 자율 continuation(무토큰) → cron
      await barrier.checkpoint() // #2
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '원장 정합' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await barrier.waitForCheckpoint()
    await flushMicrotasks()
    run.push('B')
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()
    await barrier.waitForCheckpoint()
    await flushMicrotasks()

    const origins = doneOrigins(events)

    run.abort()
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()
    await consume

    expect(origins).toEqual(['user', 'cron', 'user', 'cron'])
  })
})

// ── ⑦b: CronTracker 턴종료 판정 미오염 (RED 예상) ────────────────────────────────
describe('불변식 ⑦b — 자율 턴 done이 CronTracker 턴종료(ScheduleWakeup 체인) 판정을 오염시키지 않음 (RED 예상)', () => {
  it('armed wakeup 후 자율 턴이 재예약 없이 종료 → pending push가 있어도 loops:[] 제거가 발화(사용자 인터리빙 오판 X)', async () => {
    const barrier = new Barrier()

    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      // 턴1(user): ScheduleWakeup arm → loops:[wakeup]
      yield mkWakeupToolUse('wk-1', 270, '모니터링 루프')
      yield mkWakeupToolResult('wk-1', 'Next wakeup scheduled (in 270s).')
      yield mkResult('turn1') // done_bootstrap: user, onTurnEnd(user) → 유지
      // 턴2(자율): 재예약 없음. 단, 이 자율 턴 도중 push(B)가 도착 → origin 오분류 유발.
      await barrier.checkpoint() // #1: push('B')
      yield mkAssistantText('모니터링 종료 판단', 'msg_stop')
      yield mkResult('turn2') // done_A: 안전 cron → onTurnEnd(cron) staleArmed → loops:[] ; 버그 user → 미제거
      await barrier.checkpoint() // #2: park (B는 pull하지 않음 — cleanup loops:[] 전 스냅샷)
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'wakeup 오염' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await barrier.waitForCheckpoint() // #1
    await flushMicrotasks()
    run.push('B')
    await flushMicrotasks()
    barrier.release() // → assistant, done_turn2, #2
    await flushMicrotasks()
    await barrier.waitForCheckpoint() // #2 (cleanup 전)
    await flushMicrotasks()

    const snapshot = loopsEvents(events)
    const observed = {
      armed: snapshot.filter((e) => e.loops.length > 0).length, // wakeup arm 스냅샷
      removed: snapshot.filter((e) => e.loops.length === 0).length, // 자율 턴 종료가 loops:[] 제거를 발화했는가
    }

    run.abort()
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()
    await consume

    // 안전: 자율 턴(cron)의 done이 staleArmed wakeup 슬롯을 제거 → loops:[] 1회. 버그: origin이
    // 'user'로 오분류돼 onTurnEnd(user)가 조기반환 → 제거 미발화(removed=0).
    expect(observed).toEqual({ armed: 1, removed: 1 })
  })
})

// ── ⑦c: 자율 cap 증감이 origin 기준으로 정확 (회귀 잠금) ──────────────────────────
describe('불변식 ⑦c — 자율 연속 턴 cap 증감이 origin(cron) 기준으로 정확 (회귀 잠금, GREEN now)', () => {
  it('MAX+1 연속 자율(cron) 턴 → 정확히 cap 경계에서 유계 종료 + ended(cap-reached)', async () => {
    const attempts = MAX_CONSECUTIVE_AUTONOMOUS_TURNS + 1
    let autonomousYields = 0
    const barrier = new Barrier()

    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('user-turn') // 초기 user 턴
      for (let i = 0; i < attempts; i++) {
        let closed = false
        const pull = inputIter.next()
        void pull.then((r) => {
          if (r.done) closed = true
        })
        await barrier.checkpoint()
        if (closed) return // cap 강제종료로 입력 스트림 닫힘
        autonomousYields++
        yield mkResult(`cron-${i}`) // 자율(무토큰) done → cron, cap 카운터 증가
      }
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '무인 연속 자율' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await driveCheckpoints(barrier, consume, attempts)
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    const cronDones = dones(events).filter((e) => e.origin === 'cron')
    const capEnded = autonomy(events).filter((e) => e.status === 'ended' && e.reason === 'cap-reached')

    // origin(cron) 기준 cap 증가 → MAX개까지만 완주(유계) + cap-reached 발화.
    expect(cronDones.length).toBeLessThanOrEqual(MAX_CONSECUTIVE_AUTONOMOUS_TURNS)
    expect(capEnded.length).toBeGreaterThanOrEqual(1)
    expect(autonomousYields).toBeLessThan(attempts)
    // 완주 자율 done은 전부 cron(무토큰) origin — 사용자 개입 없는 순수 자율.
    expect(cronDones.length).toBe(dones(events).filter((e) => e.origin !== 'user').length)
  })
})
