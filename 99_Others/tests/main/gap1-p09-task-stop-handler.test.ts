/**
 * gap1-p09-task-stop-handler.test.ts — AGENT_TASK_STOP 경로 단위 테스트 (TDD RED)
 *
 * 대상(R only — 구현은 main-process Worker 몫):
 *   02.Source/main/00_ipc/agent-runs.ts — RunManager에 `taskStop(runId, taskId): boolean`
 *     추가(interrupt 미러 — activeRun의 stopTask 바인딩 호출, 미존재/완료 runId → false).
 *   02.Source/main/00_ipc(ipc/index.ts) — `AGENT_TASK_STOP` invoke 핸들러(untrusted string
 *     2개 검증 → { accepted } 반환). electron import로 직접 단위 테스트 불가 → 핵심 guard
 *     로직을 추출해 검증(permission-respond-handler.test.ts 선례 — 핸들러 변경 시 동기화).
 *
 * 계약(shared/ipc/agent.ts TaskStopRequest/TaskStopResponse — 디스크 반영분):
 *   - runId·taskId 는 renderer untrusted string 2개 — main이 존재 검증(임의 통과 0).
 *   - 정지 *결과*는 응답이 아니라 기존 bg_task kind='notification'(status 'stopped')으로
 *     흐른다 — 이 핸들러 응답은 수락 여부(accepted)만.
 *   - interrupt 미러: 활성 run이면 수락(true). AgentRun.stopTask는 optional이므로
 *     미구현 run(Echo류)에도 optional chaining no-op으로 수락은 유지(throw 금지).
 *
 * 현재(RED) 이유: createRunManager() 반환 객체에 taskStop이 없다 → 존재/위임/수락 단정
 * FAIL. guard 추출 검증(입력 검증 케이스)은 자기완결 로직이라 GREEN(스펙 미러 — 구현
 * 핸들러가 이 guard와 동일해야 한다는 문서 고정 역할, permission-respond 선례와 동일).
 */
import { describe, it, expect } from 'vitest'
import { createRunManager } from '../../../02.Source/main/00_ipc/agent-runs'
import type { RunManager } from '../../../02.Source/main/00_ipc/agent-runs'
import type { AgentBackend, AgentRun } from '../../../02.Source/main/01_agents/AgentBackend'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'
import type { BackendId } from '../../../02.Source/shared/ipc-contract'

// ── 타입 다리 (구현 전 additive 표면 — 구현 후 동일 시그니처로 그대로 호환) ────────

type RunWithStopTask = AgentRun & { stopTask?: (taskId: string) => void }
type ManagerWithTaskStop = RunManager & { taskStop?: (runId: string, taskId: string) => boolean }

// ── Mock 헬퍼 (agent-runs.test.ts 관례 미러) ────────────────────────────────────

/**
 * holdMs 동안 열려있다가 done을 내는 가짜 run.
 * withStopTask=true(기본)면 stopTask 스파이를 싣는다(위임 인자 검증).
 */
