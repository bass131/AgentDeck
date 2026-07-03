/**
 * uc1-p01-turn-orchestration.test.ts — UC1 Phase 01: 턴별 orchestration 미반영 재현(TDD RED)
 * + 현행 G4 deny 회귀 고정 + sdkOptions 스냅샷 박제.
 *
 * ─ 배경(00.Documents/ADR.md §ADR-032) ────────────────────────────────────────
 * UltraCode(orchestration)는 held-open 지속세션(REPL, ADR-024)에서 "세션 생성 시 고정"된다.
 * ClaudeCodeBackend.start(req)가 세션을 열 때 `permissionCoordinator.makeCanUseTool(mode,
 * orchestration)`으로 canUseTool 게이트를 *한 번* 만들어 SDK query에 넘기고, 같은 sessionKey의
 * 후속 턴은 새 query가 아니라 `run.push(content)`(AgentRun.push — content: string만 운반)로
 * 입력 스트림에 주입된다. 그런데 `agent-runs.ts` start()의 라우팅(L154~162)은 후속 턴에서
 * `existing.pushFn?.(content)`만 호출하고 `req.orchestration`은 통째로 버린다 — 즉 대화 중간에
 * UltraCode를 켜도/꺼도 그 세션의 권한 표면(canUseTool 게이트)에 영영 반영되지 않는다.
 *
 * ─ 이 파일의 3역할 ──────────────────────────────────────────────────────────────
 *  (a) 후속 턴 orchestration 미반영 **재현**(양방향) — `it.fails`로 RED 박제.
 *      ⓐ-1 첫 턴 OFF → 후속 턴 ON: 후속 ON 턴의 Workflow 호출이 승인 게이트(permission_request)로
 *          가야 하나, 게이트가 세션 생성 시 OFF로 고정돼 즉시 deny(반영 안 됨).
 *      ⓐ-2 첫 턴 ON → 후속 턴 OFF: 후속 OFF 턴의 Workflow 호출이 G4 즉시 deny로 **재봉인**돼야
 *          하나, 게이트가 ON으로 래치돼 permission_request를 발화(권한 표면 ON 래치).
 *      → P03이 배선을 고치면 두 `it.fails`가 (통과해버려) 뒤집힌다 = `.fails` 제거가 GREEN 증거.
 *  (b) G4 deny **회귀 고정**(GREEN·불변) — orchestration=false 게이트의 Workflow는 permission_request
 *      0 + 즉시 deny. (기존 커버: 99.Others/tests/agents/permissionCoordinator.test.ts L117~137
 *      "Workflow 게이트" describe + orchestration-permission-gate.test.ts G4 — 이 파일은 done-judge
 *      자족성을 위해 같은 불변을 재고정한다.)
 *  (c) sdkOptions **스냅샷 박제** — [UC1-P02 갱신] P01 당시엔 buildClaudeSdkOptions가
 *      orchestration=false에서 `disallowedTools:['Workflow']`를 넣는 현행을 단언으로 고정했었다.
 *      P02(agent-backend)가 disallowedTools 계산을 완전히 제거하고(Workflow 상시 노출,
 *      ADR-032 ④) `ORCHESTRATION_SYSTEM_GUIDE`를 orchestration 값과 무관하게 상시 합성하도록
 *      바꿨으므로, 이 절의 단언도 **새 스펙**(disallowedTools 부재 + 가이드 상시 합성)으로
 *      교체됐다 — 케이스 삭제 없이 기대값만 뒤집었다.
 *
 * ─ 결정론(함정 회피) ────────────────────────────────────────────────────────────
 * 실 SDK 없음(라이브는 P06). mock AgentBackend가 실 `PermissionCoordinator`로 게이트를 세션 생성
 * 시점에 고정(= SDK held-open 세션의 session-fixed canUseTool 미러)하고, 실 `createRunManager`로
 * 후속 턴 라우팅(push)을 그대로 구동한다 — 타이밍 운이 아니라 코드 경로로 재현이 고정된다.
 * (a)/(b)절과 (a)-setup은 P01이 만든 mock 하네스 그대로(0줄 수정) — P02는 (c)절 단언만 갱신.
 */

