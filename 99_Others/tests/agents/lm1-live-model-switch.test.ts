/**
 * lm1-live-model-switch.test.ts — LM1 P02 REPL 진행 중 모델 라이브 전환 (TDD RED)
 *
 * 대상(R only — 구현은 agent-backend Worker 몫):
 *   02.Source/main/01_agents/AgentBackend.ts — AgentRun optional 메서드
 *     `setModel?(modelId: string): void` (setPermissionMode :255 선례 미러 — streaming input
 *     한정·fire-and-forget·no-throw). optional이라 Codex/Echo 어댑터 미구현이 계약 위반 아님.
 *   02.Source/main/01_agents/claudeAgentRun.ts — persistent(held-open) run에서 캡처된 query
 *     핸들의 `setModel(modelId)`로 위임. `_currentModel`(생성 시 `req.model ?? null` 시드) +
 *     구현 순서: ① 비지속 no-op → ② KNOWN_MODELS 밖 no-op → ③ change-guard(같은 값 no-op) →
 *     ④ 갱신 + handle.setModel fire-and-forget → ⑤ reject 시 `_currentModel` 롤백.
 *
 * 계약 핀(영호 확정 2026-07-17 — 임의 변경 금지):
 *   - picker id를 SDK에 **원문 그대로** 전달 — 매핑 테이블 없음(run-args.ts:147-149 선례).
 *     모드(setPermissionMode)와 다르다(모드는 picker id↔SDK 모드 매핑 존재).
 *   - KNOWN_MODELS = 'opus'|'sonnet'|'haiku'|'fable' (run-args.ts:32) 밖은 조용한 no-op.
 *   - change-guard(같은 값 no-op) = 멱등성 — P03 안전망이 매 턴 무조건 호출해도 무해.
 *   - 모델은 역통지 이벤트 부재 → reject 시 `_currentModel` 롤백이 유일한 의도적 비대칭
 *     (모드는 롤백 없음). 롤백의 관측 가능 효과 = 같은 값 재호출 시 다시 위임 시도.
 *
 * 현재(RED) 이유: AgentRun에 setModel 부재(undefined) → 어느 경로에서도 위임 0건.
 *   타입 다리(cast)로 typecheck는 green 유지 — 런타임 위임 단정만 FAIL.
 *
 * 하네스: 실 SDK 호출 0 — mock QueryFn(gap1-p13-live-mode-switch·claudeAgentRun.test.ts 미러).
 * 결정론: 시간 의존은 bounded waitFor 폴링(외부 IO 0) + 이벤트루프 tick 플러시(매크로태스크
 *   순서 보장 — reject .catch 롤백 마이크로태스크 정착용)뿐. 벽시계 의존 0.
 */
import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentRun } from '../../../02.Source/main/01_agents/AgentBackend'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

// ── 타입 다리 (구현 전 additive 표면 — 구현 후 동일 시그니처로 그대로 호환) ────────
type RunWithSetModel = AgentRun & { setModel?: (modelId: string) => void }

// ── SDK 원시 result 픽스처 (기존 스위트 미러 — turn1 → done 정규화 유도) ────────────
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
    session_id: 'sess-lm1',
  }
}

/**
 * setModel 스파이를 실은 held-open mock queryFn (gap1-p13 makeSetModeQueryFn 미러).
 * 반환 객체 = AsyncGenerator + setModel(modelId 기록) — 어댑터가 캡처하는 query 핸들 형상.
 * turn1 이후 입력 pull을 직접 대기 — run.abort()가 입력을 닫으면 종료.
 *
 * opts.rejecting: setModel이 rejected Promise를 반환(fire-and-forget 위임 실패 모의) →
 *   어댑터 `_currentModel` 롤백을 유발. 위임 자체는 호출 시 동기 기록(calls.push)된다.
 */
function makeSetModelQueryFn(calls: string[], opts: { rejecting?: boolean } = {}): QueryFn {
  return (p) => {
    const gen = (async function* () {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')
      // 세션 held-open 유지 — abort가 입력 스트림을 닫을 때까지 대기.
      await inputIter.next()
    })()
    return Object.assign(gen, {
      setModel: (model: string): unknown => {
        calls.push(model)
        // reject 모드: 위임 프로미스가 reject → 어댑터 _currentModel 롤백 경로 유발.
        return opts.rejecting ? Promise.reject(new Error('SDK setModel 거부(모의)')) : undefined
      },
    })
  }
}

/** bounded 폴링 — 외부 IO 0(순수 로컬 상태 predicate). 미충족 시 명시 실패. */
async function waitFor(pred: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (pred()) return
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('waitFor 시간 초과 — predicate 미충족')
}

