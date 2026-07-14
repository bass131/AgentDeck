/**
 * gap1-p13-set-mode-handler.test.ts — AGENT_SET_MODE 경로 단위 테스트 (TDD RED)
 *
 * 대상(R only — 구현은 main-process Worker 몫):
 *   02.Source/main/00_ipc/agent-runs.ts — RunManager에 `setMode(runId, mode): boolean`
 *     추가(taskStop 미러 — activeRun의 setPermissionMode 바인딩 호출, 미존재/완료 runId → false).
 *   02.Source/main/00_ipc/handlers/agent.ts — `AGENT_SET_MODE` invoke 핸들러(untrusted
 *     runId string + mode 화이트리스트 검증 → { accepted } 반환). electron import로 직접
 *     단위 테스트 불가 → 핵심 guard 로직을 추출해 검증(gap1-p09-task-stop-handler /
 *     permission-respond-handler 선례 — 핸들러 변경 시 이 미러와 동기화).
 *
 * 계약 핀(coordinator 확정 2026-07-14 · Phase 정본 📐 영호 박제 — 임의 변경 금지):
 *   - main 화이트리스트(picker id 어휘) = ['normal','plan','acceptEdits','auto'] 4종.
 *     'bypass'·'dontAsk'·임의 문자열('x; rm -rf' 등)·SDK 어휘('default'·'bypassPermissions')
 *     전부 거부 → accepted:false + run 위임 0 (CORE-01 — renderer untrusted).
 *   - RunManager.setMode는 **검증된 picker id 원문**을 그대로 run.setPermissionMode(modeId)로
 *     위임한다 — picker→SDK 매핑은 어댑터(claudeAgentRun) 내부에만(ADR-003).
 *   - 전환 *결과*는 응답이 아니라 permission_mode 이벤트(상태 동기화 보조)로 흐른다 —
 *     이 핸들러 응답은 수락 여부(accepted)만(taskStop의 bg_task notification 관례 미러).
 *
 * 현재(RED) 이유: createRunManager() 반환 객체에 setMode가 없다 → 존재/위임/수락 단정
 * FAIL. guard 추출 검증(입력 검증 케이스)은 자기완결 로직이라 GREEN(스펙 미러 — 구현
 * 핸들러가 이 guard와 동일해야 한다는 문서 고정 역할, p09 선례와 동일).
 */
import { describe, it, expect } from 'vitest'
import { createRunManager } from '../../../02.Source/main/00_ipc/agent-runs'
import type { RunManager } from '../../../02.Source/main/00_ipc/agent-runs'
import type { AgentBackend, AgentRun } from '../../../02.Source/main/01_agents/AgentBackend'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'
import type { BackendId } from '../../../02.Source/shared/ipc-contract'

// ── 타입 다리 (구현 전 additive 표면 — 구현 후 동일 시그니처로 그대로 호환) ────────

type RunWithSetPermissionMode = AgentRun & { setPermissionMode?: (modeId: string) => void }
type ManagerWithSetMode = RunManager & { setMode?: (runId: string, mode: string) => boolean }

// ── Mock 헬퍼 (gap1-p09-task-stop-handler.test.ts 관례 미러) ─────────────────────

/**
 * holdMs 동안 열려있다가 done을 내는 가짜 run.
 * withSetPermissionMode=true(기본)면 setPermissionMode 스파이를 싣는다(위임 인자 검증).
 */