import { describe, it, expect } from 'vitest'
import { createRunManager } from '../../../02.Source/main/00_ipc/agent-runs'
import {
  PermissionCoordinator,
  type CanUseToolFn,
} from '../../../02.Source/main/01_agents/permissionCoordinator'
import { buildClaudeSdkOptions, ORCHESTRATION_SYSTEM_GUIDE } from '../../../02.Source/main/01_agents/sdkOptions'
import type {
  AgentBackend,
  AgentRun,
  AgentRunInput,
} from '../../../02.Source/main/01_agents/AgentBackend'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'
import type { BackendId } from '../../../02.Source/shared/ipc-contract'

// ── mock 세션 하네스 ─────────────────────────────────────────────────────────────
//
// 실 SDK held-open 세션의 두 성질을 미러한다:
//  1. canUseTool 게이트는 **세션 생성(start) 시점의 orchestration으로 고정**된다.
//  2. 후속 턴 주입 통로 `push(content)`는 content(string)만 받는다 — orchestration 전달 채널 없음.
// 이 두 성질이 겹쳐, 후속 턴의 orchestration이 게이트에 반영될 구조적 경로가 아예 없다.

/** start()마다 만들어지는 세션 기록 — 게이트·push 관측 지점. */
interface SessionRun {
  /** 세션 생성 시 캡처된 orchestration(고정값). */
  orchestrationAtCreation: boolean
  /** 세션 생성 시 고정된 canUseTool 게이트(권한 표면). */
  gate: CanUseToolFn
  /** 게이트가 소유한 코디네이터(cancelAll로 매달린 waiter 정리용). */
  coord: PermissionCoordinator
  /** 게이트가 push한 이벤트(permission_request/question_request) 버퍼. */
  gatePushed: AgentEvent[]
  /** 후속 턴으로 push된 content 목록(orchestration은 여기 실리지 못한다). */
  pushedContents: string[]
  run: AgentRun
}

/** 지속세션(held-open) mock backend. start()는 next()가 abort까지 블록하는 run을 반환. */
function makeSessionBackend(sessions: SessionRun[]): AgentBackend {
  return {
    id: 'claude-code' as BackendId,
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    listSupportedCommands: () => [],
    start: (req: AgentRunInput): AgentRun => {
      const gatePushed: AgentEvent[] = []
      const coord = new PermissionCoordinator((e) => gatePushed.push(e))
      const orchestrationAtCreation = req.orchestration === true
      // ★ 재현 핵심 1: 게이트를 세션 생성 시 orchestration으로 고정(이후 불변).
      // (UC1-P02: makeCanUseTool 시그니처가 boolean→게터로 바뀌었지만, 이 mock은 의도적으로
      //  "세션 생성 시 캡처한 고정값을 반환하는 게터"를 넘겨 옛(P03 이전) 세션-고정 거동을
      //  그대로 재현한다 — orchestrationAtCreation은 const라 매번 같은 값만 반환, 라이브성 0.)
      const gate = coord.makeCanUseTool(req.mode, () => orchestrationAtCreation)
      const pushedContents: string[] = []

      // held-open: next()가 release(=abort)까지 블록 → done을 emit하지 않아 세션이 살아있음.
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

      const run: AgentRun = {
        events: iterable,
        abort: () => {
          coord.cancelAll()
          release?.()
        },
        interrupt: () => {},
        // ★ 재현 핵심 2: 후속 턴 주입은 content만 — orchestration을 실을 인자가 없다.
        push: (content: string) => {
          pushedContents.push(content)
        },
        respond: (rid, res) => coord.respond(rid, res),
      }

      sessions.push({ orchestrationAtCreation, gate, coord, gatePushed, pushedContents, run })
      return run
    },
  }
}

/** 새 하네스(fresh manager + backend + sessions 기록). 테스트 간 격리. */
function makeHarness(): {
  manager: ReturnType<typeof createRunManager>
  backend: AgentBackend
  sessions: SessionRun[]
} {
  const sessions: SessionRun[] = []
  return { manager: createRunManager(), backend: makeSessionBackend(sessions), sessions }
}

/** 마이크로태스크를 N tick 비운다(백그라운드 소비자가 held-open next()에 진입하도록). */
async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

const SESSION_KEY = 'uc1-p01-sess'

/**
 * 같은 sessionKey로 두 턴을 구동한다:
 *  - 1턴: orchestration=first로 세션 생성(게이트 고정).
 *  - 2턴: orchestration=second로 start → agent-runs 라우팅이 기존 세션에 content만 push.
 * 반환: 생성된 단일 SessionRun(sessions[0]).
 */
