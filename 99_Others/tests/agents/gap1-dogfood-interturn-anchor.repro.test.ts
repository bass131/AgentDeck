/**
 * gap1-dogfood-interturn-anchor.repro.test.ts — dogfood 통주 실측 결함 재현 (RED, 보고용)
 *
 * ── 발견 경위(GAP1 마감 dogfood 라이브 통주, 2026-07-14) ─────────────────────────────
 * 실 SDK REPL 세션에서 **사용자 발화 턴의 응답에 '자율 발동'(cron) 배지가 오표시**됐다.
 * 스크린샷 증거: 01.Phases/17_GAP1-core-parity/ScreenShot/03-search-result-render.png
 * (SEARCH_DONE — 사용자 프롬프트 직후 응답인데 cron 배지) ·
 * 09-model-changed-followup-turn.png (MODEL_TURN_OK — 동일 증상, 별개 세션 재현 2/2).
 * 두 세션 모두 "그 세션의 두 번째 사용자 턴"에서 발생.
 *
 * ── 원인 추정(코드 실측) ──────────────────────────────────────────────────────────
 * `claudeAgentRun.ts` P11 ANCHOR(`_anchorTurnEpochStart()`)는 지속 펌프 for-await
 * **모든 원시 메시지** 진입 시 발화한다(1331행). 그런데 실 SDK 방출 순서는
 * running → result(done) → **idle**(fixture 실측: probe-2b-session-state-env.jsonl —
 * idle이 done *뒤* 별개 system msg로 도착)이다. 흐름:
 *   1. done_1 도착 → 턴 경계 통과(`_turnEpochAnchored=false`).
 *   2. **늦은 session_state:idle 도착 → 다음 turn epoch를 무토큰으로 선점 ANCHOR**
 *      (delivered 없음 → `_ownedSendSeq=null` = cron epoch 확정).
 *   3. 사용자 push(B) → queued→delivered. 그러나 epoch는 이미 앵커됨(멱등 가드 no-op).
 *   4. done_B → `_ownedSendSeq===null` → origin='cron' **오분류** + B token 미완료.
 * 파생(2차): done_B 뒤의 idle이 다음 epoch를 delivered(B)로 앵커 → B token이 "자율
 * epoch의 owned"로 좌초 → `_outstandingSendCount()`가 세션 유휴 상태에서 1로 잔존 →
 * **idle-close 게이트 영구 봉쇄**(P04b 취지 위반 — 아래 두 번째 케이스).
 * inter-turn 메시지는 idle만이 아니다 — bg 태스크(task_notification 등) 시스템 메시지도
 * 같은 창에서 도착하면 동일하게 epoch를 선점한다(dogfood ①~③ 구간과 정합).
 *
 * ── 담당 도메인 ──────────────────────────────────────────────────────────────────
 * agent-backend (`02.Source/main/01_agents/claudeAgentRun.ts` — ANCHOR가 "턴을 시작
 * 하는 메시지"가 아닌 모든 메시지에 반응). qa는 앱 소스 수정 X — 본 파일은 재현만.
 * 봉합 방향 판단은 Worker 몫(예: 턴-비귀속 system 메시지(session_state·task_*)는
 * ANCHOR/epoch 진행에서 제외 등 — 여기 단정은 공개 계약(done.origin·onSessionClosing)만).
 *
 * ── TDD 상태: RED (버그 재현 — 봉합 후 GREEN 전환) ─────────────────────────────────
 * 하네스는 gap1-p11-send-token-accounting.test.ts 동형(실 ClaudeCodeBackend + mock
 * QueryFn + Barrier + fake timer). 실 SDK 호출 0 · 시간/랜덤/네트워크 0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent, AgentEventDone } from '../../../02.Source/shared/agent-events'

/** 어떤 합리적 grace보다 큰 델타(유예 만료 close 검증 — p11 스위트 EXPIRE_MS 미러). */
const EXPIRE_MS = 10_000

// ── SDK 원시 메시지 픽스처 (gap1-p11 스위트 미러) ─────────────────────────────────

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

/** 실 SDK 순서 재현용 session_state_changed(system) — running→result→idle(늦은 idle). */
function ss(state: 'idle' | 'running' | 'requires_action') {
  return {
    type: 'system' as const,
    subtype: 'session_state_changed' as const,
    state,
    uuid: '387c0f11-6230-424c-9f7f-edefffd2df6f',
    session_id: '29c6123d-7baf-485b-a694-413dfcee6ddb',
  }
}

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

// ── 헬퍼 (p11 스위트 미러) ─────────────────────────────────────────────────────────

function dones(events: AgentEvent[]): AgentEventDone[] {
  return events.filter((e): e is AgentEventDone => e.type === 'done')
}
function doneOrigins(events: AgentEvent[]): Array<'user' | 'cron' | undefined> {
  return dones(events).map((e) => e.origin)
}

