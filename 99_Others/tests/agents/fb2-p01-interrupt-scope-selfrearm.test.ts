/**
 * fb2-p01-interrupt-scope-selfrearm.test.ts — FB2 Phase 01 진단 증거 테스트(진단 전용, 수정 X).
 *
 * 배경(01.Phases/FB2-ui-feedback2/01-interrupt-repro-diagnose.md): 영호 실사용(2026-07-04) —
 * "goal GUI의 중단 버튼 or 채팅창의 인터럽트 버튼을 눌러도 중단이 안 된다."
 *
 * ── 진단 결론(코드+ADR-024 대조로 확정, BF1 회귀 아님) ────────────────────────────────
 *
 * `ClaudeAgentRun.interrupt()`(claudeAgentRun.ts:260-276)는 설계상 **"현재 턴만" 중단**한다
 * (주석 원문: "abort()는 abortController.abort()+waiter 정리+close를 동반하지만, interrupt는
 * 그중 SDK turn 중단만"). ADR-024 트레이드오프 ⑤도 명시: "abort 분리: interrupt()(현재 턴)
 * vs closeSession()(세션 종료)". 그리고 self-re-arm(ScheduleWakeup, `/loop`·`/schedule`·`/goal`
 * 계열 빌트인 반복의 공통 메커니즘, ADR-024 §self-re-arm)은 **세션 스코프**로 예약된다 —
 * 한 턴이 ScheduleWakeup을 성공시키면 그 예약은 "현재 턴"이 끝나도(interrupt로 강제 종료되어도)
 * 살아남는다. 즉 **interrupt()는 self-re-arm을 해제할 수단이 전혀 없다** — 오직 세션 자체를
 * 끝내는 abort()(또는 에이전트 스스로의 CronDelete/재무장 포기)만이 반복을 멈춘다.
 *
 * `LoopStatusBanner`(07_notice/LoopStatusBanner.tsx)의 "sdk"(크론) 변형은 이걸 알고
 * `onStopSdk`를 `abortRun()`(세션 종료)에 배선했다("정지 — 세션 abort로 크론 종료" 주석).
 * 그러나 "goal" 변형은 전용 정지 버튼이 없다("정지 버튼 없음(컴포저 자체 중단 버튼이 …
 * 이미 노출되므로 중복 불필요 — goal은 항상 단일 run 안에서 진행되기 때문)") — 그 대신 의존하는
 * 컴포저의 정지 버튼(Conversation.tsx:555-558 `handleAbort`, PanelView.tsx:206-216 동형)은
 * `replMode`만 보고 interrupt() vs abort()를 고른다: `replMode ? interruptRun() : abortRun()`.
 * `pendingCommand`(goal 진행 중)나 `activeLoops`(크론/armed wakeup 진행 중) 상태는 전혀
 * 참조하지 않는다. replMode 기본값은 ON(ADR-024 "AUTO 세션 수명") — 즉 goal/loop가 진행
 * 중이어도 정지 버튼은 **항상 interrupt()만 호출**한다.
 *
 * `/goal` 자체의 continuation 메커니즘(SDK 내부 "stop-hook", LR2-loop-replmode P03 실측 —
 * loops 이벤트 0·블랙박스)은 여기서 직접 재현할 수 없다(엔진 고유 미공개 동작). 대신 코드로
 * 관측 가능한 자매 메커니즘인 ScheduleWakeup self-re-arm(progressTrackers.ts CronTracker,
 * `/loop`·`/schedule` 계열이 씀 — 같은 ADR-024 self-re-arm 원리)으로 **"interrupt가 세션
 * 스코프 재무장을 해제하지 않는다"**는 사실을 claudeAgentRun.ts 레벨에서 직접 실증한다. 두
 * 메커니즘이 정확히 같은 코드를 타지는 않지만(goal=stop-hook 블랙박스, loop=CronTracker
 * 가시 추적), 둘 다 "세션 스코프 자기지속, 턴 경계 interrupt로 해제 불가"라는 동일 아키텍처
 * 계약(ADR-024) 위에 있다 — 따라서 이 테스트가 고정하는 사실은 두 사용자 증상(goal GUI +
 * 채팅창) **양쪽 모두에 적용 가능한 공통 근본원인**의 증거다.
 *
 * ── 이 파일이 "실패 테스트"가 아닌 이유 ────────────────────────────────────────────
 *
 * 아래 단언들은 *현재 코드 그대로* 통과한다(RED 아님) — claudeAgentRun.ts의 interrupt() 로직
 * 자체는 설계 의도대로 정확히 동작하기 때문이다(BF1-interrupt-loop P03이 고친 부분도 여전히
 * green — bf1-interrupt-error-mislabel.test.ts 참고). 버그는 이 파일 안에 없다 — **"턴만
 * 끊는 interrupt로 세션 스코프 self-re-arm을 멈출 수 있다"는 GUI 쪽의 암묵 가정**
 * (LoopStatusBanner.tsx의 goal 변형 주석, Conversation/PanelView의 replMode-only 분기)이
 * 잘못됐다는 게 진단 핵심이다. 그래서 이 테스트는 "고장난 곳을 잡는 RED"가 아니라 "GUI가
 * 기댈 수 없는 계약을 계측 가능한 사실로 고정하는 회귀 가드 + P02 증거"로 작성한다.
 *
 * P02 방향 제언(판단은 메인/coordinator): (a) LoopStatusBanner "goal" 변형에도 sdk 변형처럼
 * abort 배선 전용 정지 버튼을 추가하거나, (b) 컴포저의 정지 결정을 `replMode` 단독이 아니라
 * `activeLoops.length>0 || pendingCommand?.name==='goal'`도 함께 보고 그 경우 abort()를
 * 쓰도록 바꾼다. 둘 다 렌더러(off-limits, agent-backend 관할 밖) 변경 — 실 수정 전 `/goal`
 * 자체가 interrupt()에 어떻게 반응하는지 SDK stop-hook 실측(probe, BF1 P01의
 * bf1_interrupt_probe.mjs 패턴 참고)을 권장한다 — 코드 정독만으로는 stop-hook 내부를 알 수
 * 없다(BF1의 "코드 정독 < 실측" 교훈, claude-api 스킬/공식문서 확인 후 진행 — 추측 구현 X).
 */