async function driveTwoTurns(
  h: ReturnType<typeof makeHarness>,
  first: boolean,
  second: boolean,
  secondContent: string
): Promise<SessionRun> {
  const onEvent = (): void => {}
  await h.manager.start(
    h.backend,
    { messages: [{ role: 'user', content: 'first turn' }], persistent: true, sessionKey: SESSION_KEY, orchestration: first, mode: 'normal' },
    onEvent
  )
  await flushMicrotasks()
  await h.manager.start(
    h.backend,
    { messages: [{ role: 'user', content: secondContent }], persistent: true, sessionKey: SESSION_KEY, orchestration: second, mode: 'normal' },
    onEvent
  )
  await flushMicrotasks()
  return h.sessions[0]
}

// ═══════════════════════════════════════════════════════════════════════════════
// (a) 후속 턴 orchestration 미반영 재현 — 드롭 지점 고정(GREEN) + 양방향 RED(it.fails)
// ═══════════════════════════════════════════════════════════════════════════════

describe('UC1-P01 (a) 후속 턴 orchestration 미반영 — held-open 세션(ADR-032)', () => {
  // 먼저 "드롭 지점"이 실제로 작동함을 GREEN으로 못 박는다. 이게 참이어야 아래 it.fails 두 개가
  // "게이트가 고정돼서" 실패하는 것이지, 하네스가 깨져서 실패하는 게 아님이 보장된다.
  it('(a-setup) 후속 턴은 새 세션이 아니라 기존 held-open 세션에 content만 push된다 — orchestration 드롭 지점(GREEN)', async () => {
    const h = makeHarness()
    const session = await driveTwoTurns(h, false, true, 'follow-up turn (ON)')
    try {
      // 둘째 start는 새 세션을 만들지 않는다(backend.start 1회) — 기존 세션으로 라우팅.
      expect(h.sessions).toHaveLength(1)
      // 게이트는 세션 생성 시 orchestration=false로 고정됐다.
      expect(session.orchestrationAtCreation).toBe(false)
      // 후속 턴의 content는 push됐지만(=lastUserContent), orchestration=true는 실릴 인자가 없어 유실됐다.
      expect(session.pushedContents).toEqual(['follow-up turn (ON)'])
    } finally {
      h.manager.closeAll()
    }
  })

  // ⓐ-1: OFF → ON. 후속 ON 턴의 Workflow는 승인 게이트(permission_request)로 가야 한다(ADR-032 ①).
  // 현행: 게이트가 OFF로 고정돼 즉시 deny → permission_request 0 → 아래 단언이 실패한다(= it.fails green).
  it.fails('ⓐ-1 [RED] 첫 턴 OFF → 후속 턴 ON: 후속 ON 턴의 Workflow가 승인 게이트로 반영돼야 하나 미반영', async () => {
    const h = makeHarness()
    const session = await driveTwoTurns(h, false, true, 'follow-up turn (ON)')
    try {
      const signal = new AbortController().signal
      // OFF로 고정된 게이트라 즉시 deny로 resolve(hang 없음).
      const result = await session.gate('Workflow', {}, { signal, toolUseID: 'wf-turn2' })
      const permReqs = session.gatePushed.filter((e) => e.type === 'permission_request')
      // 기대(P03 수리 후): 후속 ON 턴 → 승인 요청 1건 + deny 아님.
      // 현행: OFF 고정 → permission_request 0, deny → 이 단언이 실패한다.
      expect(permReqs).toHaveLength(1)
      expect(result.behavior).not.toBe('deny')
    } finally {
      h.manager.closeAll()
    }
  })

  // ⓐ-2(역방향, plan-auditor 🔴#2): ON → OFF. 후속 OFF 턴의 Workflow는 G4 즉시 deny로 재봉인돼야
  // 한다(권한 표면 ON 래치 금지). 현행: 게이트가 ON으로 래치돼 permission_request를 발화 → 실패(it.fails green).
  it.fails('ⓐ-2 [RED·역방향] 첫 턴 ON → 후속 턴 OFF: 후속 OFF 턴의 Workflow가 G4로 재봉인돼야 하나 ON 래치', async () => {
    const h = makeHarness()
    const session = await driveTwoTurns(h, true, false, 'follow-up turn (OFF)')
    try {
      const signal = new AbortController().signal
      // ON으로 고정된 게이트는 _requestPermission으로 직행 → permission_request를 동기 push하고 승인 대기(pending).
      const gatePromise = session.gate('Workflow', {}, { signal, toolUseID: 'wf-turn2' })
      void gatePromise.catch(() => {}) // 승인 대기 promise — dangling 방지(정리는 finally의 closeAll)
      await flushMicrotasks()
      const permReqs = session.gatePushed.filter((e) => e.type === 'permission_request')
      // 기대(P03 수리 후): 후속 OFF 턴 → G4 즉시 deny로 재봉인 → permission_request 0.
      // 현행: ON 래치 → permission_request 1 → 이 단언이 실패한다.
      expect(permReqs).toHaveLength(0)
    } finally {
      // held-open run abort → coord.cancelAll() → 매달린 Workflow waiter를 deny로 정리.
      h.manager.closeAll()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// (b) G4 deny 회귀 고정 — 현행 불변(GREEN)
//     permissionCoordinator.makeCanUseTool(mode, orchestration=false) 경유 Workflow →
//     permission_request 0 + 즉시 deny. (기존 커버: agents/permissionCoordinator.test.ts
//     "Workflow 게이트" describe / orchestration-permission-gate.test.ts G4)
// ═══════════════════════════════════════════════════════════════════════════════

describe('UC1-P01 (b) G4 deny 회귀 고정(GREEN·불변)', () => {
  it('orchestration=false 게이트 → Workflow: permission_request 0 + 즉시 deny', async () => {
    const pushed: AgentEvent[] = []
    const coord = new PermissionCoordinator((e) => pushed.push(e))
    const gate = coord.makeCanUseTool('normal', () => false)

    const result = await gate('Workflow', {}, { signal: new AbortController().signal, toolUseID: 'wf-off' })

    expect(result.behavior).toBe('deny')
    expect(pushed.filter((e) => e.type === 'permission_request')).toHaveLength(0)
  })

  it('orchestration=false 게이트 → mode:auto여도 Workflow는 즉시 deny(auto 조기허용 우회 X)', async () => {
    const pushed: AgentEvent[] = []
    const coord = new PermissionCoordinator((e) => pushed.push(e))
    const gate = coord.makeCanUseTool('auto', () => false)

    const result = await gate('Workflow', {}, { signal: new AbortController().signal, toolUseID: 'wf-off-auto' })

    expect(result.behavior).toBe('deny')
    expect(pushed).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// (c) sdkOptions 스냅샷 — 새 스펙 고정(GREEN, UC1-P02 완료조건)
//     Workflow 상시 노출(disallowedTools 계산 제거) + ORCHESTRATION_SYSTEM_GUIDE 상시 합성.
// ═══════════════════════════════════════════════════════════════════════════════

describe('UC1-P02 (c) sdkOptions 스냅샷 — 새 스펙(Workflow 상시 노출 + 가이드 상시 합성)', () => {
  const noopCanUse: CanUseToolFn = async (_t, input) => ({ behavior: 'allow', updatedInput: input })
  const noopDialog = async (): Promise<{ behavior: 'cancelled' }> => ({ behavior: 'cancelled' as const })

  it('신규스펙: buildClaudeSdkOptions(orchestration=false) → disallowedTools 부재(Workflow 상시 노출)', () => {
    const opts = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal', orchestration: false },
      abortController: new AbortController(),
      canUseTool: noopCanUse,
      skillOverrides: null,
      mcpDenied: null,
      onUserDialog: noopDialog,
    })

    // ★ P02가 뒤집은 단언: disallowedTools 계산 자체가 사라져 orchestration 값과 무관하게 부재.
    expect('disallowedTools' in opts).toBe(false)
    // 가이드는 OFF 턴에도 상시 합성(held-open 세션 고정 append 제약, ADR-032 ④).
    expect((opts['systemPrompt'] as { append?: string }).append).toBe(ORCHESTRATION_SYSTEM_GUIDE)
  })

  it('신규스펙: buildClaudeSdkOptions(orchestration 미전달) → disallowedTools 부재 + 가이드 상시 합성', () => {
    const opts = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal' },
      abortController: new AbortController(),
      canUseTool: noopCanUse,
      skillOverrides: null,
      mcpDenied: null,
      onUserDialog: noopDialog,
    })

    expect('disallowedTools' in opts).toBe(false)
    const append = (opts['systemPrompt'] as { append?: string }).append
    expect(typeof append).toBe('string')
    expect(append as string).toContain(ORCHESTRATION_SYSTEM_GUIDE)
  })
})
