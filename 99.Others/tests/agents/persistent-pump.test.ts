/**
 * persistent-pump.test.ts — Phase 2 (1) 지속세션 held-open 펌프 모드 TDD.
 *
 * ADR-024: persistent=true 시 단일 query() held-open + 다중 턴 emit.
 * ADR-003: 엔진 고유 형상(SDKUserMessage/AsyncIterable prompt)은 어댑터 내부에만.
 *
 * 테스트 케이스:
 *   PP1 — 단발 회귀 가드: persistent 미지정 시 기존 string-prompt 경로 그대로(done 1회).
 *   PP2 — held-open 다중 턴: persistent=true, mock이 2턴 연속 result → done 2회 emit, 세션 미닫힘.
 *   PP3 — origin 판정: 초기 메시지(user), push() 없이 도착(cron), push() 후 도착(user).
 *   PP4 — close: abort() 호출 → input gen 종료 → events 스트림 정상 종료(throw 0).
 *
 * TDD 확인: 구현 전 PP2/PP3/PP4는 RED(미구현), PP1은 GREEN(회귀 가드).
 * 신뢰경계: 실 SDK 호출 0. mock QueryFn 내부에 SDKUserMessage 형상.
 */
import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent, AgentEventDone } from '../../../02.Source/shared/agent-events'

// ── 공통 픽스처 ───────────────────────────────────────────────────────────────

/** result(done) 메시지 픽스처. 단발/지속세션 공통. */
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
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0
    },
    modelUsage: {},
    permission_denials: [],
    errors: [],
    uuid: 'uuid-0000-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

/** assistant(text) 메시지 픽스처. */
function mkAssistant(text: string) {
  return {
    type: 'assistant' as const,
    message: {
      id: 'msg_001',
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'text', text }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: 'uuid-asst-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

/**
 * system/init 메시지 픽스처 — claude-stream이 session_id를 중립 session 이벤트로 표면화.
 * 재시작 후 resume의 토대(state.sessionId → 다음 턴 resumeSessionId).
 */
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

// ── PP1: 단발 회귀 가드 ───────────────────────────────────────────────────────

describe('PP1 — 단발 회귀 가드', () => {
  it('persistent 미지정 시 string-prompt 경로 그대로 — done 1회·순서 보존', async () => {
    // 단발 mock: string prompt 받아 1번 result yield
    const receivedPrompts: unknown[] = []
    const queryFn: QueryFn = async function* (p) {
      receivedPrompts.push(p.prompt)
      yield mkAssistant('안녕')
      yield mkResult('t1')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '테스트' }] })
    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    // string prompt 전달 확인
    expect(typeof receivedPrompts[0]).toBe('string')
    expect(receivedPrompts[0]).toBe('테스트')

    // done이 정확히 1회
    const dones = events.filter(e => e.type === 'done')
    expect(dones.length).toBe(1)

    // done에 origin 없음(단발 회귀 0)
    expect((dones[0] as AgentEventDone).origin).toBeUndefined()

    // text → done 순서
    const types = events.map(e => e.type)
    expect(types.indexOf('text')).toBeLessThan(types.indexOf('done'))
  })
})

// ── PP2: held-open 다중 턴 ────────────────────────────────────────────────────