function makeModeRun(
  opts: { modeCalls?: string[]; withSetPermissionMode?: boolean; holdMs?: number } = {}
): RunWithSetPermissionMode {
  const run: RunWithSetPermissionMode = {
    events: (async function* () {
      await new Promise<void>((r) => setTimeout(r, opts.holdMs ?? 200))
      yield { type: 'done' } as AgentEvent
    })(),
    abort: () => {},
    interrupt: () => {},
    push: () => {},
    respond: () => {},
  }
  if (opts.withSetPermissionMode !== false) {
    run.setPermissionMode = (modeId) => {
      opts.modeCalls?.push(modeId)
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
// 1. RunManager.setMode — 인터페이스 + 위임 (RED)
// ═══════════════════════════════════════════════════════════════════════════════

describe('RunManager.setMode — 라이브 권한 모드 전환 라우팅 (RED)', () => {
  it('createRunManager()가 setMode 메서드를 노출한다', () => {
    const manager = createRunManager() as ManagerWithSetMode
    // RED: 현행 RunManager에 setMode가 없다(undefined).
    expect(typeof manager.setMode).toBe('function')
  })

  it('활성 run → true + run.setPermissionMode(mode) 위임 — picker id 원문 그대로(SDK 매핑은 어댑터 몫, ADR-003)', async () => {
    const modeCalls: string[] = []
    const manager = createRunManager() as ManagerWithSetMode
    const runId = await manager.start(backendOf(makeModeRun({ modeCalls })), { messages: [] }, () => {})

    const accepted = manager.setMode?.(runId, 'plan')

    expect(accepted).toBe(true)
    // 'plan'이 'plan' 그대로 도달 — main에서 'default' 등 SDK 어휘로 변환 금지.
    expect(modeCalls).toEqual(['plan'])
  })

  it('미존재 runId → false (no-op, throw 없음)', () => {
    const manager = createRunManager() as ManagerWithSetMode
    expect(manager.setMode?.('nonexistent-run-id', 'plan')).toBe(false)
  })

  it('완료된 run → false (interrupt/taskStop과 동일 no-op 일관성)', async () => {
    const modeCalls: string[] = []
    const manager = createRunManager() as ManagerWithSetMode
    const runId = await manager.start(
      backendOf(makeModeRun({ modeCalls, holdMs: 0 })),
      { messages: [] },
      () => {}
    )
    // done 소비 → 레지스트리 정리까지 대기.
    await new Promise<void>((r) => setTimeout(r, 100))

    expect(manager.setMode?.(runId, 'plan')).toBe(false)
    expect(modeCalls).toHaveLength(0)
  })

  it('abort된 run → false + 위임 0건', async () => {
    const modeCalls: string[] = []
    const manager = createRunManager() as ManagerWithSetMode
    const runId = await manager.start(backendOf(makeModeRun({ modeCalls })), { messages: [] }, () => {})

    expect(manager.abort(runId)).toBe(true)
    expect(manager.setMode?.(runId, 'plan')).toBe(false)
    expect(modeCalls).toHaveLength(0)
  })

  it('setPermissionMode 미구현 run(Echo류) → 수락(true) + throw 없음 (optional chaining no-op — taskStop 미러)', async () => {
    const manager = createRunManager() as ManagerWithSetMode
    const runId = await manager.start(
      backendOf(makeModeRun({ withSetPermissionMode: false })),
      { messages: [] },
      () => {}
    )

    let accepted: boolean | undefined
    expect(() => {
      accepted = manager.setMode?.(runId, 'auto')
    }).not.toThrow()
    // 활성 run에 대한 전환 요청은 수락된다 — 실제 반영 여부는 엔진(fire-and-forget)이
    // 판단하고 상태는 permission_mode 이벤트(보조 신호)로 흐른다.
    expect(accepted).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. AGENT_SET_MODE 핸들러 guard — untrusted 입력 + 화이트리스트 (추출 미러)
// ═══════════════════════════════════════════════════════════════════════════════
//
// handlers/agent.ts의 AGENT_SET_MODE 핸들러와 동일해야 하는 검증 로직(permission-respond
// / taskStop 선례). 핸들러가 변경되면 이 함수도 동기화한다.
//
// 화이트리스트는 **main 핸들러 계층이 강제**한다(CORE-01) — renderer(피커 UI)도 같은
// 4종만 보내지만 untrusted이므로 신뢰하지 않는다. RunManager에는 검증된 값만 도달.

/** 라이브 전환 허용 picker id 4종 — 영호 박제(2026-07-14). bypass·dontAsk는 세션 생성 시에만. */
const LIVE_MODE_WHITELIST = ['normal', 'plan', 'acceptEdits', 'auto'] as const

interface SetModeInput {
  runId?: unknown
  mode?: unknown
}

interface SetModeDelegate {
  setMode?: (runId: string, mode: string) => boolean
}

function handleSetMode(req: SetModeInput, manager: SetModeDelegate): { accepted: boolean } {
  // 입력 검증(untrusted) — 타입 + 비어있음. 불합격 → accepted:false, throw 없음.
  if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') {
    return { accepted: false }
  }
  // mode: string + 화이트리스트 4종 밖 전부 거부(임의 문자열의 엔진 플래그/모드 주입 차단).
  if (typeof req.mode !== 'string' || !(LIVE_MODE_WHITELIST as readonly string[]).includes(req.mode)) {
    return { accepted: false }
  }
  const accepted = manager.setMode?.(req.runId, req.mode) === true
  return { accepted }
}

function makeRecordingDelegate(ret: boolean): {
  delegate: SetModeDelegate
  calls: Array<{ runId: string; mode: string }>
} {
  const calls: Array<{ runId: string; mode: string }> = []
  return {
    delegate: {
      setMode(runId, mode) {
        calls.push({ runId, mode })
        return ret
      },
    },
    calls,
  }
}

describe('AGENT_SET_MODE 핸들러 guard — runId 검증 (untrusted)', () => {
  it('runId가 undefined면 accepted:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleSetMode({ mode: 'plan' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it('runId가 빈 문자열/공백만이면 accepted:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleSetMode({ runId: '', mode: 'plan' }, delegate)).toEqual({ accepted: false })
    expect(handleSetMode({ runId: '   ', mode: 'plan' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it('runId가 number(타입 불일치)면 accepted:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleSetMode({ runId: 123, mode: 'plan' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })
})

describe('AGENT_SET_MODE 핸들러 guard — mode 화이트리스트 (CORE-01)', () => {
  it("'bypass'는 라이브 전환 금지(세션 생성 시에만) → accepted:false + 위임 0건", () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleSetMode({ runId: 'run-1', mode: 'bypass' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it("'dontAsk'도 라이브 전환 금지 → accepted:false + 위임 0건", () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleSetMode({ runId: 'run-1', mode: 'dontAsk' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it("임의 문자열('x; rm -rf' — 인젝션류 페이로드) → accepted:false + 위임 0건", () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleSetMode({ runId: 'run-1', mode: 'x; rm -rf' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it("SDK 어휘('default'·'bypassPermissions')는 picker 어휘가 아니다 → accepted:false (어휘 규율 고정)", () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleSetMode({ runId: 'run-1', mode: 'default' }, delegate)).toEqual({ accepted: false })
    expect(handleSetMode({ runId: 'run-1', mode: 'bypassPermissions' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it('mode가 비-string(객체/undefined/빈 문자열)이면 accepted:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleSetMode({ runId: 'run-1', mode: { evil: true } }, delegate)).toEqual({ accepted: false })
    expect(handleSetMode({ runId: 'run-1' }, delegate)).toEqual({ accepted: false })
    expect(handleSetMode({ runId: 'run-1', mode: '' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it('유효 4종(normal/plan/acceptEdits/auto) → 검증된 인자 그대로 위임 + accepted 미러', () => {
    for (const mode of LIVE_MODE_WHITELIST) {
      const { delegate, calls } = makeRecordingDelegate(true)
      expect(handleSetMode({ runId: 'run-abc', mode }, delegate)).toEqual({ accepted: true })
      expect(calls).toEqual([{ runId: 'run-abc', mode }])
    }
  })
})

describe('AGENT_SET_MODE 핸들러 guard — 실 RunManager 경유', () => {
  it('happy path — 활성 run 전환 요청이 수락되고 run.setPermissionMode에 도달한다 (RED)', async () => {
    const modeCalls: string[] = []
    const manager = createRunManager() as ManagerWithSetMode
    const runId = await manager.start(backendOf(makeModeRun({ modeCalls })), { messages: [] }, () => {})

    // RED: 현행 manager.setMode 부재 → guard의 `=== true` 정규화로 accepted:false.
    const result = handleSetMode({ runId, mode: 'plan' }, manager)
    expect(result).toEqual({ accepted: true })
    expect(modeCalls).toEqual(['plan'])
  })

  it('미존재 runId는 검증을 통과해도 accepted:false(존재 검증 — 임의 통과 0)', () => {
    const manager = createRunManager() as ManagerWithSetMode
    const result = handleSetMode({ runId: 'no-such-run', mode: 'auto' }, manager)
    expect(result).toEqual({ accepted: false })
  })
})
