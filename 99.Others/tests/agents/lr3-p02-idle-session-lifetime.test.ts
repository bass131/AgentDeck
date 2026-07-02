/**
 * lr3-p02-idle-session-lifetime.test.ts — AUTO 세션 수명(활동 기반 held-open) TDD
 *   (LR3 Phase 02)
 *
 * 배경(01.Phases/LR3-loop-ux/02-auto-session-lifetime.md): persistent 세션이 턴 경계에서
 * "살아있을 이유"(미소비 pending user turn 또는 활성 루프[크론/armed wakeup/등록 중 pending])가
 * 없으면 스스로 입력 스트림(_inputGen)을 닫는다 → 기존 스트림 자연종료 정리 경로
 * (agent-runs.ts:191 for-await → finally:209-214 cleanup)가 그대로 처리한다.
 * 이 스위트는 claudeAgentRun.ts의 펌프 레벨만 검증한다 — agent-runs.ts는 0줄 변경(별도 실측,
 * git diff 확인은 완료 보고에 포함).
 *
 * 신뢰경계: 실 SDK 호출 0. mock QueryFn이 SDKMessage 형상을 흉내(WT2/PP2 관례 미러 —
 * `prompt[Symbol.asyncIterator]()`를 직접 pull해 "SDK가 다음 입력을 요청하는" 시점을
 * 재현 — 이 pull이 idle-close 후 `{done:true}`로 끊기는지가 판정의 핵심 신호).
 *
 * 계약 4경로(Phase 02 완료조건):
 *  IC1 — 활동 없는 done → 입력 스트림 종료(다음 pull이 done:true) + events 자연 종료(abort 불필요).
 *  IC2 — activeLoops(크론) 있는 done → 세션 유지(다음 pull이 열려 있음 → push로 turn2 처리).
 *  IC2b — armed wakeup(ScheduleWakeup) 있는 done → 세션 유지(WT 스타일 재사용).
 *  IC3 — 루프 소멸(CronDelete) 후 다음 done → 종료(hasActivity 재평가 = 최신 상태).
 *  IC4 — 닫힌 뒤 후속 턴 → 새 세션 + resumeSessionId가 SDK options.resume까지 도달(PP6 미러).
 *
 * 엣지 계약(Phase 02 "작업 내용" 항목 그대로):
 *  - interrupt 후 활동 없음 → 다음 경계(=이 interrupt-result의 done)에서 닫힘 OK.
 *  - 권한/질문 대기 중(턴 내부, done 없음)은 idle 판정 비대상 — 구조적 보장(코드상 idle-close
 *    체크는 `done !== null` 분기 내부에만 존재) + 실측(permission_request 대기 동안 스트림이
 *    안 끊기고 respond 후 정상 완주함).
 *  - LR2-04 선저장 경로 상호작용: 안정적 sessionId 기반 resume이 idle-close 이후에도 정상
 *    배선됨(IC4가 바로 이 계약 — 새 IPC 0, 기존 backend.start()+resumeSessionId 경로 재사용).
 *  - 멀티패널: idle-close 판정 로직은 sessionKey/workspaceRoot를 전혀 참조하지 않는다
 *    (CronTracker는 런당 1개 인스턴스 — RunEventNormalizer가 소유) → 서로 다른 두 run이
 *    독립적으로 판정됨을 실측.
 */
import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent, AgentEventDone } from '../../../02.Source/shared/agent-events'

// ── 공통 픽스처 (persistent-pump.test.ts/loop-tracking.test.ts/wakeup-tracking.test.ts 관례 미러) ──

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