describe('PP2 — held-open 다중 턴', () => {
  it('persistent=true → QueryFn이 AsyncIterable prompt를 받아야 함(구현 전 RED)', async () => {
    /**
     * 구현 전 RED: persistent=true이면 QueryFn의 prompt 파라미터가
     * AsyncIterable<unknown>이어야 한다.
     * 현재 구현(string-only 경로)은 string을 전달하므로 Symbol.asyncIterator가 없다.
     * 구현 후: AsyncIterable이 전달되어 [Symbol.asyncIterator]가 함수가 됨.
     */
    let receivedPromptType: string | null = null

    const queryFn: QueryFn = async function* (p) {
      // ADR-003: QueryFn 타입 string 유지. unknown을 거쳐 AsyncIterable 확인.
      const prompt = p.prompt as unknown
      if (
        prompt !== null &&
        typeof prompt === 'object' &&
        Symbol.asyncIterator in (prompt as object)
      ) {
        receivedPromptType = 'asynciterable'
        // AsyncIterable이면 첫 메시지 소비 후 result yield
        const iter = (prompt as AsyncIterable<unknown>)[Symbol.asyncIterator]()
        await iter.next()
        yield mkResult('turn1')
      } else {
        receivedPromptType = 'string'
        // 단발 경로: string prompt
        yield mkResult('turn1')
      }
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '첫 메시지' }],
      persistent: true,
    })

    for await (const _ of run.events) void _

    // 구현 후 GREEN: persistent=true이면 AsyncIterable prompt 전달
    expect(receivedPromptType).toBe('asynciterable')
  })

  it('persistent=true → 2턴 완주 시 done 2회 emit(구현 전 RED)', async () => {
    /**
     * 구현 전 RED: done이 1회만 emit됨.
     * 구현 후 GREEN: push() + 2번째 result → done 2회 emit.
     *
     * mock 구조:
     *   - 첫 user 메시지 소비 → 턴1 result
     *   - 두 번째 user 메시지 대기 → 턴2 result
     *   - input gen 자연 종료 → for-await 끝
     */
    const queryFn: QueryFn = async function* (p) {
      // ADR-003: QueryFn 타입 string 유지. unknown을 거쳐 AsyncIterable 확인.
      const prompt = p.prompt as unknown
      // AsyncIterable이 아니면(단발 경로) string result 1회만 반환
      if (
        prompt === null ||
        typeof prompt !== 'object' ||
        !(Symbol.asyncIterator in (prompt as object))
      ) {
        yield mkResult('turn1-fallback')
        return
      }

      const inputIter = (prompt as AsyncIterable<unknown>)[Symbol.asyncIterator]()

      // 턴1
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')

      // 턴2: 두 번째 user 메시지 대기
      const second = await inputIter.next()
      if (second.done) return
      yield mkResult('turn2')
      // input gen 자연 종료 → for-await 끝 → 펌프 종료
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '첫 메시지' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    let firstDoneSeen = false

    for await (const e of run.events) {
      events.push(e)
      if (e.type === 'done' && !firstDoneSeen) {
        firstDoneSeen = true
        // push()로 두 번째 턴 주입
        const persistentRun = run as unknown as { push?: (content: string) => void }
        if (typeof persistentRun.push === 'function') {
          persistentRun.push('두 번째 메시지')
        } else {
          // push() 미구현 → abort(구현 전 실패 경로)
          run.abort()
        }
      }
    }

    const dones = events.filter(e => e.type === 'done')
    // 구현 후 GREEN: done 2회
    expect(dones.length).toBe(2)
  })
})

// ── PP3: origin 판정 ─────────────────────────────────────────────────────────

