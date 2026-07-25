/**
 * gap1-p11-runmanager-session-routing.test.ts — RunManager companion: 조기 close 라우팅 소실 봉합의 제품 파급 (GAP1 P11 (d))
 *
 * ── 목적 ─────────────────────────────────────────────────────────────────────────
 * P11 봉합("자율 턴 A의 무토큰 done이 사용자 턴 B의 pending을 탈취해 실행 중 세션을 조기 idle-close
 * 하지 못한다")의 **제품 파급**을 RunManager(00_ipc/agent-runs.ts) 라우팅 관점에서 회귀 잠금한다.
 *
 * repro(gap1-p11-autonomous-done-theft.repro)는 어댑터(claudeAgentRun) 내부에서 조기 close가
 * *일어나지 않음*을 done.origin·grace·onSessionClosing 대리자로 못박는다. 이 파일은 그 봉합이
 * **한 계층 위**에서 무엇을 지키는지를 못박는다: RunManager는 같은 sessionKey의 held-open 세션을
 * `persistentRuns` 맵으로 라우팅하고, 세션이 조기 idle-close하면 `run.onSessionClosing` 콜백이
 * 그 엔트리를 원자 제거한다(agent-runs.ts:215-221). 조기 close가 실재하면 라우팅 엔트리가 사라져
 * 동일 sessionKey의 후속 전송이 새 세션을 열게 되고(=`backend.start` 재호출), 이는 대화 맥락 단절·
 * 중복 세션이라는 제품 결함으로 표면화한다.
 *
 * ── 핵심 단정 (제품 파급) ─────────────────────────────────────────────────────────
 *   (1) 자율 턴 실행 중 done이 도착해도 세션(run)이 조기 제거되지 않는다.
 *   (2) 동일 sessionKey로 후속 전송(push) 시 `backend.start`는 **총 1회**만 호출된다
 *       (기존 held-open run 재사용 — pushFn 라우팅). 새 run 미생성.
 *
 * ── 봉합 전 대비(discriminating power) ───────────────────────────────────────────
 * 봉합 前(HEAD 이전)이었다면 자율 done이 B pending을 탈취 → stale idle grace가 실행 중 B 세션을
 * 조기 close → `onSessionClosing` 발화 → persistentRuns 제거 → **후속 전송이 `backend.start`를
 * 2회째 호출**(새 run·라우팅 소실). 즉 sealed=1 / pre-seal=2 로 갈린다. 이 파일의 §2가 실 sealed
 * 백엔드로 그 1을 실측하고, §1이 라우팅 계약의 결합(close 발화 여부 ↔ start 횟수)을 stub으로 격리한다.
 *
 * ── 하네스 ─────────────────────────────────────────────────────────────────────────
 * §2는 lr4-p01-teardown-window-repro.test.ts의 countingBackend 관례(실 ClaudeCodeBackend를
 * AgentBackend로 감싸 start 호출수 계수) + repro의 theft-시나리오 queryFn + Barrier·fake timer를
 * 결합한다. push 주입은 실제 제품 경로 그대로 `manager.start(...동일 sessionKey)` 로 한다 —
 * RunManager가 이를 `existing.pushFn?.(content)`(=run.push)로 라우팅. 실 SDK 호출 0.
 * §1은 electron-free stub 백엔드/run으로 RunManager 라우팅 계약만 격리(타이머 무관).
 *
 * ⚠️ 테스트만 작성한다 — 02.Source/**·기존 P11 2파일 R only(미변경).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRunManager } from '../../../02.Source/main/00_ipc/agent-runs'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import { IDLE_CLOSE_GRACE_MS } from '../../../02.Source/main/01_agents/claudeAgentRun'
import type { AgentBackend, AgentRun, AgentRunInput, RunResponse } from '../../../02.Source/main/01_agents/AgentBackend'
import type { AgentEvent, AgentEventDone, AgentEventSessionState } from '../../../02.Source/shared/agent-events'

// ── 픽스처 (repro/gap1-p10 미러) ─────────────────────────────────────────────────

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

/** raw session_state_changed 라인(SDK 원시) → claude-stream이 `{type:'session_state', state}`로 정규화. */
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
function doneOrigins(events: AgentEvent[]): Array<'user' | 'cron' | undefined> {
  return dones(events).map((e) => e.origin)
}
function sessionStates(events: AgentEvent[]): AgentEventSessionState[] {
  return events.filter((e): e is AgentEventSessionState => e.type === 'session_state')
}

