/**
 * gap1-p13-live-mode-switch.test.ts — GAP1 P13 REPL 진행 중 권한 모드 라이브 전환 (TDD RED)
 *
 * 대상(R only — 구현은 agent-backend Worker 몫):
 *   02.Source/main/01_agents/AgentBackend.ts — AgentRun optional 메서드
 *     `setPermissionMode?(modeId: string): void` (stopTask 선례 미러 — fire-and-forget·멱등).
 *   02.Source/main/01_agents/claudeAgentRun.ts — persistent(held-open) run에서 캡처된
 *     query 핸들의 `setPermissionMode(sdkMode)`로 위임 + canUseTool의 picker mode 판정을
 *     라이브 참조로 교체(현행 `makeCanUseTool(this._req.mode, …)` 생성 시점 고정 = dogfood
 *     결함 A의 어댑터측 원인). 단발(비-persistent) run은 조용한 no-op(SDK JSDoc:
 *     setPermissionMode는 streaming input mode 한정).
 *   02.Source/main/01_agents/permissionCoordinator.ts — ExitPlanMode allow 응답에
 *     `updatedPermissions: [{ type:'setMode', mode:'acceptEdits', destination:'session' }]`
 *     (plan 승인 착지 결정성 — Phase 정본 📐 감사 🟡5 정정 형식).
 *   02.Source/main/01_agents/(claude-stream|eventNormalizer).ts — SDK system status 메시지의
 *     `permissionMode` 필드 관찰 → 엔진중립 `{ type:'permission_mode', mode:<picker id> }`
 *     방출(SDK→picker 역매핑은 어댑터 내부 — 매핑 불가 값·필드 부재는 미방출).
 *
 * 계약 핀(coordinator 확정 2026-07-14 — 임의 변경 금지):
 *   - 어댑터 내부 picker→SDK 매핑: normal→'default' · plan→'plan' · acceptEdits→'acceptEdits'
 *     · auto→'auto'. ⚠ 세션 생성 경로 run-args의 auto→acceptEdits와 **다르다** — 라이브
 *     전환은 SDK 'auto'를 그대로 사용, run-args는 불변.
 *   - SDK→picker 역매핑(permission_mode 이벤트): 'default'→normal · 'plan'→plan ·
 *     'acceptEdits'→acceptEdits · 'auto'→auto · 'bypassPermissions'→bypass ·
 *     'dontAsk'/미지값→미방출.
 *
 * 현재(RED) 이유: AgentRun에 setPermissionMode 부재 · canUseTool mode 고정 캡처 ·
 *   allow 응답 updatedPermissions 미부여 · status.permissionMode 드롭(0건).
 *
 * 하네스: 실 SDK 호출 0 — mock QueryFn(claudeAgentRun.test.ts·gap1-p09 골든 미러).
 * 결정론: 시간 의존은 bounded waitFor 폴링(외부 IO 0)과 고정 sentinel뿐.
 */
import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import { PermissionCoordinator } from '../../../02.Source/main/01_agents/permissionCoordinator'
import type { AgentRun } from '../../../02.Source/main/01_agents/AgentBackend'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

// ── 타입 다리 (구현 전 additive 표면 — 구현 후 동일 시그니처로 그대로 호환) ────────
type RunWithSetPermissionMode = AgentRun & { setPermissionMode?: (modeId: string) => void }

/** permission_mode 이벤트(P13 additive 신설 — 구현 전이라 AgentEvent union 밖 타입 다리). */
interface PermissionModeEv {
  type: 'permission_mode'
  mode: string
}

function permissionModeEvents(events: AgentEvent[]): PermissionModeEv[] {
  return events.filter(
    (e) => (e as { type: string }).type === 'permission_mode'
  ) as unknown as PermissionModeEv[]
}

type PermReqEvent = Extract<AgentEvent, { type: 'permission_request' }>

// ── SDK 원시 메시지 픽스처 (기존 스위트 미러) ─────────────────────────────────────

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
    session_id: 'sess-p13',
  }
}

/**
 * SDK SDKStatusMessage(sdk.d.ts:4130) 원시 형상 — permissionMode 필드는 optional.
 * status:null(진행 해제)은 기존 S-01 compact(kind:'status') 매핑이 이미 수용하는 값.
 */
function mkStatus(permissionMode?: string) {
  return {
    type: 'system' as const,
    subtype: 'status' as const,
    status: null,
    ...(permissionMode !== undefined ? { permissionMode } : {}),
    uuid: 'uuid-stat-0000-0000-000000000042' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-p13',
  }
}