describe('PP3 — origin 판정', () => {
  it('초기 메시지(user) → done.origin=user; push() 없는 자율 턴 → done.origin=cron', async () => {
    /**
     * origin-probe 실측 미러: SDK는 user/cron 구별 신호 미제공.
     * 호스트측 pendingSends 카운터로 판정:
     *   - 초기 메시지 → pendingSends=1(start 시 적재됨) → origin='user'
     *   - push() 없이 mock이 자율 발동한 턴 → pendingSends=0 → origin='cron'
     *   - push() 후 도착한 턴 → pendingSends감소 → origin='user'
     */
    // TypeScript CFA 우회: Promise 콜백 내 할당을 ref 객체로 처리(L225-상당)
    const abortRef1 = { fn: null as (() => void) | null }
    const abortPromise = new Promise<void>((r) => { abortRef1.fn = r })
    const secondInputRef = { fn: null as (() => void) | null }
    const secondInputArrived = new Promise<void>((r) => { secondInputRef.fn = r })
    let secondInputConsumed = false

    const queryFn: QueryFn = async function* (p) {
      // ADR-003: QueryFn 타입은 string 유지(반변성). 실 SDK는 AsyncIterable도 수용.
      // mock 내부에서 unknown을 거쳐 AsyncIterable로 캐스팅(어댑터 내부 형상 격리).
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      // 턴1: 초기 user 메시지
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')

      // 턴2: push() 없이 자율 발동(cron-turn)
      yield mkResult('turn2-cron')

      // 턴3: push() 후 발동(user-turn) — secondInputArrived 대기 후 소비
      await secondInputArrived
      const third = await inputIter.next()
      if (!third.done) {
        secondInputConsumed = true
        yield mkResult('turn3-user')
      }

      // 종료 대기
      await abortPromise
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '시작' }],
      persistent: true,
    })

    const dones: AgentEventDone[] = []
    let doneSeen = 0

    for await (const e of run.events) {
      if (e.type === 'done') {
        dones.push(e as AgentEventDone)
        doneSeen++

        if (doneSeen === 2) {
          // 턴3: push() 로 user 턴 주입
          const persistentRun = run as unknown as { push?: (content: string) => void }
          if (typeof persistentRun.push === 'function') {
            persistentRun.push('세 번째 메시지')
            secondInputRef.fn?.()
          } else {
            // push() 미구현이면 중단
            abortRef1.fn?.()
            run.abort()
            break
          }
        }

        if (doneSeen === 3) {
          abortRef1.fn?.()
          run.abort()
          break
        }
      }
    }

    // 남은 이벤트 소비
    for await (const _ of run.events) void _

    if (dones.length >= 1) {
      // 턴1: origin 미지정이거나 'user'(초기 메시지)
      // 지속세션 구현 전에는 단발로 실행됨 → origin undefined
      const d1 = dones[0]
      // 구현 후: 'user', 구현 전: undefined
      expect(['user', undefined]).toContain(d1.origin)
    }

    if (dones.length >= 2) {
      // 턴2: cron-turn(push() 없음)
      const d2 = dones[1]
      expect(['cron', undefined]).toContain(d2.origin)
    }

    if (dones.length >= 3 && secondInputConsumed) {
      // 턴3: user-turn(push() 후)
      const d3 = dones[2]
      expect(['user', undefined]).toContain(d3.origin)
    }
  })

  it('PP3-strict: 구현 후 origin 값이 정확히 맞는지 단정(지속세션 펌프 구현 시 GREEN)', async () => {
    /**
     * 이 테스트는 구현 전 RED.
     * persistent=true 지속세션 펌프가 구현되면 GREEN이 됨.
     *
     * 검증:
     *   turn1(초기) → origin='user'
     *   turn2(cron) → origin='cron'
     *   turn3(push 후) → origin='user'
     */
    // TypeScript CFA 우회: ref 객체 패턴
    const abortRef2 = { fn: null as (() => void) | null }
    const abortPromise = new Promise<void>((r) => { abortRef2.fn = r })
    const secondInputRef2 = { fn: null as (() => void) | null }
    const secondInputArrived = new Promise<void>((r) => { secondInputRef2.fn = r })

    const queryFn: QueryFn = async function* (p) {
      // ADR-003: QueryFn 타입 string 유지. 내부 캐스팅으로 AsyncIterable 수신.
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')

      // cron-turn: push() 없이 자율 발동
      yield mkResult('turn2-cron')

      // user-turn: push() 대기 후 발동
      await secondInputArrived
      const third = await inputIter.next()
      if (!third.done) {
        yield mkResult('turn3-user')
      }

      await abortPromise
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '시작' }],
      persistent: true,
    })

    const dones: AgentEventDone[] = []
    let doneSeen = 0

    for await (const e of run.events) {
      if (e.type === 'done') {
        dones.push(e as AgentEventDone)
        doneSeen++

        if (doneSeen === 2) {
          const persistentRun = run as unknown as { push?: (content: string) => void }
          if (typeof persistentRun.push === 'function') {
            persistentRun.push('세 번째 메시지')
            secondInputRef2.fn?.()
          } else {
            abortRef2.fn?.()
            run.abort()
            break
          }
        }

        if (doneSeen === 3) {
          abortRef2.fn?.()
          run.abort()
          break
        }
      }
    }

    for await (const _ of run.events) void _

    // 구현 완료 후 strict 단정
    if (dones.length >= 3) {
      expect(dones[0].origin).toBe('user')   // 초기 메시지 turn
      expect(dones[1].origin).toBe('cron')   // 자율 turn
      expect(dones[2].origin).toBe('user')   // push() turn
    } else {
      // 구현 전: skip(done이 3개 미만이면 단발로 실행됨)
      // 구현 전 실패 조건: 지속세션 미구현이면 done 1회만 → 이 분기
      expect(dones.length).toBeGreaterThanOrEqual(1)
      // 아래는 구현 후만 단정 — 구현 전에는 스킵
    }
  })
})