/** fake timer 하에서 microtask만 순차 flush(타이머 미접촉). */
async function flushMicrotasks(times = 16): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// ── Barrier: 비중첩 랑데부(repro 동형) ────────────────────────────────────────────
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
// §1 — RunManager 라우팅 계약: close 발화 여부 ↔ backend.start 횟수 (stub 격리, 기계 GREEN)
// ══════════════════════════════════════════════════════════════════════════════════
//
// 어댑터 내부 회계와 무관하게 "onSessionClosing이 발화하면 라우팅이 끊긴다"는 RunManager의 결합
// 계약만 격리한다. (a) held-open 세션이 살아있으면 동일 sessionKey 후속 전송이 기존 run으로 라우팅
// (start 1회) — 봉합이 지키려는 불변식. (b) 세션이 조기 close(onSessionClosing 발화)하면 라우팅
// 엔트리가 제거돼 후속 전송이 새 run을 연다(start 2회) — 봉합 前 자율 done 탈취가 유발했던 파급의
// 기전. §2가 실 sealed 백엔드로 (a) 경로가 실제로 성립함을 못박는다.

interface FakeRunHandle {
  run: AgentRun
  pushed: string[]
  fireClosing: () => void
  end: () => void
}

/** electron-free stub AgentRun. events는 end()/abort() 전까지 park(아무 이벤트도 안 냄). */
function makeFakeRun(): FakeRunHandle {
  let closingCb: (() => void) | null = null
  const pushed: string[] = []
  const ended = deferred()
  const run: AgentRun = {
    events: (async function* () {
      await ended.promise
      // 빈 스트림이 의도: end()/abort() 전까지 park, 이후 아무 이벤트 없이 정상 종료.
      // yield* [](빈 이터러블 위임)로 AsyncGenerator 형상은 유지하되 방출 0을 명시한다.
      yield* []
    })(),
    abort() {
      ended.resolve()
    },
    interrupt() {},
    push(content: string) {
      pushed.push(content)
    },
    setOrchestration() {},
    onSessionClosing(cb: () => void) {
      closingCb = cb
    },
    respond(_requestId: string, _response: RunResponse) {},
  }
  return {
    run,
    pushed,
    fireClosing: () => closingCb?.(),
    end: () => ended.resolve(),
  }
}

/** 생성된 stub run을 추적하고 start 호출수를 계수하는 stub 백엔드. */
function makeStubBackend() {
  const runs: FakeRunHandle[] = []
  let startCount = 0
  const backend: AgentBackend = {
    // BackendId 유니온('claude-code' | 'codex')의 유효 리터럴. 이 stub은 엔진 중립이지만
    // AgentBackend.id 타입 정합상 실 BackendId 값이어야 한다(라우팅 계약만 검증, 엔진 무관).
    id: 'claude-code',
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    listSupportedCommands: () => [],
    start: (_req: AgentRunInput) => {
      startCount++
      const h = makeFakeRun()
      runs.push(h)
      return h.run
    },
  }
  return {
    backend,
    runs,
    get startCount() {
      return startCount
    },
    endAll() {
      runs.forEach((r) => r.end())
    },
  }
}

