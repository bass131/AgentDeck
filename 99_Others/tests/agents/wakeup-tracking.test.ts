/**
 * wakeup-tracking.test.ts — ScheduleWakeup(self-paced 루프) 추적 → `loops` 이벤트 통합 TDD
 *   (LR3 Phase 04)
 *
 * 배경(01.Phases/LR3-loop-ux/_probe-findings.md §(c)/(+)): interval 없는/self-paced
 * 자연어 루프 요청은 CronCreate가 아니라 ScheduleWakeup으로 돈다(2/3 실측) — CronTracker만
 * 있으면 GUI에 완전 비가시. 이 스위트는 ClaudeCodeBackend(+eventNormalizer+CronTracker)
 * 전 파이프라인을 SDK mock으로 통과시켜 `loops` 이벤트 정규화를 검증한다
 * (loop-tracking.test.ts/persistent-pump.test.ts 관례 미러).
 *
 * 실측 페이로드 형상(§(+), 2026-07-03):
 *   tool_call:   { type:'tool_call', id, name:'ScheduleWakeup',
 *                  input:{ delaySeconds, reason, prompt } }
 *   tool_result: { type:'tool_result', id, ok, output(사람용 문자열 — 파싱 비의존) }
 *
 * TDD 케이스(Phase 04 4경로):
 *  WT1 — 생성: tool_call→tool_result(ok) → loops 이벤트 1개(단발 경로).
 *  WT2 — 연쇄 갱신: persistent 2턴 연속 재예약 → 매 스냅샷 1항목 유지(추가 아님, 교체).
 *  WT3 — 종료: persistent 2턴째 재예약 없음 → 두 번째 done 직전 loops:[] 제거 emit.
 *  WT4 — abort: armed 상태에서 abort() → abortCleanup이 loops:[] 포함, crash/zombie 0.
 *
 * ADR-003 격리 확인: 'ScheduleWakeup' 리터럴은 이 mock(계약 검증) + progressTrackers.ts
 * 내부에만 — AgentBackend.ts/shared/renderer 무누출.
 *
 * 신뢰경계: 실 SDK 호출 0. mock QueryFn 내부에 SDK 메시지 형상.
 */
import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent, AgentEventLoops } from '../../../02.Source/shared/agent-events'

// ── mock 픽스처 헬퍼 ─────────────────────────────────────────────────────────

/** result(done) SDK 메시지 픽스처 (loop-tracking.test.ts/persistent-pump.test.ts 미러) */
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
 * ScheduleWakeup tool_use SDK 메시지 픽스처.
 * ADR-003: 'ScheduleWakeup' 리터럴은 어댑터 계약 검증용 mock 내부에만.
 */