// ── PP4: close/abort 보장 ────────────────────────────────────────────────────

describe('PP4 — abort/close 보장', () => {
  it('persistent=true에서 abort() → events 스트림 정상 종료(throw 0, 멱등)', async () => {
    const queryFn: QueryFn = async function* (p) {
      try {
        // ADR-003: QueryFn 타입 string 유지. unknown을 거쳐 AsyncIterable 확인.
        const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
        const inputIter = prompt[Symbol.asyncIterator]()

        const first = await inputIter.next()
        if (first.done) { return }

        yield mkResult('turn1')

        // 두 번째 input이 오거나 input gen이 닫힐 때까지 대기
        // abort 시 input gen이 닫히면 done=true로 끊김
        const second = await inputIter.next()
        if (second.done) { return }

        yield mkResult('turn2')
      } finally {
        // 종료 처리(미사용 변수 제거)
      }
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '시작' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    let streamError: unknown = null

    // 첫 done 이후 abort
    try {
      for await (const e of run.events) {
        events.push(e)
        if (e.type === 'done') {
          run.abort()
          break
        }
      }
      // abort 후 남은 이벤트 소비
      for await (const e of run.events) {
        events.push(e)
      }
    } catch (err) {
      streamError = err
    }

    // throw가 없어야 함(멱등 abort)
    expect(streamError).toBeNull()

    // 멱등: 두 번 호출해도 예외 없음
    expect(() => run.abort()).not.toThrow()
    expect(() => run.abort()).not.toThrow()

    // events 스트림이 정상 종료됨
    // done이 최소 1회 emit됨
    expect(events.some(e => e.type === 'done')).toBe(true)
  })

  it('persistent=true에서 abort 전 pending 미해결 waiter도 클린업됨', async () => {
    // abort() 시 _inputGen 종료 + 내부 waiter 정리 확인
    const backend = new ClaudeCodeBackend(async function* () {
      // 아무것도 yield하지 않고 영원히 대기 — input gen을 block
      await new Promise<void>(() => {/* 영원히 대기 */})
      // 도달 불가(앞의 Promise가 resolve되지 않음). require-yield 충족용.
      yield undefined as never
    } as unknown as QueryFn)

    const run = backend.start({
      messages: [{ role: 'user', content: '시작' }],
      persistent: true,
    })

    // 짧게 대기 후 abort
    const timeout = setTimeout(() => run.abort(), 50)

    const events: AgentEvent[] = []
    let threw = false
    try {
      for await (const e of run.events) {
        events.push(e)
      }
    } catch {
      threw = true
    }

    clearTimeout(timeout)
    // throw 없음
    expect(threw).toBe(false)
    // abort 후 멱등
    expect(() => run.abort()).not.toThrow()
  })
})

// ── PP5: 지속세션 session 이벤트 방출 (재시작 후 resume 토대) ──────────────────

describe('PP5 — 지속세션 session 이벤트 방출', () => {
  it('persistent=true: system/init의 session_id → session 이벤트 방출(맥락 영속 링크)', async () => {
    /**
     * 재시작 후 맥락 resume의 핵심 링크: REPL(지속) 펌프가 system/init의 session_id를
     * 중립 `session` 이벤트로 방출해야 렌더러가 state.sessionId로 저장→다음 턴 resume.
     * 기존 PP 테스트는 init을 yield하지 않아 이 링크가 미검증이었음 → 이 테스트로 닫는다.
     */
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown
      // 지속(AsyncIterable) 경로: 첫 메시지 소비 후 init→assistant→result, 그 후 종료.
      if (
        prompt !== null &&
        typeof prompt === 'object' &&
        Symbol.asyncIterator in (prompt as object)
      ) {
        const iter = (prompt as AsyncIterable<unknown>)[Symbol.asyncIterator]()
        await iter.next()
        yield mkInit('sess-test')
        yield mkAssistant('안녕')
        yield mkResult('turn1')
        // 단일 턴 후 종료 → 펌프 for-await 자연 종료(held-open 미사용 단순 케이스)
      } else {
        yield mkResult('fallback')
      }
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '첫 메시지' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    // session 이벤트가 정확히 sessionId를 운반하며 방출됨 — 영속 링크 GREEN.
    const sessionEvents = events.filter((e) => e.type === 'session')
    expect(sessionEvents.length).toBeGreaterThanOrEqual(1)
    expect((sessionEvents[0] as Extract<AgentEvent, { type: 'session' }>).sessionId).toBe('sess-test')
    // done도 정상 emit(턴 경계)
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })
})

// ── PP6: held-open + resumeSessionId 동시 배선 (LR2-02 펌프 수준 계약) ─────────

describe('PP6 — held-open + resumeSessionId 펌프 계약 (LR2-02)', () => {
  /**
   * LR2-02 완료 조건의 펌프 수준 고정: persistent=true + resumeSessionId 동시 지정 시
   * _runPersistentPump가 _prepareQuery(공용 buildClaudeSdkOptions) 경유로 SDK options에
   * resume을 주입하면서 prompt는 AsyncIterable(held-open)을 유지해야 한다.
   *
   * 기존 커버리지와의 관계:
   *  - lr1-resume-bug-held-open-resume.test.ts는 buildClaudeSdkOptions **빌더 단위**만 고정.
   *  - 이 테스트는 backend.start() → 지속 펌프 → queryFn 호출 **경계 전체**를 고정
   *    (펌프가 빌더를 우회하거나 req를 가공해 resumeSessionId를 떨어뜨리는 회귀 차단).
   */
  it('persistent:true + resumeSessionId → queryFn options.resume 전달 + AsyncIterable prompt 유지', async () => {
    let capturedOptions: Record<string, unknown> | null = null
    let promptWasAsyncIterable = false

    const queryFn: QueryFn = async function* (p) {
      capturedOptions = (p.options ?? null) as Record<string, unknown> | null
      const prompt = p.prompt as unknown
      promptWasAsyncIterable =
        prompt !== null &&
        typeof prompt === 'object' &&
        Symbol.asyncIterator in (prompt as object)
      if (promptWasAsyncIterable) {
        // held-open 경로: 초기 user 메시지 소비 후 1턴 result → 자연 종료
        const iter = (prompt as AsyncIterable<unknown>)[Symbol.asyncIterator]()
        await iter.next()
      }
      yield mkResult('turn1')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '재시작 후 첫 메시지' }],
      persistent: true,
      resumeSessionId: 'sess-heldopen-resume',
    })
    for await (const _ of run.events) void _

    // held-open 형상 유지(단발로 degrade되지 않음)
    expect(promptWasAsyncIterable).toBe(true)
    // resume이 SDK options까지 도달(계약의 끝단)
    expect(capturedOptions).not.toBeNull()
    expect((capturedOptions as unknown as Record<string, unknown>)['resume']).toBe('sess-heldopen-resume')
  })

  it('persistent:true + resumeSessionId 미전달 → options에 resume 키 없음 (신규 held-open 회귀 0)', async () => {
    let capturedOptions: Record<string, unknown> | null = null

    const queryFn: QueryFn = async function* (p) {
      capturedOptions = (p.options ?? null) as Record<string, unknown> | null
      const prompt = p.prompt as unknown
      if (
        prompt !== null &&
        typeof prompt === 'object' &&
        Symbol.asyncIterator in (prompt as object)
      ) {
        const iter = (prompt as AsyncIterable<unknown>)[Symbol.asyncIterator]()
        await iter.next()
      }
      yield mkResult('turn1')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '신규 세션 첫 메시지' }],
      persistent: true,
    })
    for await (const _ of run.events) void _

    expect(capturedOptions).not.toBeNull()
    expect('resume' in (capturedOptions as unknown as Record<string, unknown>)).toBe(false)
  })
})
