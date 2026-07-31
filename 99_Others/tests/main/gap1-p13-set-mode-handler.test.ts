import { describe, it, expect } from 'vitest'
import { createRunManager } from '../../../02_Source/main/00_ipc/agentRuns'
import type { RunManager } from '../../../02_Source/main/00_ipc/agentRuns'
import type { AgentBackend, AgentRun } from '../../../02_Source/main/01_agents/AgentBackend'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'
import type { BackendId } from '../../../02_Source/shared/ipcContract'

type RunWithSetPermissionMode = AgentRun & { setPermissionMode?: (modeId: string) => void }
type ManagerWithSetMode = RunManager & { setMode?: (runId: string, mode: string) => boolean }

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

describe('RunManager.setMode — 라이브 권한 모드 전환 라우팅 (RED)', () => {
  it('createRunManager()가 setMode 메서드를 노출한다', () => {
    const manager = createRunManager() as ManagerWithSetMode
    expect(typeof manager.setMode).toBe('function')
  })

  it('활성 run → true + run.setPermissionMode(mode) 위임 — picker id 원문 그대로(SDK 매핑은 어댑터 몫, ADR-003)', async () => {
    const modeCalls: string[] = []
    const manager = createRunManager() as ManagerWithSetMode
    const runId = await manager.start(backendOf(makeModeRun({ modeCalls })), { messages: [] }, () => {})

    const accepted = manager.setMode?.(runId, 'plan')

    expect(accepted).toBe(true)
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
    expect(accepted).toBe(true)
  })
})

const LIVE_MODE_WHITELIST = ['normal', 'plan', 'acceptEdits', 'auto'] as const

interface SetModeInput {
  runId?: unknown
  mode?: unknown
}

interface SetModeDelegate {
  setMode?: (runId: string, mode: string) => boolean
}

function handleSetMode(req: SetModeInput, manager: SetModeDelegate): { accepted: boolean } {
  if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') {
    return { accepted: false }
  }
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