/**
 * 이벤트루프 tick 플러시(매크로태스크) — pending 마이크로태스크 전량 정착 보장.
 * reject 위임의 `.catch` 롤백(마이크로태스크)이 다음 호출 전에 반영되도록 사이에 끼운다.
 * 벽시계 의존 아님 — setTimeout 매크로태스크는 마이크로태스크 큐 배수 후 실행(순서 보장).
 */
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 5))

// ═══════════════════════════════════════════════════════════════════════════════
// ① 위임 원문 — picker id가 매핑 없이 그대로 SDK 핸들에 전달
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P02 ① persistent run setModel — 원문 위임 (RED)', () => {
  it("persistent run에서 setModel('haiku') → SDK 핸들 setModel 인자 'haiku' 원문 1회", async () => {
    const calls: string[] = []
    const backend = new ClaudeCodeBackend(makeSetModelQueryFn(calls))
    const run = backend.start({
      messages: [{ role: 'user', content: '지속 세션 모델 전환' }],
      persistent: true,
      model: 'sonnet', // 생성 모델 — 전환 대상 'haiku'와 다른 KNOWN_MODEL
    }) as RunWithSetModel

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()
    try {
      // done 관측 = queryFn 호출 완료 후(핸들 캡처 확정) — gap1-p13/p09 선례.
      await waitFor(() => events.some((e) => e.type === 'done'))
      // RED: 현행 AgentRun 계약에 setModel 부재(undefined).
      expect(typeof run.setModel).toBe('function')
      run.setModel?.('haiku')
      await tick()
    } finally {
      run.abort()
      await consume
    }

    // RED: setModel undefined(optional chaining no-op) → 위임 0건.
    // picker id를 SDK 원문 그대로 — 매핑 테이블 없음(모드 전환과의 대비 핀).
    expect(calls).toEqual(['haiku'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ② 비-persistent(단발) run — 조용한 no-op (SDK streaming-input 한정 함정 방어)
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P02 ② 단발 run setModel — 위임 0 no-op (RED: 존재 단정)', () => {
  it('메서드 존재 + 호출 예외 없음(멱등) + query 핸들 위임 0건', async () => {
    const calls: string[] = []
    let pumpStarted = false
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })

    const queryFn: QueryFn = () => {
      const gen = (async function* () {
        pumpStarted = true
        await gate // 스트림 진행 중 창을 열어 둔다 — 이 사이 setModel 호출
        yield mkResult('single')
      })()
      return Object.assign(gen, {
        setModel: (model: string): void => {
          calls.push(model)
        },
      })
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '단발 실행' }],
      model: 'sonnet', // persistent 미전달 — 단발 경로
    }) as RunWithSetModel

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    try {
      await waitFor(() => pumpStarted)
      // RED: 현행 AgentRun 계약에 setModel 부재(undefined).
      expect(typeof run.setModel).toBe('function')
      expect(() => {
        run.setModel?.('haiku')
        run.setModel?.('haiku') // 멱등 — 재호출 안전
      }).not.toThrow()
    } finally {
      release()
      await consume
    }

    // 단발 경로는 SDK 미지원(streaming input 한정) — 핸들이 캡처돼 있어도 위임 0.
    expect(calls).toHaveLength(0)
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ③ change-guard — 같은 값 no-op(멱등). ⓐ 생성 모델과 동일 · ⓑ 전환 후 재호출
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P02 ③ change-guard — 같은 값 위임 0 (RED)', () => {
  it('ⓐ 생성 모델과 같은 값 호출 위임 0 · ⓑ 전환 성공 후 재호출 위임 총 1회 유지', async () => {
    // ⓐ req.model='haiku'로 시드된 세션에 setModel('haiku') → change-guard no-op(위임 0).
    {
      const calls: string[] = []
      const backend = new ClaudeCodeBackend(makeSetModelQueryFn(calls))
      const run = backend.start({
        messages: [{ role: 'user', content: '동일 모델 재요청' }],
        persistent: true,
        model: 'haiku',
      }) as RunWithSetModel
      const events: AgentEvent[] = []
      const consume = (async () => {
        for await (const e of run.events) events.push(e)
      })()
      try {
        await waitFor(() => events.some((e) => e.type === 'done'))
        // _currentModel 시드('haiku')와 동일 → change-guard가 삼킴.
        run.setModel?.('haiku')
        await tick()
      } finally {
        run.abort()
        await consume
      }
      // 위임 0(멱등) — GREEN 대조군(RED에서도 [] 이므로 통과, ⓑ가 RED 앵커).
      expect(calls).toHaveLength(0)
    }

    // ⓑ 'sonnet'→'haiku' 전환 성공 후 'haiku' 재호출 → change-guard로 위임 총 1회 유지.
    {
      const calls: string[] = []
      const backend = new ClaudeCodeBackend(makeSetModelQueryFn(calls))
      const run = backend.start({
        messages: [{ role: 'user', content: '전환 후 동일값 재호출' }],
        persistent: true,
        model: 'sonnet',
      }) as RunWithSetModel
      const events: AgentEvent[] = []
      const consume = (async () => {
        for await (const e of run.events) events.push(e)
      })()
      try {
        await waitFor(() => events.some((e) => e.type === 'done'))
        run.setModel?.('haiku') // #1 — 전환(위임)
        await tick()
        run.setModel?.('haiku') // #2 — change-guard no-op(resolve mock: _currentModel 유지)
        await tick()
      } finally {
        run.abort()
        await consume
      }
      // RED: setModel undefined → calls===[] → ['haiku'](총 1회) 기대와 불일치.
      expect(calls).toEqual(['haiku'])
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ④ 미지 id(KNOWN_MODELS 밖) — 조용한 no-op (allowlist 이중 방어)
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P02 ④ 미지 모델 id — 위임 0 (RED)', () => {
  it("KNOWN_MODELS 밖('gpt-5' 등)은 걸러지고 유효 id('haiku')만 위임된다", async () => {
    const calls: string[] = []
    const backend = new ClaudeCodeBackend(makeSetModelQueryFn(calls))
    const run = backend.start({
      messages: [{ role: 'user', content: '미지 모델 필터' }],
      persistent: true,
      model: 'sonnet',
    }) as RunWithSetModel
    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()
    try {
      await waitFor(() => events.some((e) => e.type === 'done'))
      run.setModel?.('gpt-5') // KNOWN_MODELS 밖 → no-op
      run.setModel?.('claude') // 접두만 유사한 미지 id → no-op
      run.setModel?.('haiku') // KNOWN_MODEL, 생성값과 다름 → 위임
      await tick()
    } finally {
      run.abort()
      await consume
    }
    // RED: setModel undefined → calls===[]. GREEN: 미지 id는 걸러지고 유효 id만 통과.
    // 블랭킷 no-op이 아니라 "미지 id만" 걸러짐을 유효 id 통과로 대조 증명.
    expect(calls).toEqual(['haiku'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ⑤ 핸들 미캡처 시점 — 조용한 no-op·no-throw (setPermissionMode 대조군 미러)
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P02 ⑤ 핸들 미캡처 호출 — no-op·no-throw (GREEN 핀)', () => {
  it('queryFn 호출 전(펌프 시작 전) setModel 호출은 조용히 삼킨다(throw 금지)', async () => {
    const backend = new ClaudeCodeBackend(makeSetModelQueryFn([]))
    const run = backend.start({
      messages: [{ role: 'user', content: '즉시 전환 시도' }],
      persistent: true,
      model: 'sonnet',
    }) as RunWithSetModel
    // start() 직후 = 펌프가 아직 queryFn을 호출하기 전일 수 있는 시점(핸들 미캡처).
    expect(() => run.setModel?.('haiku')).not.toThrow()
    run.abort()
    for await (const e of run.events) void e // 좀비 0 — 스트림 자연종료까지 소진
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ⑥ reject 롤백 — 유일한 의도적 비대칭(모드는 롤백 없음). 재호출 시 재위임
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P02 ⑥ reject 롤백 — 재호출 재위임 (RED)', () => {
  it("핸들 setModel reject 시 같은 값('haiku') 재호출이 다시 위임된다(총 2회)", async () => {
    const calls: string[] = []
    const backend = new ClaudeCodeBackend(makeSetModelQueryFn(calls, { rejecting: true }))
    const run = backend.start({
      messages: [{ role: 'user', content: '위임 실패 롤백' }],
      persistent: true,
      model: 'sonnet',
    }) as RunWithSetModel
    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()
    try {
      await waitFor(() => events.some((e) => e.type === 'done'))
      run.setModel?.('haiku') // #1 — 위임 후 reject → _currentModel 롤백(이전 값 복귀)
      await tick() // reject .catch 롤백 마이크로태스크 정착 대기
      run.setModel?.('haiku') // #2 — 롤백 덕에 change-guard 통과 → 재위임
      await tick()
    } finally {
      run.abort()
      await consume
    }
    // RED: setModel undefined → calls===[] → 2건 기대와 불일치.
    // 대조(③ⓑ resolve mock): reject 없으면 재호출은 change-guard로 총 1회 유지.
    // = _currentModel 롤백의 관측 가능 효과(다음 턴 재시도가 살아남).
    expect(calls).toEqual(['haiku', 'haiku'])
  })
})