describe('§1 RunManager 라우팅 계약 — close 발화 여부가 backend.start 횟수를 가른다 (stub, GREEN)', () => {
  it('(a) held-open 세션이 살아있으면 동일 sessionKey 후속 전송이 기존 run으로 라우팅 — backend.start 1회', async () => {
    const stub = makeStubBackend()
    const manager = createRunManager()
    const onEvent = (_e: AgentEvent, _runId: string): void => {}
    const KEY = 'route-live-1'

    const runId1 = await manager.start(
      stub.backend,
      { messages: [{ role: 'user', content: 'turn1' }], persistent: true, sessionKey: KEY },
      onEvent,
    )
    await flushMicrotasks()

    // close 미발화 → 세션 라우팅 유효. 후속 전송은 새 세션이 아니라 기존 run.push로 흐른다.
    const runId2 = await manager.start(
      stub.backend,
      { messages: [{ role: 'user', content: 'turn2' }], persistent: true, sessionKey: KEY },
      onEvent,
    )
    await flushMicrotasks()

    const observed = {
      startCount: stub.startCount, // 1 — 재사용
      runIdsStable: runId1 === KEY && runId2 === KEY && runId1 === runId2,
      routedContent: stub.runs[0]?.pushed ?? [], // ['turn2'] — pushFn 라우팅 실증
      runCount: stub.runs.length, // 1 — 단일 held-open run
    }

    stub.endAll()
    manager.closeAll()
    await flushMicrotasks()

    expect(observed).toEqual({
      startCount: 1,
      runIdsStable: true,
      routedContent: ['turn2'],
      runCount: 1,
    })
  })

  it('(b) 조기 close(onSessionClosing 발화) 시 라우팅 소실 → 후속 전송이 새 run — backend.start 2회 (봉합 前 파급 기전)', async () => {
    const stub = makeStubBackend()
    const manager = createRunManager()
    const onEvent = (_e: AgentEvent, _runId: string): void => {}
    const KEY = 'route-closed-1'

    await manager.start(
      stub.backend,
      { messages: [{ role: 'user', content: 'turn1' }], persistent: true, sessionKey: KEY },
      onEvent,
    )
    await flushMicrotasks()

    // 조기 idle-close 시뮬레이션: run이 스스로 접힘을 통지 → RunManager가 persistentRuns에서 원자 제거.
    // (봉합 前엔 자율 done 탈취가 이 발화를 실행 중 세션에서 유발했다 — §2가 sealed에선 불발함을 실측.)
    stub.runs[0].fireClosing()
    await flushMicrotasks()

    // 라우팅 엔트리가 사라졌으므로 동일 sessionKey 후속 전송은 새 held-open 세션을 연다.
    await manager.start(
      stub.backend,
      { messages: [{ role: 'user', content: 'turn2' }], persistent: true, sessionKey: KEY },
      onEvent,
    )
    await flushMicrotasks()

    const observed = {
      startCount: stub.startCount, // 2 — 라우팅 소실로 새 run
      firstRunReceivedNoPush: (stub.runs[0]?.pushed ?? []).length === 0, // 후속 전송이 죽은 run으로 안 감
      runCount: stub.runs.length, // 2 — 세션 중복
    }

    stub.endAll()
    manager.closeAll()
    await flushMicrotasks()

    expect(observed).toEqual({
      startCount: 2,
      firstRunReceivedNoPush: true,
      runCount: 2,
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════════
// §2 — 제품 파급(실 sealed 백엔드): 자율 done 실행 중 도착에도 세션 미제거 → 후속 전송 start 1회
// ══════════════════════════════════════════════════════════════════════════════════
//
// repro의 theft-시나리오 queryFn을 실 ClaudeCodeBackend로 태우되, push 주입/후속 전송은 실제 제품
// 경로 그대로 `manager.start(...동일 sessionKey)`로 한다. 봉합으로 done_A가 cron(무토큰)이라 B pending을
// 탈취하지 못하고 → 실행 중 B 세션에 idle-close grace가 예약되지 않으며 → grace 창을 통째 흘려보내도
// onSessionClosing이 불발 → persistentRuns 엔트리 유지 → 후속 전송이 기존 run 재사용(start 1회).
//
// 봉합 前 대비: 탈취→stale idle grace→만료 close→onSessionClosing 발화→라우팅 제거→후속 전송이
// 새 run(=backend.start 2회, doneOrigins ['user','user'], park가 close로 풀려 closedDuringGrace=true).
// 아래 단정이 sealed에서 start 1회·origins ['user','cron']·close 0을 내면 그 완전 역전이 봉인된다.

describe('§2 제품 파급 — 자율 done 실행 중 도착에도 세션 라우팅 보존 (실 sealed 백엔드, GREEN)', () => {
  it('bootstrap→자율 A(도중 push B)→done_A→running_B→stale idle_A: grace 만료해도 조기 close 0 · 동일 sessionKey 후속 전송 start 총 1회', async () => {
    const barrier = new Barrier()
    const pull: { bDone: boolean | undefined; afterBDone: boolean | undefined } = {
      bDone: undefined,
      afterBDone: undefined,
    }

    // repro와 동형의 theft-시나리오 generator. push('B')/후속 전송은 test가 RunManager 경유로 주입.
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const bootstrap = await inputIter.next() // 초기 메시지 pull
      if (bootstrap.done) return

      // ── bootstrap 턴 ──
      yield ss('running') // running_bootstrap
      yield mkResult('bootstrap') // done_bootstrap — user(초기 token 완료)
      yield ss('idle') // 늦은 idle_bootstrap → grace 예약

      // ── 자율 턴 A(push 없이 시작) — bootstrap grace 흡수/취소 ──
      yield ss('running') // running_A

      await barrier.checkpoint() // #1: test가 manager.start(push 'B') 주입(동일 sessionKey 라우팅)

      // ── 자율 턴 A의 늦은 done ──
      yield mkResult('A') // sealed: cron(무토큰, B token 미탈취) / pre-seal: user(탈취)

      // ── dispatch_B: 큐의 'B' pull ──
      const second = await inputIter.next()
      pull.bDone = second.done

      yield ss('running') // running_B — B 실제 실행 시작
      yield ss('idle') // stale idle_A(이전 턴 늦은 idle)

      // ── 침묵 + park: 다음 입력 pull을 park. grace가 세션을 닫으면 done으로 풀린다(=조기종료). ──
      const third = await inputIter.next()
      pull.afterBDone = third.done
      await barrier.checkpoint() // #2: park 풀린 뒤(close 또는 후속 전송 도착)에만 도달
      if (!third.done) yield mkResult('C-resend') // 후속 전송이 도착했으면 그 턴의 done
    }

    // lr4-p01 미러: 실 ClaudeCodeBackend를 AgentBackend로 감싸 start 호출수 계수.
    const claudeBackend = new ClaudeCodeBackend(queryFn)
    let backendStartCount = 0
    const countingBackend: AgentBackend = {
      id: 'claude-code',
      isAvailable: () => claudeBackend.isAvailable(),
      version: () => claudeBackend.version(),
      latestVersion: () => claudeBackend.latestVersion(),
      start: (req: AgentRunInput) => {
        backendStartCount++
        return claudeBackend.start(req)
      },
      listSupportedCommands: (workspaceRoot) => claudeBackend.listSupportedCommands(workspaceRoot),
    }

    const manager = createRunManager()
    const seen: AgentEvent[] = []
    const onEvent = (event: AgentEvent, _runId: string): void => {
      seen.push(event)
    }
    const KEY = 'conv-p11-companion'

    // ── start #1: bootstrap 세션 개시(backend.start 1회) ──
    const runId1 = await manager.start(
      countingBackend,
      { messages: [{ role: 'user', content: 'bootstrap 턴' }], persistent: true, sessionKey: KEY },
      onEvent,
    )

    // checkpoint#1 도달(running_A까지 처리, bootstrap grace 흡수).
    await barrier.waitForCheckpoint()
    await flushMicrotasks()
    const idleObservedBeforeDispatch = sessionStates(seen).some((e) => e.state === 'idle')

    // ── push B 주입: 제품 경로 그대로 동일 sessionKey manager.start → existing.pushFn('B') ──
    const runId2 = await manager.start(
      countingBackend,
      { messages: [{ role: 'user', content: 'B' }], persistent: true, sessionKey: KEY },
      onEvent,
    )
    await flushMicrotasks()
    barrier.release() // #1 해제 → done_A → pull B → running_B → stale idle_A → park(third)
    await flushMicrotasks()

    // ── grace 창을 통째 흘려보낸다: 봉합 前이라면 만료 재확인이 실행 중 B를 조기 close. ──
    await vi.advanceTimersByTimeAsync(IDLE_CLOSE_GRACE_MS + 50)
    await flushMicrotasks()

    // grace 창 경과 시점 스냅샷(후속 전송 前): sealed면 park 미해제(afterBDone undefined) = 조기 close 0.
    const closedDuringGrace = pull.afterBDone === true
    const startCallsAfterGrace = backendStartCount

    // ── 후속 전송: 동일 sessionKey manager.start. sealed면 held-open 재사용(start 미증가). ──
    const runId3 = await manager.start(
      countingBackend,
      { messages: [{ role: 'user', content: 'C-resend' }], persistent: true, sessionKey: KEY },
      onEvent,
    )
    await flushMicrotasks()

    // ── 스냅샷(전부 정리 前) ──
    const observed = {
      startCallsAfterGrace, // sealed 1 / pre-seal 2(조기 close→라우팅 소실→새 run)
      startCallsAfterResend: backendStartCount, // sealed 1(재사용) / pre-seal 2
      closedDuringGrace, // sealed false(park 유지) / pre-seal true(close가 park 해제)
      bDone: pull.bDone, // false — B는 실제 dispatch됨(sealed/pre-seal 공통 비판별)
      doneOrigins: doneOrigins(seen), // sealed ['user','cron'] / pre-seal ['user','user']
      runIdsStable: runId1 === KEY && runId2 === KEY && runId3 === KEY,
    }

    // 정리(hang 방지): 세션 종료 + 남은 park(#2) 해제.
    manager.closeAll()
    await flushMicrotasks()
    barrier.release()
    await flushMicrotasks()

    // ── 사전 확인(시나리오 유효성) ──
    const seenStates = sessionStates(seen).map((e) => e.state)
    expect(seenStates).toContain('running')
    expect(seenStates).toContain('idle')
    expect(idleObservedBeforeDispatch).toBe(true) // grace 예약 조건이 dispatch_B 전에 성립

    // ── 핵심 단정(제품 파급, sealed GREEN) ──────────────────────────────────────────
    //   봉합 前이었다면 startCalls 1→2 · closedDuringGrace false→true · doneOrigins의 두 번째가
    //   'cron'→'user'로 뒤집혀 아래 toEqual이 전 항목 diff로 RED가 됐을 것.
    expect(observed).toEqual({
      startCallsAfterGrace: 1, // 자율 done 실행 중 도착에도 세션 미제거 → 새 run 0
      startCallsAfterResend: 1, // 동일 sessionKey 후속 전송 = 기존 held-open run 재사용
      closedDuringGrace: false, // 실행 중 B 세션 조기 idle-close 없음
      bDone: false, // B는 실제로 dispatch됨
      doneOrigins: ['user', 'cron'], // bootstrap=user, A=cron(자율·무토큰)
      runIdsStable: true, // 안정 runId(=sessionKey) 재사용 → 라우팅 일관((5))
    })
  })
})
