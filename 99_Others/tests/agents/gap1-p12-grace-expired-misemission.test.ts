/**
 * gap1-p12-grace-expired-misemission.test.ts — stream throw 시 grace-expired 오방출 봉합
 * (GAP1 P12 (c) — TDD RED 선행) + P11 reviewer 🟡 후속 동봉 2건 핀(영호 결정 2026-07-14)
 *
 * ── (c) 버그(Codex triage Low 동봉) ─────────────────────────────────────────────────
 * 지속세션 펌프 finally(claudeAgentRun.ts:1278-1293)는 "grace 유예 대기 중에 펌프가 끝나면
 * grace-expired와 동일 의미"로 간주해 `autonomy_status {status:'ended', reason:'grace-expired'}`
 * 를 push한다. 그런데 이 판정이 **종료 사유를 구분하지 않는다** — 스트림이 *throw*로 끝나도
 * (catch가 error+done을 이미 방출) grace 타이머가 잔존해 있기만 하면 grace-expired를 얹는다.
 * 계약상 grace-expired는 "자연종료(무활동 유예 만료)" 의미(agent-events.ts, LR4 P03)인데,
 * 에러 사망에 자연종료 신호가 함께 나가는 오방출이다. 봉합: throw 경로는 error/done만.
 *
 * ── 스위트 구성 (현행 기준 RED/GREEN) ────────────────────────────────────────────────
 *  §1 B-1  grace pending 중 stream throw → grace-expired **0**       — 현행 RED(1 방출)
 *  §2 B-2  grace pending 중 스트림 자연종료 → grace-expired **1** 보존 — 현행 GREEN(회귀 핀)
 *          ⚠️ companion 판별력: "순진한 finally 방출 전면 제거"(과억제)를 이 핀이 RED로
 *          잡는다 — Phase (c) 수용조건이 명시 요구. LR4 P03 정당 거동(자연종료=grace-expired)
 *          을 지키면서 throw만 예외 처리해야 둘 다 GREEN.
 *  §3 C-1  grace-active 게이트 origin 핀(claudeAgentRun.ts:1111-1117)   — 현행 GREEN(거동 보존 핀)
 *          (i) 무토큰 epoch(자율 continuation) 흡수 → active **정확히 1회**.
 *              기존 스위트는 전부 `>=1`(lr4-p03 계약1·계약4, gap1-p04b S6·실순서+continuation)
 *              — "정확히 1회"(창당 dedup, `_autonomyActiveEmitted`) 핀은 부재해 여기서 보강.
 *          (ii) user-owned epoch(push send-token 발급 턴의 응답) → active **0**.
 *              기존 핀 실재: lr4-p03-idle-grace.test.ts 계약5
 *              ("사용자 push continuation은 spurious active를 방출하지 않는다", active===0)
 *              — 중복 작성하지 않는다(본 파일 미포함, 보고에 명기).
 *  §4 C-2  `?? null` desync dev-assert 핀(claudeAgentRun.ts:992)        — 현행 RED(warn 부재)
 *          `_inputQueue`/`_queuedSendSeqs` desync(공개 API로 도달 불가한 불변식 위반)를
 *          테스트 한정 private 주입으로 만들고, user 메시지 pull 시 console.warn 1회
 *          (프리픽스 '[agents]' + 'desync' 포함) + 크래시 없음(기존 `?? null` 폴백 =
 *          token-less 전달로 계속 진행) 단정. 구현 계약은 agent-backend Worker에 동일 전달.
 *
 * ── 결정론 ─────────────────────────────────────────────────────────────────────────
 * fake timer + 비중첩 Barrier(lr4-p03 GraceProbe 관례). §1·§2·§4는 타이머 advance 불필요
 * (grace는 스케줄만 되고 finally/취소로 정리), §3만 GRACE_PROBE_MS/EXPIRE_MS 순차 advance.
 * 실 SDK 호출 0 · wall-clock 의존 0.
 *
 * ⚠️ 테스트만 작성한다 — 02.Source/** R only(미변경). qa 영역.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type {
  AgentEvent,
  AgentEventDone,
  AgentEventAutonomyStatus,
} from '../../../02.Source/shared/agent-events'

// ── 상수 (lr4-p03 관례: 정확한 grace 값에 결속하지 않는 델타) ─────────────────────────

/** grace(≈3000)보다 확실히 작은 probe 델타 — 유예 창 안 continuation 흡수 재현. */
const GRACE_PROBE_MS = 100

/** 어떤 합리적 grace보다 큰 델타 — 잔여 유예 만료 마무리. */
const EXPIRE_MS = 10_000