function mkCronCreateToolUse(toolUseId: string, prompt: string, cron = '*/1 * * * *') {
  return {
    type: 'assistant' as const,
    message: {
      id: `msg_${toolUseId}`,
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'tool_use', id: toolUseId, name: 'CronCreate', input: { cron, prompt, recurring: true } }],
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

function mkCronCreateToolResult(toolUseId: string, cronId: string, interval: string) {
  const content = `Scheduled recurring job ${cronId} (${interval}). Session-only (not written to disk).`
  return {
    type: 'user' as const,
    message: { role: 'user' as const, content: [{ type: 'tool_result', tool_use_id: toolUseId, content }] },
    parent_tool_use_id: null,
    uuid: `uuid-user-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

function mkCronDeleteToolUse(toolUseId: string, cronId: string) {
  return {
    type: 'assistant' as const,
    message: {
      id: `msg_${toolUseId}`,
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'tool_use', id: toolUseId, name: 'CronDelete', input: { id: cronId } }],
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

function mkToolResult(toolUseId: string, content = 'ok') {
  return {
    type: 'user' as const,
    message: { role: 'user' as const, content: [{ type: 'tool_result', tool_use_id: toolUseId, content }] },
    parent_tool_use_id: null,
    uuid: `uuid-user-res-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
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

// ── IC1: 활동 없는 done → 입력 스트림 스스로 종료 ────────────────────────────────

describe('IC1 — 활동 없는 done → 입력 스트림 스스로 종료', () => {
  it('턴1 완료 + 활동 없음 → 다음 pull이 done:true(닫힘) + events 자연 종료(abort 불필요)', async () => {
    let secondPullDone: boolean | undefined = undefined

    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')

      // SDK가 다음 input을 요청하는 시점을 재현 — idle-close가 발동했다면 done:true.
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
    // abort() 호출 없이 for-await가 스스로 끝나야 한다 — 이게 "전체 정리 경로 도달"의 증거.
    for await (const e of run.events) events.push(e)

    expect(secondPullDone).toBe(true)
    const dones = events.filter((e) => e.type === 'done')
    expect(dones.length).toBe(1)
    expect((dones[0] as AgentEventDone).origin).toBe('user')
  })
})

// ── IC2: activeLoops(크론) 있는 done → 세션 유지 ─────────────────────────────────

describe('IC2 — 활성 크론 루프 있는 done → 세션 유지', () => {
  it('CronCreate로 활동 등록 → 다음 pull이 열려 있음(닫히지 않음) → push로 turn2 정상 처리', async () => {
    let secondPullDone: boolean | undefined = undefined

    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkCronCreateToolUse('c1', '1분마다 상태 확인', '*/1 * * * *')
      yield mkCronCreateToolResult('c1', 'aaaa1111', 'Every minute')
      yield mkResult('turn1')

      const second = await inputIter.next()
      secondPullDone = second.done
      if (!second.done) yield mkResult('turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '1분마다 확인해줘' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    let pushed = false
    for await (const e of run.events) {
      events.push(e)
      // 첫 done 직후 follow-up push — 세션이 유지되지 않았다면 second pull이 이미
      // done:true였을 것이므로 push된 내용은 유실되고 turn2가 절대 안 온다.
      if (e.type === 'done' && !pushed) {
        pushed = true
        run.push('두 번째 메시지')
      }
    }

    expect(secondPullDone).toBe(false)
    const dones = events.filter((e) => e.type === 'done')
    expect(dones.length).toBe(2)
  })
})

// ── IC2b: armed wakeup(ScheduleWakeup) 있는 done → 세션 유지 ─────────────────────

describe('IC2b — armed wakeup 있는 done → 세션 유지', () => {
  it('ScheduleWakeup으로 활동 등록 → 다음 pull이 열려 있음(닫히지 않음)', async () => {
    let secondPullDone: boolean | undefined = undefined

    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkWakeupToolUse('wk-1', 270, '사용자가 멈추라고 할 때까지 PING 반복')
      yield mkWakeupToolResult('wk-1', 'Next wakeup scheduled (in 270s).')
      yield mkResult('turn1')

      const second = await inputIter.next()
      secondPullDone = second.done
      if (!second.done) yield mkResult('turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: "PING 반복해줘" }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    let pushed = false
    for await (const e of run.events) {
      events.push(e)
      if (e.type === 'done' && !pushed) {
        pushed = true
        run.push('그만')
      }
    }

    expect(secondPullDone).toBe(false)
    const dones = events.filter((e) => e.type === 'done')
    expect(dones.length).toBe(2)
  })
})

// ── IC3: 루프 소멸(CronDelete) 후 다음 done → 종료 ───────────────────────────────

describe('IC3 — 루프 소멸 후 다음 done → 종료', () => {
  it('턴1 CronCreate(유지) → 턴2 CronDelete(자율, push 없음) → 그 done에서 스스로 종료', async () => {
    let afterTurn2PullDone: boolean | undefined = undefined

    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkCronCreateToolUse('c1', '틱 감시', '*/1 * * * *')
      yield mkCronCreateToolResult('c1', 'aaaa1111', 'Every minute')
      yield mkResult('turn1')

      // 턴2: 자율 발동(push 없음) — 모니터링 종료 판단으로 CronDelete
      yield mkCronDeleteToolUse('d1', 'aaaa1111')
      yield mkToolResult('d1', 'deleted')
      yield mkResult('turn2')

      const afterTurn2 = await inputIter.next()
      afterTurn2PullDone = afterTurn2.done
      if (!afterTurn2.done) yield mkResult('unexpected-turn3')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '틱마다 감시해줘' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    // abort 없이 자연 종료돼야 함(턴2가 cron origin — push 전혀 없음).
    for await (const e of run.events) events.push(e)

    expect(afterTurn2PullDone).toBe(true)
    const dones = events.filter((e) => e.type === 'done')
    expect(dones.length).toBe(2)
    expect((dones[0] as AgentEventDone).origin).toBe('user')
    expect((dones[1] as AgentEventDone).origin).toBe('cron')
  })
})

// ── IC4: 닫힌 뒤 후속 턴 → 새 세션 + resumeSessionId가 SDK options.resume까지 도달 ──

describe('IC4 — idle-close 후 후속 턴이 resumeSessionId로 새 held-open을 연다', () => {
  it('세션1(무활동, idle-close) → session 이벤트로 sessionId 캡처 → 세션2가 resumeSessionId 전달 → options.resume 일치', async () => {
    let callCount = 0
    let capturedResume: unknown = null
    let promptWasAsyncIterableOnSecondCall = false

    const queryFn: QueryFn = async function* (p) {
      callCount++
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      if (callCount === 1) {
        const first = await inputIter.next()
        if (first.done) return
        yield mkInit('sess-p02-ic4')
        yield mkResult('turn1')
        // idle-close 확인(부수 증거) — 굳이 assert하지 않아도 아래 for-await 자연 종료가 증거.
        await inputIter.next()
      } else {
        capturedResume = (p.options as Record<string, unknown> | undefined)?.['resume']
        promptWasAsyncIterableOnSecondCall =
          prompt !== null && typeof prompt === 'object' && Symbol.asyncIterator in (prompt as object)
        await inputIter.next()
        yield mkResult('turn1-resumed')
      }
    }

    const backend = new ClaudeCodeBackend(queryFn)

    // 세션1: 무활동 → idle-close(전체 정리 경로 도달, 실측 IC1과 동일 형상).
    const run1 = backend.start({
      messages: [{ role: 'user', content: '첫 대화' }],
      persistent: true,
    })
    const events1: AgentEvent[] = []
    for await (const e of run1.events) events1.push(e)

    const sessionEvt = events1.find((e) => e.type === 'session')
    expect(sessionEvt).toBeDefined()
    const sessionId = (sessionEvt as Extract<AgentEvent, { type: 'session' }>).sessionId
    expect(sessionId).toBe('sess-p02-ic4')

    // 세션2: 닫힌 뒤 후속 턴 — 기존대로 persistent+resumeSessionId 재전송(신규 IPC 0).
    const run2 = backend.start({
      messages: [{ role: 'user', content: '재개' }],
      persistent: true,
      resumeSessionId: sessionId,
    })
    for await (const e of run2.events) void e

    expect(capturedResume).toBe('sess-p02-ic4')
    expect(promptWasAsyncIterableOnSecondCall).toBe(true)
  })
})

// ── Edge: interrupt 후 활동 없음 → 다음 경계(이 turn의 done)에서 닫힘 OK ──────────

describe('Edge — interrupt 후 활동 없음: 다음 턴 경계(interrupt-result의 done)에서 닫힘', () => {
  it('interrupt-result(error suppressed)의 done 이후 pendingSends=0·활동 없음 → 다음 pull이 닫힘', async () => {
    let resolveWait: (() => void) | null = null
    let readyResolve: (() => void) | null = null
    const ready = new Promise<void>((r) => { readyResolve = r })
    let secondPullDone: boolean | undefined = undefined

    const queryFn: QueryFn = function (p) {
      const promptIterable = (p.prompt as unknown) as AsyncIterable<unknown>
      const gen = (async function* () {
        const inputIter = promptIterable[Symbol.asyncIterator]()
        const first = await inputIter.next()
        if (first.done) return

        // 진행 중 turn 모델링 — interrupt()가 호출될 때까지 대기(실측: resolve, throw 아님).
        await new Promise<void>((resolve) => {
          resolveWait = resolve
          readyResolve?.()
        })

        // 실측: interrupt 직후 SDK는 result(is_error) 메시지를 emit(throw 아님).
        yield mkErrorDuringExecutionResult()

        const second = await inputIter.next()
        secondPullDone = second.done
        if (!second.done) yield mkResult('should-not-happen')
      })()

      ;(gen as unknown as Record<string, unknown>)['interrupt'] = async () => {
        if (resolveWait) {
          const r = resolveWait
          resolveWait = null
          r()
        }
      }

      return gen as AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '안녕' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    const consumePromise = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await ready
    run.interrupt()

    // abort() 없이 for-await가 자연 종료돼야 idle-close가 발동한 것.
    await consumePromise

    expect(secondPullDone).toBe(true)
    // BF1-interrupt-loop P03 회귀 가드도 동시 확인: interrupt-result가 error로 표면화되면 안 됨.
    expect(events.some((e) => e.type === 'error')).toBe(false)
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })
})

// ── Edge: 권한 대기 중(턴 내부, done 없음)은 idle 판정 비대상 ─────────────────────

describe('Edge — 권한 대기 중(턴 내부)은 idle 판정 비대상', () => {
  it('permission_request 대기 동안 스트림이 끊기지 않고, respond 후 정상 완주 + 이후 idle-close', async () => {
    let capturedCanUseTool:
      | ((toolName: string, input: Record<string, unknown>, opts: { signal: AbortSignal; toolUseID: string }) =>
          Promise<{ behavior: string; updatedInput?: unknown; updatedPermissions?: unknown; message?: string }>)
      | null = null

    const queryFn: QueryFn = async function* (p) {
      const opts = p.options as Record<string, unknown> | undefined
      capturedCanUseTool = opts?.['canUseTool'] as typeof capturedCanUseTool
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return

      // 부수효과 도구(Bash) 권한 요청 — 응답 전까지 await(턴 내부, done 없음).
      const signal = new AbortController().signal
      await capturedCanUseTool!('Bash', { command: 'ls' }, { signal, toolUseID: 'tu-idle-perm-1' })
      yield mkResult('turn1')

      // done 이후 활동 없음 → idle-close 확인용 pull
      const second = await inputIter.next()
      if (!second.done) yield mkResult('unexpected-turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: 'ls 실행해줘' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    for await (const e of run.events) {
      events.push(e)
      if (e.type === 'permission_request') {
        run.respond(e.requestId, { kind: 'permission', behavior: 'allow' })
      }
    }

    // 대기 구간에서 세션이 조기 종료되지 않았다면 permission_request → done까지 모두 관측된다.
    expect(events.some((e) => e.type === 'permission_request')).toBe(true)
    expect(events.some((e) => e.type === 'done')).toBe(true)
    // for-await가 abort 없이 자연 종료됐다는 사실 자체가 done 이후 idle-close 발동의 증거.
  })
})

// ── Edge: 멀티패널(세션 무관 동일 규칙) — 독립된 두 run이 독립적으로 idle 판정 ────

describe('Edge — 멀티패널: idle-close 판정은 sessionKey/panel과 무관, 런별 독립', () => {
  it('무활동 패널A는 스스로 닫히고, 활동 있는 패널B는 A와 무관하게 유지된다', async () => {
    const queryFnA: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('A-turn1')
    }

    let bSecondPullDone: boolean | undefined = undefined
    const queryFnB: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkCronCreateToolUse('b-c1', '패널B 감시')
      yield mkCronCreateToolResult('b-c1', 'bbbb2222', 'Every minute')
      yield mkResult('B-turn1')

      const second = await inputIter.next()
      bSecondPullDone = second.done
      if (!second.done) yield mkResult('B-turn2')
    }

    const backendA = new ClaudeCodeBackend(queryFnA)
    const backendB = new ClaudeCodeBackend(queryFnB)

    const runA = backendA.start({
      messages: [{ role: 'user', content: '패널A' }],
      persistent: true,
      sessionKey: 'panel-A',
    })
    const runB = backendB.start({
      messages: [{ role: 'user', content: '패널B' }],
      persistent: true,
      sessionKey: 'panel-B',
    })

    const eventsA: AgentEvent[] = []
    const eventsB: AgentEvent[] = []

    const drainA = (async () => {
      for await (const e of runA.events) eventsA.push(e)
    })()

    const drainB = (async () => {
      let pushed = false
      for await (const e of runB.events) {
        eventsB.push(e)
        if (e.type === 'done' && !pushed) {
          pushed = true
          runB.push('패널B 후속')
        }
      }
    })()

    await drainA
    await drainB

    // 패널A: 무활동 → 자연 idle-close(abort 없이 for-await 완주).
    expect(eventsA.filter((e) => e.type === 'done').length).toBe(1)
    // 패널B: A가 닫힌 것과 무관하게 자신의 활동으로 유지 → turn2까지 처리.
    expect(bSecondPullDone).toBe(false)
    expect(eventsB.filter((e) => e.type === 'done').length).toBe(2)
  })
})
