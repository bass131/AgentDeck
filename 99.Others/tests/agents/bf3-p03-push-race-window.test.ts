/**
 * bf3-p03-push-race-window.test.ts — BF3-backlog-sweep Phase 03 TDD (push μs창 봉합).
 *
 * 배경(01.Phases/BF3-backlog-sweep/03-push-race-window.md, LR3-P02 reviewer 🟡-1 원 기록):
 *   지속세션 펌프의 턴 경계 idle-close 판정(claudeAgentRun.ts `_runPersistentPump`,
 *   `_pendingSends===0 && !hasLoopActivity()` → `_idleClosing = true`, ~:673-674)과 held-open
 *   입력 제너레이터(`_inputGen`)의 실제 종료(재진입 시 `_idleClosing` 체크, ~:534) 사이에는
 *   경합 창이 존재한다. `_inputGen`의 while 루프는 `_idleClosing`을 `_inputQueue` 상태보다
 *   먼저·무조건 확인하므로, 판정 이후 도착한 push()가 큐에 쌓여도 다음 재진입에서 그대로
 *   버려진다(check-order 결함 — "판정"과 "행동" 사이 재확인 없음).
 *
 * ── 결정론적 재현 설계(setTimeout 금지 — 훅/큐/deferred로 순서를 코드로 고정) ──────────
 *
 *   mock queryFn은 lr3-p02-idle-session-lifetime.test.ts 관례를 그대로 따라
 *   `prompt[Symbol.asyncIterator]()`를 직접 pull해 "SDK가 다음 입력을 요청하는" 시점을
 *   재현한다. 이 스위트는 거기서 한 걸음 더 나아가, **그 두 번째 pull을 테스트가 쥔 deferred
 *   게이트(`secondPullGate`) 뒤로 명시적으로 미룬다.**
 *
 *   테스트는 `run.events`에서 'done'을 관측한 **직후** push()를 호출하고, **그 다음에야**
 *   게이트를 연다(`releaseSecondPull()`). 두 번째 pull(=`_inputGen`의 재진입·`_idleClosing`
 *   체크가 실제로 실행되는 지점)은 게이트가 열려야만 진행되므로:
 *
 *     "idle-close 판정(동기, done push보다 나중) → done이 이벤트 소비자에 도달 → push() →
 *      게이트 open → _inputGen 재진입 체크"
 *
 *   라는 순서가 **항상** 강제된다(microtask/macrotask 스케줄링 추측 불필요 — 인과관계로 고정).
 *   done push(~:656)가 idle-close 판정(~:673-674)보다 먼저 큐에 적재되므로, 이벤트 소비자가
 *   'done'을 보는 시점엔 판정이 이미 동기로 끝나 있다(`_idleClosing===true` 확정) — 즉 이
 *   push()는 정확히 "판정 직후·gen 종료 전" 창을 겨냥한다.
 *
 * RED(수리 전): `_inputGen`의 idleClosing 체크가 큐 상태를 보지 않고 무조건 return하므로,
 *   경합 창에 도착한 push()는 유실된다 — 두 번째 pull은 `done:true`, turn2가 오지 않는다.
 * GREEN(수리 후): push()/재진입 재확인이 큐에 남은 내용을 감지해 강등을 취소한다 — turn2가 온다.
 */
import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent, AgentEventDone } from '../../../02.Source/shared/agent-events'

// ── 공통 픽스처 (lr3-p02-idle-session-lifetime.test.ts 관례 미러) ────────────────────

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

describe('BF3-P03 — push μs창 경합: idle-close 판정 이후·입력 gen 종료 이전 도착한 push', () => {
  it('경합 창에 도착한 push가 유실되지 않고 turn2로 처리된다(게이트로 순서 고정, setTimeout 없음)', async () => {
    let releaseSecondPull: (() => void) | null = null
    const secondPullGate = new Promise<void>((resolve) => {
      releaseSecondPull = resolve
    })
    let secondPullDone: boolean | undefined = undefined

    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')

      // 경합 창 재현 핵심: 두 번째 pull(=_inputGen 재진입 체크)은 테스트가 push() 호출을
      // "먼저" 끝낸 뒤에만 진행되도록 명시적으로 막아둔다(deferred 게이트).
      await secondPullGate

      const second = await inputIter.next()
      secondPullDone = second.done
      if (!second.done) yield mkResult('turn2-raced')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '활동 없는 대화(경합 유도)' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    let pushedOnce = false
    for await (const e of run.events) {
      events.push(e)
      if (e.type === 'done' && !pushedOnce) {
        pushedOnce = true
        // 이 시점에 _idleClosing은 이미 true다(idle-close 판정은 done push보다 먼저 동기로
        // 끝났으므로) — "판정 이후·gen 종료 이전" 창을 정확히 겨냥한 push.
        run.push('경합 중 도착한 push')
        releaseSecondPull!()
      }
    }

    // 봉합 성공 조건: push가 유실되지 않았다면 두 번째 pull은 닫히지 않고(done:false)
    // turn2가 정상 처리된다.
    expect(secondPullDone).toBe(false)
    const dones = events.filter((e) => e.type === 'done')
    expect(dones.length).toBe(2)
    expect((dones[0] as AgentEventDone).origin).toBe('user')
    expect((dones[1] as AgentEventDone).origin).toBe('user')
  })

  it('회귀 — 잔여 push 없는 정상 idle-close는 여전히 자연종료된다(경합 없음, abort 불필요)', async () => {
    let secondPullDone: boolean | undefined = undefined

    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')

      const second = await inputIter.next()
      secondPullDone = second.done
      if (!second.done) yield mkResult('unexpected-turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '활동 없는 대화(정상 종료)' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    expect(secondPullDone).toBe(true)
    const dones = events.filter((e) => e.type === 'done')
    expect(dones.length).toBe(1)
    expect((dones[0] as AgentEventDone).origin).toBe('user')
  })
})