// ── 픽스처 (lr4-p03/gap1-p11 관례 미러) ─────────────────────────────────────────────

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
    session_id: 'sess-p12c',
  }
}

// ── 이벤트 헬퍼 ────────────────────────────────────────────────────────────────────

type AgentEventError = Extract<AgentEvent, { type: 'error' }>

function dones(events: AgentEvent[]): AgentEventDone[] {
  return events.filter((e): e is AgentEventDone => e.type === 'done')
}
function errorsIn(events: AgentEvent[]): AgentEventError[] {
  return events.filter((e): e is AgentEventError => e.type === 'error')
}
function autonomy(events: AgentEvent[]): AgentEventAutonomyStatus[] {
  return events.filter((e): e is AgentEventAutonomyStatus => e.type === 'autonomy_status')
}
function graceExpired(events: AgentEvent[]): AgentEventAutonomyStatus[] {
  return autonomy(events).filter((e) => e.status === 'ended' && e.reason === 'grace-expired')
}

/** fake timer 하에서 microtask만 순차 flush(타이머 무접촉). */
async function flushMicrotasks(times = 32): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

// ── Barrier: 비중첩 랑데부 (lr4-p03 GraceProbe 동형) ─────────────────────────────────

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
  vi.restoreAllMocks()
})

// ══════════════════════════════════════════════════════════════════════════════════
// §1 B-1 — grace pending 중 stream throw → grace-expired 0 (현행 RED)
// ══════════════════════════════════════════════════════════════════════════════════
//
// 시나리오: turn1 done 경계에서 grace가 예약된 직후(무활동·게이트 열림) 엔진 스트림이 throw.
// 펌프 catch가 error+done을 방출하고, 현행 finally는 `gracePendingAtExit`(타이머 잔존)만 보고
// grace-expired를 얹는다 — 에러 사망에 자연종료 신호가 함께 나가는 오방출. 봉합 후에는
// throw 경로에서 error/done만 나가고 grace-expired는 0이어야 한다.
//
// 결정론 트레이스(타이머 advance 불필요): 펌프가 result(turn1) 처리를 끝내는 그 iteration
// 안에서 grace를 예약하고, *다음* pull에서 제너레이터가 동기 throw한다 — 예약과 throw 사이에
// 타이머가 낄 시간 자체가 없다(fake timer 미진행 → 만료 콜백 경로 개입 0, finally 경로 단독).