function mkWakeupToolUse(toolUseId: string, delaySeconds: number, reason: string, prompt = '') {
  return {
    type: 'assistant' as const,
    message: {
      id: `msg_${toolUseId}`,
      type: 'message' as const,
      role: 'assistant' as const,
      content: [
        {
          type: 'tool_use',
          id: toolUseId,
          name: 'ScheduleWakeup',
          input: { delaySeconds, reason, prompt },
        }
      ],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: `uuid-asst-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

/** ScheduleWakeup tool_result SDK 메시지 픽스처. isError=true면 예약 실패(ok:false) 경로. */
function mkWakeupToolResult(toolUseId: string, content: string, isError = false) {
  return {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content,
          ...(isError ? { is_error: true } : {}),
        }
      ]
    },
    parent_tool_use_id: null,
    uuid: `uuid-user-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

/** 일반 text assistant 메시지 픽스처 (재예약 없이 응답만 하는 턴) */
function mkAssistant(text: string, msgId = 'msg_plain') {
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
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: `uuid-asst-${msgId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

/** events 전체 수집 헬퍼 */
async function collectEvents(backend: ClaudeCodeBackend, req: Parameters<typeof backend.start>[0]): Promise<AgentEvent[]> {
  const run = backend.start(req)
  const events: AgentEvent[] = []
  for await (const e of run.events) {
    events.push(e)
  }
  return events
}

// ── WT1: 생성 — tool_call→tool_result(ok) → loops 이벤트 1개 ─────────────────

describe('WT1 — ScheduleWakeup 생성 → loops 이벤트', () => {
  it('tool_use + tool_result(ok) 시퀀스 → loops 이벤트 1개, summary/interval 반영', async () => {
    const queryFn: QueryFn = async function* (_p) {
      yield mkWakeupToolUse('wk-1', 270, '사용자가 멈추라고 할 때까지 PING 반복 응답')
      yield mkWakeupToolResult('wk-1', 'Next wakeup scheduled for 09:02:00 (in 284s). Nothing more to do this turn.')
      yield mkResult('turn1')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const events = await collectEvents(backend, {
      messages: [{ role: 'user', content: "/loop 'PING'이라고만 답하기" }]
    })

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    expect(loopsEvents.length).toBeGreaterThanOrEqual(1)

    const lastLoops = loopsEvents[loopsEvents.length - 1]
    expect(lastLoops.loops).toHaveLength(1)
    expect(lastLoops.loops[0].summary).toBe('사용자가 멈추라고 할 때까지 PING 반복 응답')
    // interval: output 문자열 파싱 비의존 — input.delaySeconds 기반 사람표기
    expect(lastLoops.loops[0].interval).toMatch(/self-paced/)
  })

  it('ScheduleWakeup 예약 실패(ok=false) → loops 미방출(graceful, crash 0)', async () => {
    const queryFn: QueryFn = async function* (_p) {
      yield mkWakeupToolUse('wk-1', 270, '실패 케이스')
      yield mkWakeupToolResult('wk-1', 'error: could not schedule', true)
      yield mkResult('turn1')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    let threw = false
    let events: AgentEvent[] = []
    try {
      events = await collectEvents(backend, { messages: [{ role: 'user', content: '테스트' }] })
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    for (const le of loopsEvents) expect(le.loops.length).toBe(0)
  })
})

// ── WT2: 연쇄 갱신 — persistent 2턴, 매 스냅샷 1항목 유지(교체) ────────────────

describe('WT2 — 연쇄 갱신(재예약) — 배너 1개 유지', () => {
  it('턴1 예약 → 턴2(자율) 재예약 → loops 스냅샷 항상 1항목, summary는 최신으로 교체', async () => {
    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      // 턴1: 초기 user 메시지 소비 + 예약
      const first = await inputIter.next()
      if (first.done) return
      yield mkWakeupToolUse('wk-1', 270, 'A')
      yield mkWakeupToolResult('wk-1', 'Next wakeup scheduled (in 270s).')
      yield mkResult('turn1')

      // 턴2: push() 없이 자율 발동(wakeup 소비) — 재예약(체인 계속)
      yield mkWakeupToolUse('wk-2', 300, 'B')
      yield mkWakeupToolResult('wk-2', 'Next wakeup scheduled (in 300s).')
      yield mkResult('turn2')
      // generator 자연 종료 → for-await 끝 → 펌프 종료(session-end cleanup)
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '시작' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    // 매 스냅샷(빈 배열 제외) 1항목 — 추가 아니라 교체
    const nonEmptySnapshots = loopsEvents.filter(e => e.loops.length > 0)
    expect(nonEmptySnapshots.length).toBeGreaterThanOrEqual(2)
    for (const snap of nonEmptySnapshots) expect(snap.loops.length).toBe(1)

    expect(nonEmptySnapshots[0].loops[0].summary).toBe('A')
    expect(nonEmptySnapshots[nonEmptySnapshots.length - 1].loops[0].summary).toBe('B')

    // done 2회 완주(양쪽 턴 정상 처리 확인 — 회귀 가드)
    const dones = events.filter(e => e.type === 'done')
    expect(dones.length).toBe(2)
  })
})

// ── WT3: 종료 — 재예약 없으면 done 직전 loops:[] 제거 ─────────────────────────

describe('WT3 — 종료(재예약 부재) → loops에서 제거', () => {
  it('턴1 예약 → 턴2(자율) 재예약 없이 응답만 → 두 번째 done 직전 loops:[] emit', async () => {
    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkWakeupToolUse('wk-1', 270, 'A')
      yield mkWakeupToolResult('wk-1', 'Next wakeup scheduled (in 270s).')
      yield mkResult('turn1')

      // 턴2: 자율 발동했지만 ScheduleWakeup 재호출 없음(모니터링 종료 판단) — 응답만
      yield mkAssistant('더 이상 모니터링할 필요가 없어 보입니다. 종료합니다.')
      yield mkResult('turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '시작' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    const dones = events.filter(e => e.type === 'done')
    expect(dones.length).toBe(2)

    // 두 번째 done의 전체 events 배열 내 인덱스
    let doneCount = 0
    let secondDoneIdx = -1
    for (let i = 0; i < events.length; i++) {
      if (events[i].type === 'done') {
        doneCount++
        if (doneCount === 2) { secondDoneIdx = i; break }
      }
    }
    expect(secondDoneIdx).toBeGreaterThan(0)

    // 직전 이벤트가 loops:[] 제거 emit이어야 함(같은 턴 처리 배치 — 인접)
    const beforeSecondDone = events[secondDoneIdx - 1]
    expect(beforeSecondDone.type).toBe('loops')
    expect((beforeSecondDone as AgentEventLoops).loops).toEqual([])

    // 최종 스냅샷도 빈 배열(제거 상태 유지)
    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    const lastLoops = loopsEvents[loopsEvents.length - 1]
    expect(lastLoops.loops).toEqual([])
  })
})

// ── WT4: abort — armed 상태에서 abort() → loops:[] 정리(hasActivity 포함) ───────

describe('WT4 — abort 시 wakeup loops clear', () => {
  it('ScheduleWakeup armed 후 abort → 빈 loops 이벤트 emit, crash/zombie 0', async () => {
    let resolveHold!: () => void
    const holdPromise = new Promise<void>((r) => { resolveHold = r })

    const queryFn: QueryFn = async function* (_p) {
      yield mkWakeupToolUse('wk-ab', 270, '어보트 웨이크업')
      yield mkWakeupToolResult('wk-ab', 'Next wakeup scheduled (in 270s).')
      await holdPromise
      yield mkResult('turn1')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '어보트 테스트' }]
    })

    const events: AgentEvent[] = []
    let threw = false
    let sawArmedLoops = false

    try {
      // break하지 않고 계속 소비 — run.events는 단일 async generator라 break 시
      // Symbol.asyncIterator 프로토콜상 .return()이 호출돼 완전히 종료된다(재순회 불가).
      // abort()는 이 루프 안에서 동기 호출 → abortCleanup이 큐에 이미 push한 뒤
      // _close()되므로, 루프는 남은 큐를 자연 drain하고 정상 종료한다.
      for await (const e of run.events) {
        events.push(e)
        if (e.type === 'loops' && (e as AgentEventLoops).loops.length > 0 && !sawArmedLoops) {
          sawArmedLoops = true
          run.abort()
          resolveHold()
        }
      }
    } catch {
      threw = true
    }
    resolveHold()

    expect(threw).toBe(false)
    expect(sawArmedLoops).toBe(true)
    // abort 이후 빈 loops(정리) 이벤트가 최소 1개 있어야 함(abortCleanup의 hasActivity 포함 확인)
    const emptyLoopsAfter = events.filter(e => e.type === 'loops' && (e as AgentEventLoops).loops.length === 0)
    expect(emptyLoopsAfter.length).toBeGreaterThanOrEqual(1)
    // abort 후 멱등
    expect(() => run.abort()).not.toThrow()
  })
})
