/**
 * bf3-p04-interleave-banner.test.ts — BF3-backlog-sweep Phase 04 TDD(인터리빙 배너 오판 수리).
 *
 * 배경(01.Phases/BF3-backlog-sweep/04-interleave-banner.md, LR3-P04 reviewer 🟡-① 원 기록):
 *   self-paced 루프(ScheduleWakeup) armed 상태에서 사용자 턴이 인터리빙되면, 그 사용자 턴의
 *   done에서 CronTracker.onTurnEnd()가 "이번 턴에 재예약 없음"을 "체인 종료"로 오판해 배너를
 *   조기 제거한다(재예약 시 self-heal — 관찰자에겐 깜빡임 버그).
 *
 * 원인 실측(RED 이전 확정, file:line):
 *   - progressTrackers.ts:352-359(수리 전) CronTracker.onTurnEnd() — 턴의 origin(user/cron)을
 *     전혀 모른 채 무조건 `staleArmed = has(WAKEUP_LOOP_ID) && !_wakeupArmedThisTurn` 평가.
 *   - eventNormalizer.ts:251(수리 전) — RunEventNormalizer.process()가 'done' 이벤트 감지 시
 *     origin 구분 없이 onTurnEnd()를 무조건 호출.
 *   - claudeAgentRun.ts:690(수리 전) — origin(user/cron) 판정 자체는 존재했지만 *process()
 *     반환 이후* 캐리어(펌프)에서 계산됨 — onTurnEnd()가 실제로 실행되는 시점(process() 내부,
 *     done 감지 즉시)엔 이 origin 정보가 아예 전달되지 않았다.
 *   재현: 루프 armed(자율 continuation, origin='cron') → 사용자 턴 인터리빙(origin='user',
 *   재예약 없이 응답만) → 그 턴의 done에서 armed wakeup 슬롯이 소거된다(배너 사라짐).
 *
 * 수리 설계: `onTurnEnd(origin)` / `process(msg, turnOrigin)`에 origin 매개변수 추가
 *   (기본값 'cron' — 인자 없는 기존 호출부·테스트 100% 하위호환). origin==='user'인 턴은
 *   staleArmed 판정 자체를 건너뛴다(사용자에게 응답하는 턴은 애초에 재예약할 이유가 없으므로
 *   "재예약 없음=체인 종료"라는 추론이 성립하지 않는다). origin==='cron'(자율 continuation)
 *   턴만 기존 판정을 그대로 적용 — 반대 버그(재예약 없는 wakeup이 영구 잔존, LR2-03 크론
 *   배너 영구 잔존의 재림)를 차단한다.
 *
 * 3계층 검증(단위 → 배선 → 파이프라인 통합):
 *   ① CronTracker.onTurnEnd(origin) 직접 계약 — 가장 빠르고 정밀한 RED/GREEN 신호.
 *   ② RunEventNormalizer.process(msg, turnOrigin) 배선 — eventNormalizer 연결점 + hasLoopActivity().
 *   ③ ClaudeCodeBackend 지속세션 파이프라인 — claudeAgentRun.ts의 실제 origin 판정
 *      (_pendingSends 기반) → normalizer.process() 전달까지 전 배선을 mock SDK로 end-to-end 재현.
 *
 * WAKEUP_LOOP_ID 싱글턴 구조는 diff 0(범위 밖 — 영호 결정 2026-07-03, 다중 동시 self-paced
 * 루프 미지원은 의도된 트레이드오프로 유지).
 *
 * 신뢰경계: 실 SDK 호출 0. mock QueryFn 내부에만 SDK 메시지 형상(ADR-003).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { RunEventNormalizer } from '../../../02.Source/main/01_agents/eventNormalizer'
import { CronTracker } from '../../../02.Source/main/01_agents/progressTrackers'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent, AgentEventLoops, AgentEventDone } from '../../../02.Source/shared/agent-events'

// ── ① CronTracker.onTurnEnd(origin) — 직접 계층 ──────────────────────────────

describe('CronTracker.onTurnEnd(origin) — 인터리빙 게이팅 (직접 계층)', () => {
  it('[BF3-P04 RED였던 시나리오] origin=user 턴(재예약 없음)은 armed wakeup을 소거하지 않는다', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', { delaySeconds: 270, reason: 'A' })
    c.resolveWakeupPending('id1', true)
    // 방금 예약한 턴 자신의 종료(cron 기준 — armedThisTurn=true라 어차피 유지)
    expect(c.onTurnEnd('cron')).toEqual([])
    expect(c.hasActiveLoops()).toBe(true)

    // 인터리빙: 사용자 턴 도착, 재예약 없이 응답만 하고 종료
    const events = c.onTurnEnd('user')
    expect(events).toEqual([])             // 소거 이벤트 없음 — 배너 유지(수리 대상)
    expect(c.hasActiveLoops()).toBe(true)  // 슬롯 보존
  })

  it('양방향 단언 (ii) — 인터리빙 이후 실제 cron 턴에서 재예약 없으면 여전히 정상 소거된다', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', { delaySeconds: 270, reason: 'A' })
    c.resolveWakeupPending('id1', true)
    c.onTurnEnd('cron')       // 방금 예약 → 유지
    c.onTurnEnd('user')       // 인터리빙 → 유지(수리 대상, 위 테스트와 동일 전제)

    // 진짜 wakeup 발동(cron) 턴에서 재예약을 하지 않음 → 체인 종료
    const events = c.onTurnEnd('cron')
    expect(events.length).toBe(1)
    expect((events[0] as { loops: unknown[] }).loops).toEqual([])
    expect(c.hasActiveLoops()).toBe(false) // 반대 버그(영구 잔존) 없음
  })

  it('연속 사용자 인터리빙 여러 번에도 슬롯이 계속 보존된다(1회 인터리빙 한정 아님)', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', { delaySeconds: 270, reason: 'A' })
    c.resolveWakeupPending('id1', true)
    c.onTurnEnd('cron')
    expect(c.onTurnEnd('user')).toEqual([])
    expect(c.onTurnEnd('user')).toEqual([])
    expect(c.onTurnEnd('user')).toEqual([])
    expect(c.hasActiveLoops()).toBe(true)
  })

  it('인터리빙 턴 자체가 재예약(ScheduleWakeup 재호출)하면 그 예약도 정상 반영된다', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', { delaySeconds: 270, reason: 'A' })
    c.resolveWakeupPending('id1', true)
    c.onTurnEnd('cron')

    // 사용자 턴이지만 이번엔 사용자 요청으로 재스케줄(예: "10분 뒤에 다시 확인해줘")
    c.recordWakeupPending('id2', { delaySeconds: 600, reason: 'B(사용자 요청 재조정)' })
    const resolveEvents = c.resolveWakeupPending('id2', true)
    expect((resolveEvents[0] as { loops: { summary: string }[] }).loops[0].summary).toBe('B(사용자 요청 재조정)')

    // 이 사용자 턴 종료 — origin=user라 staleArmed 평가 자체를 안 하므로 무조건 유지
    expect(c.onTurnEnd('user')).toEqual([])
    expect(c.hasActiveLoops()).toBe(true)
  })

  it('origin 인자 생략(기본값) — 기존 21건 하위호환: 무조건 cron 취급(기존 거동 그대로)', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', { delaySeconds: 270, reason: 'A' })
    c.resolveWakeupPending('id1', true)
    c.onTurnEnd()                  // 인자 없음 → 'cron' 취급, 방금 예약했으므로 유지
    expect(c.hasActiveLoops()).toBe(true)
    const events = c.onTurnEnd()   // 인자 없음, 재예약 없음 → 소거(기존 거동 그대로)
    expect(events.length).toBe(1)
    expect(c.hasActiveLoops()).toBe(false)
  })

  it('애초에 armed wakeup 없는 상태에서 origin=user 종료 → 무변화(no-op)', () => {
    const c = new CronTracker()
    expect(c.onTurnEnd('user')).toEqual([])
    expect(c.onTurnEnd('cron')).toEqual([])
  })
})

// ── ② RunEventNormalizer.process(msg, turnOrigin) — 배선 계층 ─────────────────

function assistantMsg(contents: unknown[]) {
  return { type: 'assistant', message: { role: 'assistant', content: contents } }
}
function userMsg(contents: unknown[]) {
  return { type: 'user', message: { role: 'user', content: contents } }
}
function toolUse(id: string, name: string, input: unknown) {
  return { type: 'tool_use', id, name, input }
}
function toolResult(id: string, content: unknown[], isError = false) {
  return { type: 'tool_result', tool_use_id: id, content, ...(isError ? { is_error: true } : {}) }
}
function resultMsg(isError = false) {
  return {
    type: 'result',
    subtype: isError ? 'error_during_execution' : 'success',
    is_error: isError,
    usage: { input_tokens: 10, output_tokens: 5 },
  }
}

describe('RunEventNormalizer.process(msg, turnOrigin) — eventNormalizer 배선', () => {
  let norm: RunEventNormalizer
  beforeEach(() => { norm = new RunEventNormalizer('r-test') })

  function armWakeup(id: string, summary: string) {
    norm.process(assistantMsg([toolUse(id, 'ScheduleWakeup', { delaySeconds: 270, reason: summary })]), 'cron')
    norm.process(userMsg([toolResult(id, [])]), 'cron')
  }

  it('인터리빙 origin=user done → loops 소거 이벤트 없음 + hasLoopActivity() true 유지(양방향 iii)', () => {
    armWakeup('wk-1', 'A')
    norm.process(resultMsg(), 'cron')  // 방금 예약한 턴 자신의 종료

    const r = norm.process(resultMsg(), 'user')  // 인터리빙 — 재예약 없이 응답만
    const loopsEvt = r.events.find(e => e.type === 'loops')
    expect(loopsEvt).toBeUndefined()              // 소거 이벤트 미방출(BF3 수리 대상)
    // idle-close 신호원 — 인터리빙 중 조기 강등 오판이 없어야 한다(P02/P03 지대 교차확인).
    expect(norm.hasLoopActivity()).toBe(true)
  })

  it('양방향 — 실제 cron 턴에서 재예약 없으면 loops:[] 소거 + hasLoopActivity() false(좀비 없음)', () => {
    armWakeup('wk-1', 'A')
    norm.process(resultMsg(), 'cron')
    norm.process(resultMsg(), 'user')  // 인터리빙, 유지

    const r = norm.process(resultMsg(), 'cron')  // 진짜 wakeup 발동, 재예약 없음 → 체인 종료
    const loopsEvt = r.events.find(e => e.type === 'loops') as AgentEventLoops | undefined
    expect(loopsEvt).toBeDefined()
    expect(loopsEvt!.loops).toEqual([])
    expect(norm.hasLoopActivity()).toBe(false)   // 루프 종료 후 좀비(활동 오판) 없음
  })

  it('origin 인자 생략 시 기존 process(msg) 호출부 하위호환(기본 cron 취급)', () => {
    armWakeup('wk-1', 'A')
    norm.process(resultMsg())  // origin 생략 — 방금 예약한 턴 자신의 종료(cron 취급, 유지)
    const r = norm.process(resultMsg())  // 인자 없이 재호출 — 재예약 없으므로 기존처럼 소거
    const loopsEvt = r.events.find(e => e.type === 'loops') as AgentEventLoops | undefined
    expect(loopsEvt).toBeDefined()
    expect(loopsEvt!.loops).toEqual([])
  })
})

// ── ③ ClaudeCodeBackend 지속세션 파이프라인 — 실제 인터리빙 end-to-end 재현 ────────

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

function mkWakeupToolUse(toolUseId: string, delaySeconds: number, reason: string) {
  return {
    type: 'assistant' as const,
    message: {
      id: `msg_${toolUseId}`,
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'tool_use', id: toolUseId, name: 'ScheduleWakeup', input: { delaySeconds, reason, prompt: '' } }],
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

function mkWakeupToolResult(toolUseId: string, content: string) {
  return {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content }]
    },
    parent_tool_use_id: null,
    uuid: `uuid-user-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

function mkAssistant(text: string, msgId: string) {
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

describe('BF3-P04 파이프라인 통합 — ClaudeCodeBackend 지속세션 인터리빙 재현', () => {
  it('턴1 예약 → 턴2(cron 재예약, 체인 확립) → 턴3(사용자 인터리빙, 재예약 없음) → 턴4(cron, 재예약 없음=진짜 종료)', async () => {
    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      // 턴1(origin=user, 초기 메시지): 루프 시작 — wakeup 예약
      const first = await inputIter.next()
      if (first.done) return
      yield mkWakeupToolUse('wk-1', 270, 'A')
      yield mkWakeupToolResult('wk-1', 'Next wakeup scheduled (in 270s).')
      yield mkResult('turn1')

      // 턴2(origin=cron, 자율 continuation): 재예약 — 체인 확립(push 없음, pull 안 함)
      yield mkWakeupToolUse('wk-2', 270, 'B')
      yield mkWakeupToolResult('wk-2', 'Next wakeup scheduled (in 270s).')
      yield mkResult('turn2')

      // 턴3(origin=user, 인터리빙): 사용자 push 소비 — 응답만(재예약 없음)
      const third = await inputIter.next()
      if (third.done) return
      yield mkAssistant('네, 확인했습니다', 'msg_interleave')
      yield mkResult('turn3')

      // 턴4(origin=cron, 자율 continuation): 재예약 없음 → 체인 진짜 종료(push 없음, pull 안 함)
      yield mkAssistant('더 이상 모니터링할 필요 없어 보입니다. 종료합니다.', 'msg_end')
      yield mkResult('turn4')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '루프 시작' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    let doneCount = 0
    let pushedInterleave = false

    for await (const e of run.events) {
      events.push(e)
      if (e.type === 'done') {
        doneCount++
        // 턴2(자율 continuation으로 체인이 확립된 직후) done을 본 시점에 사용자 인터리빙 발생
        if (doneCount === 2 && !pushedInterleave) {
          pushedInterleave = true
          run.push('중간에 끼어든 사용자 메시지')
        }
      }
    }

    const dones = events.filter((e): e is AgentEventDone => e.type === 'done')
    expect(dones.length).toBe(4)
    // 배선 검증: claudeAgentRun.ts의 실제 origin 판정(_pendingSends 기반)이 기대대로 나온다
    // (이 값들은 테스트가 조작한 게 아니라 push()/초기 메시지 유무로 자연히 결정된다).
    expect(dones[0].origin).toBe('user')   // 턴1: 초기 메시지
    expect(dones[1].origin).toBe('cron')   // 턴2: 자율 continuation
    expect(dones[2].origin).toBe('user')   // 턴3: 인터리빙(push)
    expect(dones[3].origin).toBe('cron')   // 턴4: 자율 continuation(체인 종료)

    const idxDone3 = events.indexOf(dones[2])
    const idxDone4 = events.indexOf(dones[3])

    // (i) 인터리빙(턴3) done 이전 구간엔 배너 소거(loops:[]) 이벤트가 있으면 안 된다
    //     — 있으면 BF3-P04 버그(인터리빙을 체인 종료로 오판)가 재발한 것.
    const loopsBeforeDone3 = events.slice(0, idxDone3).filter((e): e is AgentEventLoops => e.type === 'loops')
    expect(loopsBeforeDone3.length).toBeGreaterThan(0)  // 턴1/턴2에서 정상 생성 이벤트는 있어야 함
    for (const le of loopsBeforeDone3) expect(le.loops.length).toBeGreaterThan(0)

    // (ii) 반대 버그 차단 — 턴4(진짜 재예약 없는 cron 턴) done 직전엔 loops:[] 소거가 있어야 한다.
    const before4 = events[idxDone4 - 1]
    expect(before4.type).toBe('loops')
    expect((before4 as AgentEventLoops).loops).toEqual([])

    // 최종 스냅샷도 빈 배열(좀비 배너 없음)
    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    expect(loopsEvents[loopsEvents.length - 1].loops).toEqual([])
  })
})