/** 단발 경로용 mock query — 메시지 배열 재생(claudeAgentRun.test.ts mkQuery 미러). */
function mkQuery(messages: unknown[]): QueryFn {
  return async function* (params: { prompt: string; options?: unknown }) {
    const opts = params.options as Record<string, unknown> | undefined
    for (const m of messages) {
      const ab = opts?.['abortController'] as AbortController | undefined
      if (ab?.signal.aborted) return
      yield m
    }
  }
}

/**
 * setPermissionMode 스파이를 실은 held-open mock queryFn (gap1-p09 makeStopQueryFn 미러).
 * 반환 객체 = AsyncGenerator + setPermissionMode(sdkMode 기록) — 어댑터가 캡처하는
 * query 핸들 형상. turn1 이후 입력 pull을 직접 대기 — run.abort()가 입력을 닫으면 종료.
 */
function makeSetModeQueryFn(calls: string[], opts: { throwing?: boolean } = {}): QueryFn {
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
      setPermissionMode: (mode: string): void => {
        if (opts.throwing) throw new Error('SDK setPermissionMode 거부(모의)')
        calls.push(mode)
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

// ═══════════════════════════════════════════════════════════════════════════════
// ① AgentRun.setPermissionMode — 존재 + query 핸들 위임(picker→SDK 매핑)
// ═══════════════════════════════════════════════════════════════════════════════

describe('gap1-p13 ① AgentRun.setPermissionMode — query 핸들 위임 (RED)', () => {
  it('persistent run이 setPermissionMode 메서드를 노출한다', async () => {
    const backend = new ClaudeCodeBackend(makeSetModeQueryFn([]))
    const run = backend.start({
      messages: [{ role: 'user', content: '지속 세션 시작' }],
      persistent: true,
      mode: 'normal',
    }) as RunWithSetPermissionMode
    try {
      // RED: 현행 AgentRun 계약에 setPermissionMode가 없다(undefined).
      expect(typeof run.setPermissionMode).toBe('function')
    } finally {
      run.abort()
      for await (const e of run.events) void e // 좀비 0 — 스트림 자연종료까지 소진
    }
  })

  it("핸들 캡처 후 picker id → SDK 모드 매핑 위임: plan→'plan' · normal→'default' · acceptEdits→'acceptEdits' · auto→'auto'", async () => {
    const calls: string[] = []
    const backend = new ClaudeCodeBackend(makeSetModeQueryFn(calls))
    const run = backend.start({
      messages: [{ role: 'user', content: '모드 매핑 검증' }],
      persistent: true,
      mode: 'normal',
    }) as RunWithSetPermissionMode

    for await (const e of run.events) {
      if (e.type === 'done') {
        // done 관측 시점 = queryFn 호출 완료 후(핸들 캡처 확정) — gap1-p09 stopTask 선례.
        run.setPermissionMode?.('plan')
        run.setPermissionMode?.('normal')
        run.setPermissionMode?.('acceptEdits')
        run.setPermissionMode?.('auto')
        run.abort()
      }
    }

    // RED: 현행 run.setPermissionMode는 undefined(optional chaining no-op) → 위임 0건.
    // ⚠ auto는 SDK 'auto' 그대로 — run-args 세션 생성 경로의 auto→acceptEdits와 다르다(핀).
    expect(calls).toEqual(['plan', 'default', 'acceptEdits', 'auto'])
  })

  it('대조군(GREEN 핀): 핸들 캡처 전 호출은 조용한 no-op(throw 금지) — stopTask 미러', async () => {
    const backend = new ClaudeCodeBackend(makeSetModeQueryFn([]))
    const run = backend.start({
      messages: [{ role: 'user', content: '즉시 전환 시도' }],
      persistent: true,
      mode: 'normal',
    }) as RunWithSetPermissionMode
    // start() 직후 = 펌프가 아직 queryFn을 호출하기 전일 수 있는 시점.
    expect(() => run.setPermissionMode?.('plan')).not.toThrow()
    run.abort()
    for await (const e of run.events) void e
  })

  it('대조군(GREEN 핀): 핸들 setPermissionMode가 throw해도 run 호출은 삼킨다(fire-and-forget)', async () => {
    const backend = new ClaudeCodeBackend(makeSetModeQueryFn([], { throwing: true }))
    const run = backend.start({
      messages: [{ role: 'user', content: '핸들 예외 흡수' }],
      persistent: true,
      mode: 'normal',
    }) as RunWithSetPermissionMode

    for await (const e of run.events) {
      if (e.type === 'done') {
        // 현행: undefined no-op(통과). 구현 후: 어댑터가 예외를 삼켜야 한다(stopTask 계약 미러).
        expect(() => run.setPermissionMode?.('plan')).not.toThrow()
        run.abort()
      }
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ② 전환 반영 — "이후 도구 요청부터 새 모드" (canUseTool 라이브 판정)
// ═══════════════════════════════════════════════════════════════════════════════

type CapturedCanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  opts: { signal: AbortSignal; toolUseID: string }
) => Promise<{ behavior: string }>

describe('gap1-p13 ② 전환 후 다음 canUseTool부터 새 모드 (RED)', () => {
  it("mode 'normal' 시작 → setPermissionMode('auto') 후 부수효과 도구(Bash)가 permission_request 없이 allow", async () => {
    const cap: { canUseTool?: CapturedCanUseTool } = {}
    const queryFn: QueryFn = async function* (p) {
      const opts = p.options as Record<string, unknown> | undefined
      cap.canUseTool = opts?.['canUseTool'] as CapturedCanUseTool
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')
      await inputIter.next() // held-open park — abort가 닫을 때까지
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '진행 중 세션 라이브 전환' }],
      persistent: true,
      mode: 'normal',
    }) as RunWithSetPermissionMode

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await waitFor(() => events.some((e) => e.type === 'done'))
    expect(typeof cap.canUseTool).toBe('function')

    // ★ 진행 중 세션에서 라이브 전환 — dogfood 결함 A 역전 지점.
    run.setPermissionMode?.('auto')

    // 다음 도구 요청: 부수효과 도구. 안전(구현 후) = auto 조기허용 즉시 allow.
    // 현행(RED) = mode 'normal' 고정 캡처 → permission_request 발화 + respond 대기 hang
    //   → sentinel 타임아웃으로 감지(orchestration-permission-gate G4 패턴).
    const signal = new AbortController().signal
    const sentinel = new Promise<{ behavior: string }>((resolve) =>
      setTimeout(() => resolve({ behavior: '__timeout__' }), 300)
    )
    const decision = await Promise.race([
      cap.canUseTool!('Bash', { command: 'echo p13' }, { signal, toolUseID: 'bash-p13' }),
      sentinel,
    ])

    run.abort() // 미해결 waiter 정리(cancelAll) — 매달림 0
    await consume

    expect(decision.behavior).toBe('allow')
    expect(events.filter((e) => e.type === 'permission_request')).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ③ 단발(비-persistent) run — 조용한 no-op (SDK streaming-input 한정 함정 방어)
// ═══════════════════════════════════════════════════════════════════════════════

describe('gap1-p13 ③ 단발 run setPermissionMode — no-op (RED: 존재 단정)', () => {
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
        await gate // 스트림 진행 중 창을 열어 둔다 — 이 사이 setPermissionMode 호출
        yield mkResult('single')
      })()
      return Object.assign(gen, {
        setPermissionMode: (mode: string): void => {
          calls.push(mode)
        },
      })
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '단발 실행' }],
      mode: 'normal',
    }) as RunWithSetPermissionMode

    const events: AgentEvent[] = []
    const consume = (async () => {
      for await (const e of run.events) events.push(e)
    })()

    await waitFor(() => pumpStarted)

    // RED: 현행 AgentRun 계약에 setPermissionMode 부재(undefined).
    expect(typeof run.setPermissionMode).toBe('function')
    expect(() => {
      run.setPermissionMode?.('plan')
      run.setPermissionMode?.('plan') // 멱등 — 재호출 안전
    }).not.toThrow()

    release()
    await consume

    // 단발 경로는 SDK 미지원(JSDoc streaming input 한정) — 핸들이 캡처돼 있어도 위임 0.
    expect(calls).toHaveLength(0)
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ④ plan 승인 착지 결정성 — ExitPlanMode allow의 updatedPermissions
// ═══════════════════════════════════════════════════════════════════════════════

/** push된 이벤트를 수집하는 코디네이터 + 버퍼 (gap1-p07-plan-approval-backend 패턴). */
function mkCoord(): { coord: PermissionCoordinator; pushed: AgentEvent[] } {
  const pushed: AgentEvent[] = []
  const coord = new PermissionCoordinator((e) => pushed.push(e))
  return { coord, pushed }
}

describe('gap1-p13 ④ plan 승인 착지 — updatedPermissions setMode 결정성 (RED)', () => {
  it("ExitPlanMode allow 응답 → updatedPermissions [{type:'setMode', mode:'acceptEdits', destination:'session'}]", async () => {
    const { coord, pushed } = mkCoord()
    const canUse = coord.makeCanUseTool('plan', () => false)

    const p = canUse('ExitPlanMode', {
      plan: '# Plan: 라이브 전환 착지',
      planFilePath: 'C:\\Users\\bass1\\.claude\\plans\\p13.md',
    })
    expect(pushed.length).toBe(1)
    const req = pushed[0] as PermReqEvent
    expect(req.type).toBe('permission_request')
    coord.respond(req.requestId, { kind: 'permission', behavior: 'allow' })

    const result = await p
    expect(result.behavior).toBe('allow')
    const updated = (result as { updatedPermissions?: unknown[] }).updatedPermissions
    // RED: 현행 allow 분기는 updatedPermissions 미부여 — 착지 모드가 암묵(SDK 임의 거동).
    // 핀: mode 필수 + destination 'session' 고정(userSettings 등으로 새면 영속 권한 영역 침범).
    expect(updated).toEqual([{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }])
  })

  it('대조군(GREEN 핀): 비-ExitPlanMode(Bash) allow에는 setMode 착지 미부여(회귀 0)', async () => {
    const { coord, pushed } = mkCoord()
    const canUse = coord.makeCanUseTool('normal', () => false)
    const p = canUse('Bash', { command: 'ls' })
    const req = pushed[0] as PermReqEvent
    coord.respond(req.requestId, { kind: 'permission', behavior: 'allow' })
    const result = await p
    expect(result.behavior).toBe('allow')
    expect((result as { updatedPermissions?: unknown[] }).updatedPermissions).toBeUndefined()
  })

  it('대조군(GREEN 핀): ExitPlanMode deny에는 착지 미부여 — behavior deny 그대로("계속 계획" 경로)', async () => {
    const { coord, pushed } = mkCoord()
    const canUse = coord.makeCanUseTool('plan', () => false)
    const p = canUse('ExitPlanMode', { plan: '# Plan: 거부 케이스' })
    const req = pushed[0] as PermReqEvent
    coord.respond(req.requestId, { kind: 'permission', behavior: 'deny' })
    const result = await p
    expect(result.behavior).toBe('deny')
    expect((result as { updatedPermissions?: unknown[] }).updatedPermissions).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ⑤ 상태 동기화 보조 — SDK status.permissionMode → permission_mode 이벤트
// ═══════════════════════════════════════════════════════════════════════════════

/** SDK PermissionMode 전 어휘 + 매핑불가/부재 대조를 한 스트림에 재생하는 픽스처. */
function statusFixture(): unknown[] {
  return [
    mkStatus('plan'),
    mkStatus('default'),
    mkStatus('acceptEdits'),
    mkStatus('auto'),
    mkStatus('bypassPermissions'),
    mkStatus('dontAsk'), // SDK→picker 역매핑 불가 — 미방출(핀)
    mkStatus(), //          permissionMode 필드 부재 — 미방출(핀)
    mkResult('turn1'),
  ]
}

describe('gap1-p13 ⑤ status.permissionMode → permission_mode 방출 (RED)', () => {
  it("SDK 모드 → picker id 역매핑 순서 보존: ['plan','normal','acceptEdits','auto','bypass'] (dontAsk·부재 미방출)", async () => {
    const backend = new ClaudeCodeBackend(mkQuery(statusFixture()))
    const run = backend.start({ messages: [{ role: 'user', content: '상태 동기화' }] })
    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    // RED: 현행 어댑터는 status의 permissionMode 필드를 드롭한다(방출 0건).
    expect(permissionModeEvents(events).map((e) => e.mode)).toEqual([
      'plan',
      'normal',
      'acceptEdits',
      'auto',
      'bypass',
    ])
  })

  it('대조군(GREEN 핀): 기존 S-01 compact(kind status) 매핑 불변 — status 라인 7건 전부 유지', async () => {
    const backend = new ClaudeCodeBackend(mkQuery(statusFixture()))
    const run = backend.start({ messages: [{ role: 'user', content: '상태 동기화 대조군' }] })
    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    const compactStatus = events
      .filter((e): e is Extract<AgentEvent, { type: 'compact' }> => e.type === 'compact')
      .filter((e) => e.kind === 'status')
    // permission_mode 방출은 기존 compact(kind:'status') 정규화를 대체가 아니라 병행해야 한다.
    expect(compactStatus).toHaveLength(7)
  })
})
