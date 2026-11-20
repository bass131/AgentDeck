// 작업 ID: gap1-p09 · 옛 이름 gap1-p09-task-stop-handler.test.ts
import { describe, it, expect, vi } from 'vitest'

const h = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>() }))
vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown): void => { h.handlers.set(ch, fn) } },
}))
vi.mock('@main/00_App/registry', () => ({ getBackend: (): unknown => ({}) }))

import { registerAgentHandlers } from '@main/01_Ipc/handlers/agent'
import { IPC_CHANNELS } from '@shared/ipcContract'
import { createRunManager } from '@main/03_Agent/agentRuns'
import type { RunManager } from '@main/03_Agent/agentRuns'
import type { AgentBackend, AgentRun } from '@main/03_Agent/AgentBackend'
import type { AgentEvent } from '@shared/agentEvents'
import type { BackendId } from '@shared/ipcContract'

type RunWithStopTask = AgentRun & { stopTask?: (taskId: string) => void }
type ManagerWithTaskStop = RunManager & { taskStop?: (runId: string, taskId: string) => boolean }

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

describe('RunManager.taskStop — 백그라운드 태스크 정지 라우팅 (RED)', () => {
  it('createRunManager()가 taskStop 메서드를 노출한다', () => {
    const manager = createRunManager() as ManagerWithTaskStop
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
    expect(accepted).toBe(true)
  })
})

interface TaskStopInput {
  runId?: unknown
  taskId?: unknown
}

interface TaskStopDelegate {
  taskStop?: (runId: string, taskId: string) => boolean
}

function handleTaskStop(req: TaskStopInput, manager: TaskStopDelegate): { ok: boolean } {
  h.handlers.clear()
  registerAgentHandlers({ state: { win: null }, runManager: manager as unknown as RunManager })
  const handler = h.handlers.get(IPC_CHANNELS.AGENT_TASK_STOP)
  if (!handler) throw new Error('AGENT_TASK_STOP 핸들러가 등록되지 않았다')
  return handler({} as never, req) as { ok: boolean }
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
  it('runId가 undefined면 ok:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleTaskStop({ taskId: 'task-1' }, delegate)).toEqual({ ok: false })
    expect(calls).toHaveLength(0)
  })

  it('runId가 빈 문자열이면 ok:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleTaskStop({ runId: '', taskId: 'task-1' }, delegate)).toEqual({ ok: false })
    expect(calls).toHaveLength(0)
  })

  it('runId가 공백만이면 ok:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleTaskStop({ runId: '   ', taskId: 'task-1' }, delegate)).toEqual({ ok: false })
    expect(calls).toHaveLength(0)
  })

  it('runId가 number면 ok:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleTaskStop({ runId: 123, taskId: 'task-1' }, delegate)).toEqual({ ok: false })
    expect(calls).toHaveLength(0)
  })
})

describe('AGENT_TASK_STOP 핸들러 guard — taskId 검증 (untrusted)', () => {
  it('taskId가 undefined면 ok:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleTaskStop({ runId: 'run-1' }, delegate)).toEqual({ ok: false })
    expect(calls).toHaveLength(0)
  })

  it('taskId가 빈 문자열이면 ok:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleTaskStop({ runId: 'run-1', taskId: '' }, delegate)).toEqual({ ok: false })
    expect(calls).toHaveLength(0)
  })

  it('taskId가 객체(경로 탈출류 임의 페이로드)면 ok:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(
      handleTaskStop({ runId: 'run-1', taskId: { evil: '../..' } }, delegate)
    ).toEqual({ ok: false })
    expect(calls).toHaveLength(0)
  })
})

describe('AGENT_TASK_STOP 핸들러 guard — 위임·수락', () => {
  it('검증 통과 시 검증된 인자만 그대로 위임하고 반환값을 ok로 미러한다 (G10 ack 통일, 옛 accepted)', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    const result = handleTaskStop({ runId: 'run-abc', taskId: 'b7hqf83vz' }, delegate)
    expect(result).toEqual({ ok: true })
    expect(calls).toEqual([{ runId: 'run-abc', taskId: 'b7hqf83vz' }])
  })

  it('실 RunManager 경유 happy path — 활성 run 정지 요청이 수락되고 run.stopTask에 도달한다', async () => {
    const stopCalls: string[] = []
    const manager = createRunManager() as ManagerWithTaskStop
    const runId = await manager.start(backendOf(makeStopRun({ stopCalls })), { messages: [] }, () => {})

    const result = handleTaskStop({ runId, taskId: 'b7hqf83vz' }, manager)
    expect(result).toEqual({ ok: true })
    expect(stopCalls).toEqual(['b7hqf83vz'])
  })

  it('실 RunManager 경유 — 미존재 runId는 검증을 통과해도 ok:false(존재 검증)', () => {
    const manager = createRunManager() as ManagerWithTaskStop
    const result = handleTaskStop({ runId: 'no-such-run', taskId: 'task-1' }, manager)
    expect(result).toEqual({ ok: false })
  })
})
