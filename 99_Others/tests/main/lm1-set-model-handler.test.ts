/**
 * lm1-set-model-handler.test.ts — AGENT_SET_MODEL 경로 단위 테스트 (TDD RED, LM1 P03)
 *
 * 대상(R only — 구현은 main-process Worker 몫):
 *   02.Source/main/00_ipc/agent-runs.ts —
 *     (1) RunManager에 `setModel(runId, model): boolean` 추가(setMode :383-396 미러 —
 *         activeRun의 setModelFn 바인딩 호출, 미존재/완료 runId → false).
 *     (2) ActiveRun에 `setModelFn: (m) => run.setModel?.(m)` 필드 + 바인딩.
 *     (3) 재사용 분기(:212-223) setOrchestrationFn 직후 `if (typeof req.model === 'string')
 *         existing.setModelFn?.(req.model)` 안전망(undefined skip · pushFn 직전 순서).
 *   02.Source/main/00_ipc/handlers/agent.ts — `AGENT_SET_MODEL` invoke 핸들러(untrusted
 *     runId·model string 검증 + KNOWN_MODELS 화이트리스트 → { accepted } 반환). electron
 *     import로 직접 단위 테스트 불가 → 핵심 guard 로직을 추출해 검증(gap1-p13-set-mode-handler
 *     선례 미러 — 핸들러 변경 시 이 미러와 동기화).
 *
 * 계약 핀(영호 확정 2026-07-17 · Phase 03 📐 박제 — 임의 변경 금지):
 *   - main 화이트리스트 = KNOWN_MODELS('opus'|'sonnet'|'haiku'|'fable', run-args.ts:32) 재사용.
 *     모드(LIVE_MODE_WHITELIST 별도 상수)와 달리 모델은 세션생성/라이브 허용 집합이 동일해
 *     신규 상수 0 — 여기서도 run-args의 KNOWN_MODELS를 import해 드리프트를 pin한다.
 *     'gpt-5'·임의 문자열·비-string 전부 거부 → accepted:false + run 위임 0 (CORE-01).
 *   - RunManager.setModel은 **검증된 picker id 원문**을 그대로 run.setModel(model)로 위임한다
 *     — picker→SDK 매핑 없음(모델은 원문 수용, ADR-003 · lm1-live-model-switch P02 핀).
 *   - 전환 *결과*는 응답이 아니라 낙관 반영/자율 fallback 배너로 흐른다 — 이 핸들러 응답은
 *     수락 여부(accepted)만(setMode 관례 미러, 역통지 이벤트 신설 없음).
 *   - **재사용 경로 안전망**(모드엔 없는 1지점 비대칭): 모델은 역통지 이벤트 부재 → 유실 시
 *     자기치유가 필요해, 매 재사용 턴이 setOrchestrationFn 직후·pushFn 직전에 사용자 의도
 *     모델을 재위임한다. 어댑터 change-guard(P02)가 같은 값 no-op이라 평상시 비용 0.
 *
 * 현재(RED) 이유:
 *   - createRunManager() 반환 객체에 setModel이 없다 → 존재/위임/수락 단정 FAIL.
 *   - agent-runs.ts 재사용 분기(:212-223)는 pushFn만 호출하고 req.model을 통째 버린다 →
 *     재사용 안전망 setModelFn 호출 단정 FAIL.
 *   guard 추출 검증(입력 검증 케이스)은 자기완결 로직이라 GREEN(스펙 미러 — 구현 핸들러가
 *   이 guard와 동일해야 한다는 문서 고정 역할, gap1-p13 선례와 동일).
 *
 * 하네스: electron import 0 — 실 createRunManager + mock AgentBackend. 재사용 안전망은
 *   uc1-p01-turn-orchestration.test.ts의 held-open 세션 하네스(블로킹 iterator + 스파이)를
 *   미러 — 타이밍 운이 아니라 코드 경로(agent-runs 라우팅)로 검증을 고정한다.
 * 결정론: 시간 의존은 짧은 setTimeout(done emit·cleanup 정착)뿐 — 외부 IO·네트워크 0.
 */