async function flushMicrotasks(times = 16): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

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
// 재현 1 — 늦은 idle(턴 경계 뒤 system msg)이 다음 사용자 턴 origin을 cron으로 오분류
// ══════════════════════════════════════════════════════════════════════════════════

describe('dogfood 재현 — inter-turn 늦은 idle의 turn epoch ANCHOR 선점 (RED 예상)', () => {
  it('running→result→idle(실측 순서) 후 push(B) → done_B는 user여야 한다(현행: cron 오분류)', async () => {
    const barrier = new Barrier()

    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const bootstrap = await inputIter.next()
      if (bootstrap.done) return
      // ── 턴 1(user): 실 SDK 순서 = running → result → idle(늦은 idle, done 뒤) ──
      yield ss('running')
      yield mkResult('turn1') // done_1: user(초기 token 완료)
      yield ss('idle') // ← 턴-비귀속 system msg — 다음 epoch를 선점 ANCHOR(버그 유발점)
      await barrier.checkpoint() // #1: test가 push('B')
      // ── 턴 2(user): B pull → running → 응답 → result ──
      const second = await inputIter.next()
      if (second.done) return
      yield ss('running')
      yield mkAssistantText('B 응답', 'msg_b')
      yield mkResult('B') // done_B: 안전=user(자기 token 완료), 버그=cron(오분류)
      await barrier.checkpoint() // #2: park
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '늦은 idle 재현' }], persistent: true })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await barrier.waitForCheckpoint() // #1 (turn1 + 늦은 idle 처리 후)
    await flushMicrotasks()
    run.push('B') // 사용자 발화 — B token 발급
    await flushMicrotasks()
    barrier.release() // → pull B → B 턴 스트림 → done_B → #2
    await flushMicrotasks()
    await barrier.waitForCheckpoint() // #2
    await flushMicrotasks()

    const origins = doneOrigins(events)

    run.abort()
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()
    await consume

    // 안전 기대값(봉합 후 GREEN): 두 턴 모두 사용자 발화 — ['user', 'user'].
    // 현행(RED): 늦은 idle이 epoch를 무토큰 선점 → done_B가 'cron'(자율 발동 배지 오표시,
    // 라이브 스크린샷 03·09 증상과 동일 메커니즘).
    expect(origins).toEqual(['user', 'user'])
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// 재현 2(파생) — 좌초된 send-token이 유휴 세션 idle-close를 영구 봉쇄
// ══════════════════════════════════════════════════════════════════════════════════

describe('dogfood 재현 — 좌초 token의 idle-close 영구 봉쇄 (RED 예상)', () => {
  it('B 턴 완료·최종 idle 후 유예 만료 → 세션이 idle-close 되어야 한다(현행: outstanding 1 잔존으로 미종료)', async () => {
    const barrier = new Barrier()
    let closeObserved = 0

    const queryFn: QueryFn = async function* (p) {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const bootstrap = await inputIter.next()
      if (bootstrap.done) return
      yield ss('running')
      yield mkResult('turn1')
      yield ss('idle') // 늦은 idle #1 — 다음 epoch 선점(재현 1과 동일)
      await barrier.checkpoint() // #1: push('B')
      const second = await inputIter.next()
      if (second.done) return
      yield ss('running')
      yield mkAssistantText('B 응답', 'msg_b')
      yield mkResult('B') // 버그 경로: B token 미완료(cron done)
      yield ss('idle') // 늦은 idle #2 — B token을 자율 epoch owned로 좌초시킴
      await barrier.checkpoint() // #2: 이후 무활동 — 유예 만료 idle-close 기대 지점
      // 안전 구현: 유예 만료 → input gen return → 자연 종료. 버그: 여기서 영원히 대기.
      await inputIter.next()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'idle-close 봉쇄 재현' }], persistent: true })
    run.onSessionClosing?.(() => {
      closeObserved++
    })

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await barrier.waitForCheckpoint() // #1
    await flushMicrotasks()
    run.push('B')
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()
    await barrier.waitForCheckpoint() // #2 (B 턴 + 최종 idle 처리 후)
    await flushMicrotasks()
    barrier.release() // 생성기 진행 → park(inputIter.next() 대기)
    await flushMicrotasks()

    // 무활동 상태에서 유예 만료를 충분히 지나도록 진행.
    await vi.advanceTimersByTimeAsync(EXPIRE_MS)
    await flushMicrotasks()

    const observed = { close: closeObserved, doneCount: dones(events).length }

    run.abort()
    await flushMicrotasks()
    await consume

    // 안전 기대값(봉합 후 GREEN): 모든 사용자 턴 token이 자기 done으로 완료 →
    // outstanding 0 → 유예 만료 시 idle-close commit 정확히 1회.
    // 현행(RED): done_B(cron)가 B token을 완료하지 못하고 늦은 idle #2가 그 token을
    // 자율 epoch owned로 좌초 → outstanding 1 영구 잔존 → close 0(좀비 세션).
    expect(observed).toEqual({ close: 1, doneCount: 2 })
  })
})