function makeStopRun(opts: { stopCalls?: string[]; withStopTask?: boolean; holdMs?: number } = {}): RunWithStopTask {
  const run: RunWithStopTask = {
    events: (async function* () {
      await new Promise<void>((r) => setTimeout(r, opts.holdMs ?? 200))
      yield { type: 'done' } as AgentEvent
    })(),
    abort: () => {},
    interrupt: () => {},
    push: () => {},
    respond: () => {},
  }
  if (opts.withStopTask !== false) {
    run.stopTask = (taskId) => {
      opts.stopCalls?.push(taskId)
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
// 1. RunManager.taskStop — 인터페이스 + 위임 (RED)
// ═══════════════════════════════════════════════════════════════════════════════

describe('RunManager.taskStop — 백그라운드 태스크 정지 라우팅 (RED)', () => {
  it('createRunManager()가 taskStop 메서드를 노출한다', () => {
    const manager = createRunManager() as ManagerWithTaskStop
    // RED: 현행 RunManager에 taskStop이 없다(undefined).
    expect(typeof manager.taskStop).toBe('function')
  })

  it('활성 run → true + run.stopTask(taskId) 위임(인자 그대로)', async () => {
    const stopCalls: string[] = []
    const manager = createRunManager() as ManagerWithTaskStop
    const runId = await manager.start(backendOf(makeStopRun({ stopCalls })), { messages: [] }, () => {})

    const accepted = manager.taskStop?.(runId, 'b7hqf83vz')

    expect(accepted).toBe(true)
    expect(stopCalls).toEqual(['b7hqf83vz'])
  })

  it('미존재 runId → false (no-op, throw 없음)', () => {
    const manager = createRunManager() as ManagerWithTaskStop
    expect(manager.taskStop?.('nonexistent-run-id', 'task-1')).toBe(false)
  })

  it('완료된 run → false (interrupt/respond와 동일 no-op 일관성)', async () => {
    const stopCalls: string[] = []
    const manager = createRunManager() as ManagerWithTaskStop
    const runId = await manager.start(
      backendOf(makeStopRun({ stopCalls, holdMs: 0 })),
      { messages: [] },
      () => {}
    )
    // done 소비 → 레지스트리 정리까지 대기.
    await new Promise<void>((r) => setTimeout(r, 100))

    expect(manager.taskStop?.(runId, 'task-1')).toBe(false)
    expect(stopCalls).toHaveLength(0)
  })

  it('abort된 run → false + 위임 0건', async () => {
    const stopCalls: string[] = []
    const manager = createRunManager() as ManagerWithTaskStop
    const runId = await manager.start(backendOf(makeStopRun({ stopCalls })), { messages: [] }, () => {})

    expect(manager.abort(runId)).toBe(true)
    expect(manager.taskStop?.(runId, 'task-1')).toBe(false)
    expect(stopCalls).toHaveLength(0)
  })

  it('stopTask 미구현 run(Echo류) → 수락(true) + throw 없음 (interrupt 미러 — optional chaining no-op)', async () => {
    const manager = createRunManager() as ManagerWithTaskStop
    const runId = await manager.start(
      backendOf(makeStopRun({ withStopTask: false })),
      { messages: [] },
      () => {}
    )

    let accepted: boolean | undefined
    expect(() => {
      accepted = manager.taskStop?.(runId, 'task-1')
    }).not.toThrow()
    // 활성 run에 대한 정지 요청은 수락된다 — 실제 정지 가능 여부(taskId 존재)는
    // 엔진(fire-and-forget)이 판단하고 결과는 bg_task notification으로 흐른다.
    expect(accepted).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. AGENT_TASK_STOP 핸들러 guard — untrusted 입력 검증 (추출 미러)
// ═══════════════════════════════════════════════════════════════════════════════
//
// ipc/index.ts의 AGENT_TASK_STOP 핸들러와 동일해야 하는 검증 로직(permission-respond
// 선례). 핸들러가 변경되면 이 함수도 동기화한다.

interface TaskStopInput {
  runId?: unknown
  taskId?: unknown
}

interface TaskStopDelegate {
  taskStop?: (runId: string, taskId: string) => boolean
}

function handleTaskStop(req: TaskStopInput, manager: TaskStopDelegate): { accepted: boolean } {
  // 입력 검증(untrusted) — 타입 + 비어있음. 불합격 → accepted:false, throw 없음.
  if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') {
    return { accepted: false }
  }
  if (!req?.taskId || typeof req.taskId !== 'string' || req.taskId.trim() === '') {
    return { accepted: false }
  }
  const accepted = manager.taskStop?.(req.runId, req.taskId) === true
  return { accepted }
}

function makeRecordingDelegate(ret: boolean): {
  delegate: TaskStopDelegate
  calls: Array<{ runId: string; taskId: string }>
} {
  const calls: Array<{ runId: string; taskId: string }> = []
  return {
    delegate: {
      taskStop(runId, taskId) {
        calls.push({ runId, taskId })
        return ret
      },
    },
    calls,
  }
}

describe('AGENT_TASK_STOP 핸들러 guard — runId 검증 (untrusted)', () => {
  it('runId가 undefined면 accepted:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleTaskStop({ taskId: 'task-1' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it('runId가 빈 문자열이면 accepted:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleTaskStop({ runId: '', taskId: 'task-1' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it('runId가 공백만이면 accepted:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleTaskStop({ runId: '   ', taskId: 'task-1' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it('runId가 number면 accepted:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleTaskStop({ runId: 123, taskId: 'task-1' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })
})

describe('AGENT_TASK_STOP 핸들러 guard — taskId 검증 (untrusted)', () => {
  it('taskId가 undefined면 accepted:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleTaskStop({ runId: 'run-1' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it('taskId가 빈 문자열이면 accepted:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleTaskStop({ runId: 'run-1', taskId: '' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it('taskId가 객체(경로 탈출류 임의 페이로드)면 accepted:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(
      handleTaskStop({ runId: 'run-1', taskId: { evil: '../..' } }, delegate)
    ).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })
})

describe('AGENT_TASK_STOP 핸들러 guard — 위임·수락', () => {
  it('검증 통과 시 검증된 인자만 그대로 위임하고 반환값을 accepted로 미러한다', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    const result = handleTaskStop({ runId: 'run-abc', taskId: 'b7hqf83vz' }, delegate)
    expect(result).toEqual({ accepted: true })
    expect(calls).toEqual([{ runId: 'run-abc', taskId: 'b7hqf83vz' }])
  })

  it('실 RunManager 경유 happy path — 활성 run 정지 요청이 수락되고 run.stopTask에 도달한다', async () => {
    const stopCalls: string[] = []
    const manager = createRunManager() as ManagerWithTaskStop
    const runId = await manager.start(backendOf(makeStopRun({ stopCalls })), { messages: [] }, () => {})

    // RED: 현행 manager.taskStop 부재 → guard의 `=== true` 정규화로 accepted:false.
    const result = handleTaskStop({ runId, taskId: 'b7hqf83vz' }, manager)
    expect(result).toEqual({ accepted: true })
    expect(stopCalls).toEqual(['b7hqf83vz'])
  })

  it('실 RunManager 경유 — 미존재 runId는 검증을 통과해도 accepted:false(존재 검증)', () => {
    const manager = createRunManager() as ManagerWithTaskStop
    const result = handleTaskStop({ runId: 'no-such-run', taskId: 'task-1' }, manager)
    expect(result).toEqual({ accepted: false })
  })
})