describe('§1 B-1 — grace pending 중 stream throw: error/done만, grace-expired 오방출 0 (현행 RED)', () => {
  it('turn1 done(grace 예약) 직후 스트림 throw → error 1 · done 2 · grace-expired 0', async () => {
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1') // done 경계: 무활동·게이트 열림 → grace 예약
      // grace 유예가 pending인 상태에서 엔진 스트림이 죽는다(throw 경로).
      throw new Error('SDK stream failure (P12 c fixture)')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: 'throw 경로 오방출 재현' }],
      persistent: true,
    })

    // run.events 직접 소비 — RunManager 소비 IIFE는 error에서 break해 이후 이벤트(done·
    // autonomy_status)를 관찰할 수 없으므로, 오방출의 정확한 관찰면은 어댑터 스트림 자체다.
    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    const observed = {
      // 시나리오 유효성: turn1 done(user) + catch의 error+bare done.
      doneCount: dones(events).length, // 2 (turn1 + throw-done)
      firstDoneOrigin: dones(events)[0]?.origin, // 'user' (초기 send-token 완료)
      errorCount: errorsIn(events).length, // 1 (catch 경로 error)
      errorMentionsCause: errorsIn(events)[0]?.message.includes('SDK stream failure') === true,
      // 핵심(RED): throw 경로에서 grace-expired는 0이어야 한다. 현행 finally가 1개 방출 → RED.
      graceExpiredCount: graceExpired(events).length,
    }

    expect(observed).toEqual({
      doneCount: 2,
      firstDoneOrigin: 'user',
      errorCount: 1,
      errorMentionsCause: true,
      graceExpiredCount: 0,
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// §2 B-2 — companion 회귀 핀: grace pending 중 자연종료 → grace-expired 1 보존 (현행 GREEN)
// ══════════════════════════════════════════════════════════════════════════════════
//
// LR4 P03 정당 거동: grace 유예 대기 중 엔진 스트림이 (throw 아닌) *자연종료*하면 "더 이상
// continuation이 오지 않는다"가 확정 — finally가 grace-expired 1개를 방출한다(타이머 실만료를
// 기다릴 대상이 없음). 이 핀의 판별력: (c) 봉합을 "finally 방출 전면 제거"로 구현(과억제)하면
// 이 단정이 RED로 갈린다 — throw *사유만* 구분해 억제해야 §1·§2가 동시에 GREEN.

describe('§2 B-2 — companion: grace pending 중 스트림 자연종료 → grace-expired 1 보존 (GREEN 핀)', () => {
  it('turn1 done(grace 예약) 직후 스트림 자연종료(return) → grace-expired 정확히 1 · error 0', async () => {
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1') // done 경계: grace 예약
      // throw 아님 — 엔진이 입력 스트림 상태와 무관하게 스스로 자연종료(finally 주석의 실측 경로).
      return
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '자연종료 companion' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    const observed = {
      doneCount: dones(events).length, // 1 (turn1만 — 자연종료는 추가 done 없음)
      firstDoneOrigin: dones(events)[0]?.origin, // 'user'
      errorCount: errorsIn(events).length, // 0 (자연종료 — 에러 아님)
      // 핵심(GREEN 핀): 자연종료 시 grace-expired는 정확히 1(finally 경로, 이중 방출도 금지).
      graceExpiredCount: graceExpired(events).length,
    }

    expect(observed).toEqual({
      doneCount: 1,
      firstDoneOrigin: 'user',
      errorCount: 0,
      graceExpiredCount: 1,
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// §3 C-1(i) — grace-active 게이트 origin 핀: 무토큰 epoch 흡수 → active 정확히 1회 (GREEN)
// ══════════════════════════════════════════════════════════════════════════════════
//
// claudeAgentRun.ts:1111-1117 — grace pending 중 새 msg 도착 시 `_ownedSendSeq===null`(무토큰
// epoch = 자율 continuation)이고 창당 미방출(`!_autonomyActiveEmitted`)일 때만 active를 낸다.
// 기존 스위트는 전부 `active >= 1`만 고정(lr4-p03 계약1:256·계약4:495, gap1-p04b S6:533·
// 실순서+continuation:684) — "**정확히 1회**"(같은 흡수 사이클 중복 억제) 핀이 없어 보강한다.
// user-owned epoch → active 0 쪽 핀은 lr4-p03 계약5(:589)가 실재 — 중복 작성하지 않는다.
//
// 거동 보존 핀: 구현이 origin 스냅샷 기반으로 리팩토링돼도(P11 후속) 이 거동은 불변이어야
// 한다. 현행 GREEN 예상 — P12 (b)(c) 봉합 범위(error abort 배선·throw finally)와 무관.
//
// 시나리오(lr4-p03 계약1 동형 + 정확 계수): turn1(user) done → grace 예약 → 유예 창 안에
// 자율 continuation(turn2, 단일 result msg) 도착 → 흡수(active 1회) → turn2 done(cron) 경계가
// grace 재예약 → 제너레이터 자연종료. 같은 흐름에서 active가 2개 이상이면 dedup 회귀.

describe('§3 C-1(i) — 무토큰 epoch 자율 continuation 흡수: active 정확히 1회 (거동 보존 핀, GREEN)', () => {
  it('turn1 done → grace 창 안 자율 turn2 흡수 → active === 1 · turn2 origin cron', async () => {
    const barrier = new Barrier()
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1') // user origin → done 경계에서 grace 예약

      // 자율 continuation — 입력 pull을 비차단 캡처(park), checkpoint로 테스트와 랑데부.
      let closed = false
      const pull = inputIter.next()
      void pull.then((r) => {
        if (r.done) closed = true
      })
      await barrier.checkpoint()
      if (closed) return
      // 단일 result msg의 무토큰 epoch — 흡수 시 active는 이 창에서 정확히 1회여야 한다.
      yield mkResult('turn2')
      // 이후 continuation 없음 — turn2 done 경계가 재예약한 grace는 자연종료 finally가 정리.
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '자율 진행 origin 핀' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    // 비중첩 clock 진행(lr4-p03 관례): checkpoint 도달 대기 → GRACE_PROBE_MS(<grace)만 진행
    // → release(흡수 재현). 이후 잔여 유예/finally 정리를 EXPIRE_MS 1회로 마무리.
    await barrier.waitForCheckpoint()
    await vi.advanceTimersByTimeAsync(GRACE_PROBE_MS)
    await Promise.resolve()
    barrier.release()
    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await consume

    const actives = autonomy(events).filter((e) => e.status === 'active')
    const observed = {
      doneOrigins: dones(events).map((e) => e.origin), // ['user','cron'] — 시나리오 유효성
      // 핵심 핀: 같은 흡수 사이클에서 active는 정확히 1회(창당 dedup). 0이면 게이트 과억제,
      // 2+면 dedup 회귀 — 양방향 판별.
      activeCount: actives.length,
      errorCount: errorsIn(events).length, // 0 — 자연 진행
    }

    expect(observed).toEqual({
      doneOrigins: ['user', 'cron'],
      activeCount: 1,
      errorCount: 0,
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// §4 C-2 — `?? null` desync dev-assert 핀 (claudeAgentRun.ts:992) — 현행 RED(warn 부재)
// ══════════════════════════════════════════════════════════════════════════════════
//
// `_inputQueue`(내용)와 `_queuedSendSeqs`(send-token seq)는 인덱스 1:1 동기 불변식(GAP1 P11).
// 공개 API(push/초기 적재)로는 desync에 도달할 수 없으므로, 불변식 위반을 테스트 한정 private
// 주입(`as unknown as` 캐스트 — Phase 지시로 허용된 유일한 private 접근)으로 만든다.
//
// 구현 계약(agent-backend Worker에 동일 전달): user 메시지 pull 시 seq FIFO가 비어
// `?? null` 폴백이 발동하면 —
//   (1) `console.warn` 정확히 1회: 프리픽스 '[agents]' + 'desync' 포함 문자열(관찰가능성).
//   (2) 크래시 없음: 기존 `?? null` 폴백 거동 유지 = token-less 전달로 계속 진행
//       (메시지는 SDK에 전달되고, 그 epoch는 무토큰 → done origin 'cron').
// 현행은 warn이 없어 (1)이 RED. (2)는 현행도 GREEN — 폴백 자체를 바꾸지 말라는 보존 핀.

describe("§4 C-2 — _inputQueue/_queuedSendSeqs desync 주입: console.warn('[agents]…desync…') 1회 + 폴백 유지 (warn 현행 RED)", () => {
  it('desync 상태에서 user 메시지 pull → [agents] desync warn 1회 · 메시지는 token-less로 전달 · 크래시 없음', async () => {
    const barrier = new Barrier()
    const received: unknown[] = []

    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      // 첫 입력 pull *전에* 테스트가 desync를 주입할 수 있도록 랑데부.
      await barrier.checkpoint()
      const first = await inputIter.next() // ← 이 pull 시점에 seq FIFO가 비어 있다(desync)
      if (first.done) return
      received.push(first.value)
      yield mkResult('desync-turn')
      // 자연종료 — grace 잔존은 finally가 정리(§2에서 핀한 정당 거동, 본 케이스 관심사 아님).
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: 'desync 시나리오 입력' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()
    await barrier.waitForCheckpoint()

    // ── desync 주입(테스트 한정 private 접근 — 공개 API로 도달 불가한 불변식 위반) ──────
    const internals = run as unknown as { _inputQueue: string[]; _queuedSendSeqs: number[] }
    // 픽스처 전제 확인: 초기 적재가 두 배열에 1:1로 들어가 있어야 주입이 유효하다.
    // (전제가 깨지면 구현 구조 변화 — 이 테스트를 새 구조에 맞게 갱신할 것.)
    expect(internals._inputQueue.length).toBe(1)
    expect(internals._queuedSendSeqs.length).toBe(1)
    internals._queuedSendSeqs.length = 0 // 내용은 있는데 seq가 없다 — `?? null` 폴백 경로 강제

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    barrier.release() // → queryFn이 첫 입력을 pull → _inputGen의 seq shift가 undefined ?? null
    await flushMicrotasks()
    await consume // 자연종료 정착(펌프 finally → close)

    const desyncWarns = warnSpy.mock.calls.filter((args) => {
      const joined = args.map((a) => String(a)).join(' ')
      return joined.includes('[agents]') && joined.includes('desync')
    })

    const observed = {
      // 핵심(RED): desync 관찰 시 dev-assert warn 정확히 1회. 현행은 조용히 `?? null`만 → 0.
      desyncWarnCount: desyncWarns.length,
      // 폴백 보존(GREEN 핀): 메시지는 여전히 SDK에 전달된다(크래시·유실 없음).
      deliveredCount: received.length,
      deliveredContainsInput: JSON.stringify(received[0] ?? null).includes('desync 시나리오 입력'),
      // token-less epoch → done origin 'cron'(폴백 거동 그대로 — 승격 재발명 금지).
      doneOrigins: dones(events).map((e) => e.origin),
      errorCount: errorsIn(events).length, // 0 — 크래시 없음
    }

    expect(observed).toEqual({
      desyncWarnCount: 1,
      deliveredCount: 1,
      deliveredContainsInput: true,
      doneOrigins: ['cron'],
      errorCount: 0,
    })
  })
})