import { describe, it, expect } from 'vitest'
import { createRunManager } from '../../../02.Source/main/00_ipc/agent-runs'
import type { RunManager } from '../../../02.Source/main/00_ipc/agent-runs'
import type { AgentBackend, AgentRun, AgentRunInput } from '../../../02.Source/main/01_agents/AgentBackend'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'
import type { BackendId } from '../../../02.Source/shared/ipc-contract'
import { KNOWN_MODELS } from '../../../02.Source/main/01_agents/run-args'

// ── 타입 다리 (구현 전 additive 표면 — 구현 후 동일 시그니처로 그대로 호환) ────────

type RunWithSetModel = AgentRun & { setModel?: (modelId: string) => void }
type ManagerWithSetModel = RunManager & { setModel?: (runId: string, model: string) => boolean }

// ── Mock 헬퍼 (gap1-p13-set-mode-handler.test.ts makeModeRun 관례 미러) ────────────

/**
 * holdMs 동안 열려있다가 done을 내는 가짜 run.
 * withSetModel=true(기본)면 setModel 스파이를 싣는다(위임 인자 검증).
 */
function makeModelRun(
  opts: { modelCalls?: string[]; withSetModel?: boolean; holdMs?: number } = {}
): RunWithSetModel {
  const run: RunWithSetModel = {
    events: (async function* () {
      await new Promise<void>((r) => setTimeout(r, opts.holdMs ?? 200))
      yield { type: 'done' } as AgentEvent
    })(),
    abort: () => {},
    interrupt: () => {},
    push: () => {},
    respond: () => {},
  }
  if (opts.withSetModel !== false) {
    run.setModel = (modelId) => {
      opts.modelCalls?.push(modelId)
    }
  }
  return run
}