import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

// ── 공통 픽스처 (lr3-p02-idle-session-lifetime.test.ts / bf1-interrupt-error-mislabel.test.ts 관례 미러) ──

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

/** result(is_error=true, subtype='error_during_execution') — interrupt 직후 SDK emit(실측, throw 아님). */
function mkErrorDuringExecutionResult() {
  return {
    type: 'result' as const,
    subtype: 'error_during_execution' as const,
    is_error: true,
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: 1,
    total_cost_usd: 0,
    permission_denials: [],
    errors: [],
    uuid: 'uuid-err-0000-0000-0000-000000000099' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

function mkAssistantText(text: string, id = 'msg_txt') {
  return {
    type: 'assistant' as const,
    message: {
      id,
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'text', text }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: `uuid-asst-${id}` as `${string}-${string}-${string}-${string}-${string}`,
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
    message: { role: 'user' as const, content: [{ type: 'tool_result', tool_use_id: toolUseId, content }] },
    parent_tool_use_id: null,
    uuid: `uuid-user-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

function describeEvents(events: AgentEvent[]): string {
  if (events.length === 0) return '(이벤트 0개)'
  return events
    .map((e, i) => {
      const rec = e as unknown as Record<string, unknown>
      switch (e.type) {
        case 'error': return `[${i}]error(${JSON.stringify(rec['message'])})`
        case 'done': return `[${i}]done(origin=${JSON.stringify(rec['origin'])})`
        case 'loops': return `[${i}]loops(${JSON.stringify((rec['loops'] as unknown[]).map((l) => (l as { id: string }).id))})`
        case 'text': return `[${i}]text(${JSON.stringify(rec['delta'])})`
        default: return `[${i}]${e.type}`
      }
    })
    .join(' → ')
}

/**
 * 자기지속(self-re-arm) 3턴 시나리오를 흉내내는 mock query.
 *
 * 턴1(user): ScheduleWakeup 최초 무장 + 텍스트 + 정상 done.
 * 턴2(cron, 자율 발동 — push 없음): ScheduleWakeup **재**무장(interrupt 전에 성공) + 텍스트 +
 *   여기서 대기(진행 중 turn 모델링) → interrupt() 호출 시 resolve(실측: throw 아님, BF1) →
 *   result(is_error) emit.
 * (턴3 게이트) interrupt-result 이후, 턴3 진입 전에 한 번 더 대기 — 실제 self-re-arm도
 *   다음 wakeup까지 시간차가 있으므로 사실적 모델링이자, 테스트가 "abort()가 턴3보다
 *   먼저 도착하는지"를 타이밍 경쟁 없이 검증할 수 있게 하는 장치. 기본 50ms 타이머로
 *   자동 진행하되, `advanceTurn3()`으로 즉시 진행시킬 수도 있다(대기시간 단축용).
 * 턴3(cron, 자율 발동 — push 없음, interrupt **이후**): 재무장 없이 텍스트 + 정상 done —
 *   "interrupt가 self-re-arm을 못 끊었다면 이 턴이 실제로 도착한다"는 증거.
 *
 * ready: 턴2가 interrupt 대기 지점에 도달하면 resolve(경쟁 없는 interrupt() 타이밍용).
 */
function makeSelfRearmInterruptQueryFn(): {
  queryFn: QueryFn
  ready: Promise<void>
  advanceTurn3: () => void
} {
  let resolveInterruptWait: (() => void) | null = null
  let readyResolve: (() => void) | null = null
  const ready = new Promise<void>((r) => { readyResolve = r })
  let resolveTurn3Gate: (() => void) | null = null

  const queryFn: QueryFn = function (p) {
    const promptIterable = (p.prompt as unknown) as AsyncIterable<unknown>

    const gen = (async function* () {
      const inputIter = promptIterable[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return

      // ── 턴1(user): 최초 무장 ──
      yield mkWakeupToolUse('wk-1', 270, '초기 무장')
      yield mkWakeupToolResult('wk-1', 'Next wakeup scheduled (in 270s).')
      yield mkAssistantText('턴1 진행 중...', 'm1')
      yield mkResult('turn1')

      // ── 턴2(cron, 자율): 재무장(interrupt 전 성공) → 텍스트 → interrupt 대기 ──
      yield mkWakeupToolUse('wk-2', 270, '재무장')
      yield mkWakeupToolResult('wk-2', 'Next wakeup scheduled (in 270s).')
      yield mkAssistantText('턴2 진행 중...', 'm2')

      await new Promise<void>((resolve) => {
        resolveInterruptWait = resolve
        readyResolve?.()
      })

      // 실측(BF1): interrupt 직후 SDK는 throw 없이 result(is_error)를 emit한다.
      yield mkErrorDuringExecutionResult()

      // ── 턴3 게이트: 실제 wakeup 간격을 흉내낸 지연(기본 50ms 타이머, advanceTurn3()로 즉시 진행 가능) ──
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 50)
        resolveTurn3Gate = () => { clearTimeout(timer); resolve() }
      })

      // ── 턴3(cron, 자율, interrupt 이후): 재무장 없이 자연 종료 ──
      // push 전혀 없음 — 이 턴이 도착한다는 사실 자체가 "interrupt가 self-re-arm을
      // 끊지 못했다"의 직접 증거다(세션이 스스로, 입력 없이 계속 돌았다).
      yield mkAssistantText('턴3 진행 중...', 'm3')
      yield mkResult('turn3-after-interrupt')
    })()

    // SDK query 핸들의 interrupt() — 실측: 예외 없이 정상 resolve(BF1).
    ;(gen as unknown as Record<string, unknown>)['interrupt'] = async () => {
      if (resolveInterruptWait) {
        const r = resolveInterruptWait
        resolveInterruptWait = null
        r()
      }
    }

    return gen as AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
  }

  return { queryFn, ready, advanceTurn3: () => resolveTurn3Gate?.() }
}

describe('FB2-P01 진단 증거 — interrupt()는 self-re-arm(세션 스코프 반복)을 해제하지 못한다', () => {
  it('턴2를 interrupt해도 armed wakeup 슬롯이 살아남아 턴3(자율, push 없음)이 실제로 도착한다', async () => {
    const { queryFn, ready, advanceTurn3 } = makeSelfRearmInterruptQueryFn()
    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '반복 작업 시작' }],
      persistent: true,
      sessionKey: 'fb2-p01-selfrearm-1',
    })

    const events: AgentEvent[] = []
    // abort 없이 for-await가 스스로 끝나야 한다(턴3에서 재무장 안 함 → idle-close 자연 종료) —
    // 이게 "인위적으로 끊지 않아도 3턴이 전부 자연 처리됐다"는 추가 증거다.
    for await (const e of run.events) {
      events.push(e)
      if (e.type === 'text' && (e as { delta: string }).delta === '턴2 진행 중...') {
        await ready
        run.interrupt()
      }
      // 턴2의 interrupt-result(done)가 도착하면 턴3 게이트를 즉시 열어 대기시간 단축.
      if (e.type === 'done' && (e as { origin?: string }).origin === 'cron') {
        advanceTurn3()
      }
    }

    const types = events.map((e) => e.type)

    // ① BF1 불변식 유지 — interrupt-result가 error로 표면화되면 안 됨(session 유지 전제).
    expect(types, describeEvents(events)).not.toContain('error')

    // ② 3턴 전부 처리됨 — done 3개(턴1/턴2-interrupt/턴3). 턴3이 존재한다는 것 자체가
    //    "interrupt가 self-re-arm 체인을 끊지 못했다"의 직접 증거(push 전혀 없었음).
    const doneCount = types.filter((t) => t === 'done').length
    expect(doneCount, describeEvents(events)).toBe(3)

    // ③ 핵심 — interrupt로 끝난 턴2의 재무장(wk-2)이 살아남았다: 턴2 done 직후 시점까지
    //    나온 loops 스냅샷에 여전히 'wakeup'이 있어야 한다(= GUI라면 "loop/goal 진행중"
    //    배너가 그대로 떠 있었을 시점 — 사용자가 "정지 눌렀는데 안 꺼졌다"고 느끼는 지점).
    const loopsEvents = events.filter(
      (e): e is Extract<AgentEvent, { type: 'loops' }> => e.type === 'loops'
    )
    // 무장 스냅샷 2개(턴1 최초 무장 · 턴2 재무장) + 턴3에서 재무장 안 해 자연 소멸 1개 = 3.
    expect(loopsEvents.length, describeEvents(events)).toBe(3)
    expect(
      loopsEvents[0].loops.some((l) => l.id === 'wakeup'),
      '턴1 최초 무장 스냅샷에 wakeup 없음 — 픽스처 오류 의심'
    ).toBe(true)
    expect(
      loopsEvents[1].loops.some((l) => l.id === 'wakeup'),
      `턴2 재무장(interrupt 직전 성공) 스냅샷에 wakeup이 없음 — 실제: ${describeEvents(events)}`
    ).toBe(true)
    // 턴3(재무장 없음)에서야 비로소 소멸 — interrupt 시점(턴2 done)에는 아직 안 지워졌다는 뜻.
    expect(loopsEvents[2].loops.length, describeEvents(events)).toBe(0)
  })
})

describe('FB2-P01 대조군 — abort()는(interrupt와 달리) self-re-arm 체인을 확실히 끊는다', () => {
  it('턴2 interrupt 직후 abort()하면 턴3(자율)이 도착하기 전에 스트림이 끝난다', async () => {
    const { queryFn, ready } = makeSelfRearmInterruptQueryFn()
    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '반복 작업 시작' }],
      persistent: true,
      sessionKey: 'fb2-p01-selfrearm-2',
    })

    const events: AgentEvent[] = []
    for await (const e of run.events) {
      events.push(e)
      if (e.type === 'text' && (e as { delta: string }).delta === '턴2 진행 중...') {
        await ready
        run.interrupt()
      }
      // interrupt-result(done, origin='cron')가 도착하면 즉시 abort — mock의 턴3 게이트는
      // 기본 50ms 타이머로만 열리므로(advanceTurn3() 미호출), 이 시점의 abort()가 항상
      // 턴3보다 먼저 도착한다(경쟁 없는 결정적 순서 — 실앱에서 이 자리는 "goal/loop 배너
      // 정지 버튼 → abortRun()"에 해당, P02 수정 방향).
      if (e.type === 'done' && (e as { origin?: string }).origin === 'cron') {
        run.abort()
      }
    }

    const types = events.map((e) => e.type)
    const texts = events
      .filter((e): e is Extract<AgentEvent, { type: 'text' }> => e.type === 'text')
      .map((e) => e.delta)

    // 턴3 텍스트("턴3 진행 중...")가 절대 도착하지 않는다 — abort가 실제로 체인을 끊었다는 증거.
    expect(texts, describeEvents(events)).not.toContain('턴3 진행 중...')
    // done은 최대 2개(턴1 + 턴2/interrupt) — 턴3의 done은 나타나지 않는다.
    const doneCount = types.filter((t) => t === 'done').length
    expect(doneCount, describeEvents(events)).toBeLessThanOrEqual(2)
  })
})