function backendOf(run: AgentRun): AgentBackend {
  return {
    id: 'claude-code' as BackendId,
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    start: () => run,
    listSupportedCommands: () => [],
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ⑨ RunManager.setModel — 인터페이스 + 위임 + 미존재/완료 no-op (RED)
// ═══════════════════════════════════════════════════════════════════════════════

describe('LM1 P03 ⑨ RunManager.setModel — 라이브 모델 전환 라우팅 (RED)', () => {
  it('createRunManager()가 setModel 메서드를 노출한다', () => {
    const manager = createRunManager() as ManagerWithSetModel
    // RED: 현행 RunManager에 setModel이 없다(undefined).
    expect(typeof manager.setModel).toBe('function')
  })

  it("활성 run → true + run.setModel(model) 위임 — picker id 원문 그대로(매핑 없음, ADR-003)", async () => {
    const modelCalls: string[] = []
    const manager = createRunManager() as ManagerWithSetModel
    const runId = await manager.start(backendOf(makeModelRun({ modelCalls })), { messages: [] }, () => {})

    const accepted = manager.setModel?.(runId, 'haiku')

    expect(accepted).toBe(true)
    // 'haiku'가 'haiku' 그대로 도달 — main에서 SDK 어휘로 변환 금지(모델은 원문 수용).
    expect(modelCalls).toEqual(['haiku'])
  })

  it('미존재 runId → false (no-op, throw 없음)', () => {
    const manager = createRunManager() as ManagerWithSetModel
    expect(manager.setModel?.('nonexistent-run-id', 'haiku')).toBe(false)
  })

  it('완료된 run → false (setMode/taskStop과 동일 no-op 일관성)', async () => {
    const modelCalls: string[] = []
    const manager = createRunManager() as ManagerWithSetModel
    const runId = await manager.start(
      backendOf(makeModelRun({ modelCalls, holdMs: 0 })),
      { messages: [] },
      () => {}
    )
    // done 소비 → 레지스트리 정리까지 대기.
    await new Promise<void>((r) => setTimeout(r, 100))

    expect(manager.setModel?.(runId, 'haiku')).toBe(false)
    expect(modelCalls).toHaveLength(0)
  })

  it('setModel 미구현 run(Echo류) → 수락(true) + throw 없음 (optional chaining no-op — setMode 미러)', async () => {
    const manager = createRunManager() as ManagerWithSetModel
    const runId = await manager.start(
      backendOf(makeModelRun({ withSetModel: false })),
      { messages: [] },
      () => {}
    )

    let accepted: boolean | undefined
    expect(() => {
      accepted = manager.setModel?.(runId, 'sonnet')
    }).not.toThrow()
    // 활성 run에 대한 전환 요청은 수락된다 — 실제 반영 여부는 어댑터(fire-and-forget)가 판단.
    expect(accepted).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT_SET_MODEL 핸들러 guard — untrusted 입력 + KNOWN_MODELS 화이트리스트 (추출 미러)
// ═══════════════════════════════════════════════════════════════════════════════
//
// handlers/agent.ts의 AGENT_SET_MODEL 핸들러와 동일해야 하는 검증 로직(setMode/permission-
// respond 선례). 핸들러가 변경되면 이 함수도 동기화한다.
//
// KNOWN_MODELS 화이트리스트는 **main 핸들러 계층이 강제**한다(CORE-01) — renderer(피커 UI)도
// 같은 4종만 보내지만 untrusted이므로 신뢰하지 않는다. RunManager에는 검증된 값만 도달.

interface SetModelInput {
  runId?: unknown
  model?: unknown
}

interface SetModelDelegate {
  setModel?: (runId: string, model: string) => boolean
}

function handleSetModel(req: SetModelInput, manager: SetModelDelegate): { accepted: boolean } {
  // 입력 검증(untrusted) — runId: string + 비어있음(trim). 불합격 → accepted:false, throw 없음.
  if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') {
    return { accepted: false }
  }
  // model: string + KNOWN_MODELS 밖 전부 거부(임의 문자열의 엔진 모델 주입 차단).
  if (typeof req.model !== 'string' || !(KNOWN_MODELS as readonly string[]).includes(req.model)) {
    return { accepted: false }
  }
  const accepted = manager.setModel?.(req.runId, req.model) === true
  return { accepted }
}

function makeRecordingDelegate(ret: boolean): {
  delegate: SetModelDelegate
  calls: Array<{ runId: string; model: string }>
} {
  const calls: Array<{ runId: string; model: string }> = []
  return {
    delegate: {
      setModel(runId, model) {
        calls.push({ runId, model })
        return ret
      },
    },
    calls,
  }
}

describe('LM1 P03 핸들러 guard — runId 검증 (untrusted)', () => {
  it('② runId가 undefined면 accepted:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleSetModel({ model: 'haiku' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it('② runId가 빈 문자열/공백만이면 accepted:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleSetModel({ runId: '', model: 'haiku' }, delegate)).toEqual({ accepted: false })
    expect(handleSetModel({ runId: '   ', model: 'haiku' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it('② runId가 number(타입 불일치)면 accepted:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleSetModel({ runId: 123, model: 'haiku' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })
})

describe('LM1 P03 핸들러 guard — model KNOWN_MODELS 화이트리스트 (CORE-01)', () => {
  it("④ KNOWN_MODELS 밖('gpt-5' — 미지 엔진 id) → accepted:false + 위임 0건", () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleSetModel({ runId: 'run-1', model: 'gpt-5' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it("④ 임의 문자열('x; rm -rf' — 인젝션류 페이로드) → accepted:false + 위임 0건", () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleSetModel({ runId: 'run-1', model: 'x; rm -rf' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it('③ model이 비-string(객체/undefined/빈 문자열)이면 accepted:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleSetModel({ runId: 'run-1', model: { evil: true } }, delegate)).toEqual({ accepted: false })
    expect(handleSetModel({ runId: 'run-1' }, delegate)).toEqual({ accepted: false })
    expect(handleSetModel({ runId: 'run-1', model: '' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it('① 유효 4종(opus/sonnet/haiku/fable) → 검증된 인자 그대로 위임 + accepted 미러', () => {
    for (const model of KNOWN_MODELS) {
      const { delegate, calls } = makeRecordingDelegate(true)
      expect(handleSetModel({ runId: 'run-abc', model }, delegate)).toEqual({ accepted: true })
      expect(calls).toEqual([{ runId: 'run-abc', model }])
    }
  })

  it("⑤ delegate가 false(미존재/완료 run) → accepted:false (검증 통과해도 라우팅 실패 반영)", () => {
    const { delegate, calls } = makeRecordingDelegate(false)
    // 유효 입력이라 검증은 통과 → 위임 1회 → 그러나 delegate false → accepted:false.
    expect(handleSetModel({ runId: 'run-gone', model: 'haiku' }, delegate)).toEqual({ accepted: false })
    expect(calls).toEqual([{ runId: 'run-gone', model: 'haiku' }])
  })

  it('⑥ 비정상 입력(null·중첩객체·number)에도 throw 금지 — 항상 응답 반환', () => {
    const { delegate } = makeRecordingDelegate(true)
    expect(() => handleSetModel(null as unknown as SetModelInput, delegate)).not.toThrow()
    expect(handleSetModel(null as unknown as SetModelInput, delegate)).toEqual({ accepted: false })
    expect(() => handleSetModel({ runId: {}, model: [] }, delegate)).not.toThrow()
    expect(handleSetModel({ runId: {}, model: [] }, delegate)).toEqual({ accepted: false })
  })
})

describe('LM1 P03 핸들러 guard — 실 RunManager 경유 (RED)', () => {
  it('① happy path — 활성 run 전환 요청이 수락되고 run.setModel에 도달한다 (RED)', async () => {
    const modelCalls: string[] = []
    const manager = createRunManager() as ManagerWithSetModel
    const runId = await manager.start(backendOf(makeModelRun({ modelCalls })), { messages: [] }, () => {})

    // RED: 현행 manager.setModel 부재 → guard의 `=== true` 정규화로 accepted:false.
    const result = handleSetModel({ runId, model: 'haiku' }, manager)
    expect(result).toEqual({ accepted: true })
    expect(modelCalls).toEqual(['haiku'])
  })

  it('⑤ 미존재 runId는 검증을 통과해도 accepted:false(존재 검증 — 임의 통과 0)', () => {
    const manager = createRunManager() as ManagerWithSetModel
    const result = handleSetModel({ runId: 'no-such-run', model: 'sonnet' }, manager)
    expect(result).toEqual({ accepted: false })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ⑦⑧ 재사용 경로 안전망 — held-open 세션 재사용 턴에서 setModelFn 재위임 (RED)
//     하네스: uc1-p01-turn-orchestration.test.ts held-open 세션(블로킹 iterator) 미러.
// ═══════════════════════════════════════════════════════════════════════════════

/** start()마다 만들어지는 세션 기록 — setModel·push 스파이 + 호출 순서 관측 지점. */
interface SessionSpy {
  /** run.setModel(model) 호출 인자 기록 — 안전망 재위임의 직접 증거. */
  setModelCalls: string[]
  /** 후속 턴으로 push된 content 목록. */
  pushedContents: string[]
  /** setModel·push 통합 순서 로그('setModel:*' | 'push:*') — pushFn 직전 순서 관측. */
  orderedCalls: string[]
  run: AgentRun
}

/**
 * 지속세션(held-open) mock backend. start()는 next()가 abort까지 블록하는 run을 반환 —
 * done을 emit하지 않아 세션이 살아있다(재사용 라우팅 조건 `existing && !existing.done` 성립).
 */
function makeSessionBackend(sessions: SessionSpy[]): AgentBackend {
  return {
    id: 'claude-code' as BackendId,
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    listSupportedCommands: () => [],
    start: (): AgentRun => {
      const setModelCalls: string[] = []
      const pushedContents: string[] = []
      const orderedCalls: string[] = []

      let release: (() => void) | null = null
      const iterable: AsyncIterable<AgentEvent> = {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<AgentEvent>> {
              await new Promise<void>((resolve) => {
                release = resolve
              })
              return { value: undefined as unknown as AgentEvent, done: true }
            },
            async return(): Promise<IteratorResult<AgentEvent>> {
              release?.()
              return { value: undefined as unknown as AgentEvent, done: true }
            },
          }
        },
      }

      const run: RunWithSetModel = {
        events: iterable,
        abort: () => {
          release?.()
        },
        interrupt: () => {},
        // 후속 턴 주입 — content(string)만. agent-runs의 pushFn 바인딩이 호출.
        push: (content: string) => {
          pushedContents.push(content)
          orderedCalls.push(`push:${content}`)
        },
        // 라이브 모델 전환 위임 — agent-runs의 setModelFn 바인딩이 재사용 턴에 호출(P03 안전망).
        setModel: (modelId: string) => {
          setModelCalls.push(modelId)
          orderedCalls.push(`setModel:${modelId}`)
        },
        respond: () => {},
      }

      sessions.push({ setModelCalls, pushedContents, orderedCalls, run })
      return run
    },
  }
}

/** 마이크로태스크를 N tick 비운다(백그라운드 소비자가 held-open next()에 진입하도록). */
async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

const SESSION_KEY = 'lm1-p03-sess'

/**
 * 같은 sessionKey로 두 턴을 구동한다:
 *  - 1턴: model='sonnet'로 세션 생성.
 *  - 2턴: secondReq(model 유무)로 start → agent-runs 재사용 라우팅이 기존 세션에 안전망을 탄다.
 * 반환: 생성된 단일 SessionSpy(sessions[0]).
 */
async function driveReuse(
  manager: RunManager,
  backend: AgentBackend,
  sessions: SessionSpy[],
  secondReq: Partial<AgentRunInput>
): Promise<SessionSpy> {
  const onEvent = (): void => {}
  await manager.start(
    backend,
    { messages: [{ role: 'user', content: 'first turn' }], persistent: true, sessionKey: SESSION_KEY, model: 'sonnet' },
    onEvent
  )
  await flushMicrotasks()
  await manager.start(
    backend,
    { messages: [{ role: 'user', content: 'second turn' }], persistent: true, sessionKey: SESSION_KEY, ...secondReq },
    onEvent
  )
  await flushMicrotasks()
  return sessions[0]
}

describe('LM1 P03 재사용 경로 안전망 — 자기치유 재위임 (RED)', () => {
  it('⑦ 재사용 턴에서 req.model=haiku → setModelFn(haiku) 재위임 (pushFn보다 먼저)', async () => {
    const manager = createRunManager()
    const sessions: SessionSpy[] = []
    const backend = makeSessionBackend(sessions)
    try {
      const session = await driveReuse(manager, backend, sessions, { model: 'haiku' })

      // 둘째 start는 새 세션을 만들지 않는다(backend.start 1회) — 기존 held-open 세션으로 라우팅.
      expect(sessions).toHaveLength(1)
      // RED: 현행 재사용 분기(:212-223)는 pushFn만 호출하고 req.model을 통째 버린다 → 위임 0.
      expect(session.setModelCalls).toEqual(['haiku'])
      // 안전망은 pushFn *직전* — push 후 위임이면 그 턴 첫 응답이 옛 모델로 나간다(순서 핀).
      const setModelIdx = session.orderedCalls.indexOf('setModel:haiku')
      const pushIdx = session.orderedCalls.indexOf('push:second turn')
      expect(setModelIdx).toBeGreaterThanOrEqual(0)
      expect(pushIdx).toBeGreaterThanOrEqual(0)
      expect(setModelIdx).toBeLessThan(pushIdx)
    } finally {
      manager.closeAll()
    }
  })

  it('⑧ 재사용 턴에서 req.model undefined → setModelFn 미호출(skip) — pushFn만 (GREEN 핀)', async () => {
    const manager = createRunManager()
    const sessions: SessionSpy[] = []
    const backend = makeSessionBackend(sessions)
    try {
      // model 미전달 → 안전망 skip(undefined는 "기본값 복귀" 오해 차단 — 계약은 required string).
      const session = await driveReuse(manager, backend, sessions, {})

      expect(sessions).toHaveLength(1)
      // 위임 0 — content push만(기존 거동). RED 배선 후에도 undefined skip으로 불변.
      expect(session.setModelCalls).toHaveLength(0)
      expect(session.pushedContents).toEqual(['second turn'])
    } finally {
      manager.closeAll()
    }
  })
})
