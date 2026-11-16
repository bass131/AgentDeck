import { describe, it, expect, vi } from 'vitest'
import type { RunResponse } from '@main/03_Agent/AgentBackend'
import type { RunManager } from '@main/03_Agent/agentRuns'

// 실물 핸들러 검사 — ipcMain.handle을 가로채 registerAgentHandlers가 등록한 PERMISSION_RESPOND를 직접 부른다
const h = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>() }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown): void => {
      h.handlers.set(ch, fn)
    },
  },
}))

vi.mock('@main/00_App/registry', () => ({
  getBackend: (): unknown => ({}),
}))

import { registerAgentHandlers } from '@main/01_Ipc/handlers/agent'
import { IPC_CHANNELS } from '../../../../02_Project/00_Source/shared/ipcContract'

interface PermissionResponseInput {
  runId?: unknown
  requestId?: unknown
  behavior?: unknown
}

function handlePermissionRespond(
  req: PermissionResponseInput,
  runManager: Pick<RunManager, 'respond'>
): { ok: boolean } {
  h.handlers.clear()
  registerAgentHandlers({ state: { win: null }, runManager: runManager as unknown as RunManager })
  const handler = h.handlers.get(IPC_CHANNELS.PERMISSION_RESPOND)
  if (!handler) throw new Error('PERMISSION_RESPOND 핸들러가 등록되지 않았다')
  return handler({} as never, req) as { ok: boolean }
}

function makeFakeRunManager(respondReturnValue: boolean): {
  manager: Pick<RunManager, 'respond'>
  calls: Array<{ runId: string; requestId: string; response: RunResponse }>
} {
  const calls: Array<{ runId: string; requestId: string; response: RunResponse }> = []
  return {
    manager: {
      respond(runId, requestId, response) {
        calls.push({ runId, requestId, response })
        return respondReturnValue
      }
    },
    calls
  }
}

describe('PERMISSION_RESPOND 핸들러 입력 검증', () => {
  describe('runId 검증', () => {
    it('runId가 undefined면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { requestId: 'req-1', behavior: 'allow' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('runId가 빈 문자열이면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { runId: '', requestId: 'req-1', behavior: 'allow' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('runId가 공백만 있으면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { runId: '   ', requestId: 'req-1', behavior: 'allow' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('runId가 number면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { runId: 123, requestId: 'req-1', behavior: 'allow' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })
  })

  describe('requestId 검증', () => {
    it('requestId가 undefined면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { runId: 'run-1', behavior: 'allow' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('requestId가 빈 문자열이면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { runId: 'run-1', requestId: '', behavior: 'allow' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })
  })

  describe('behavior allowlist 검증', () => {
    it('behavior가 undefined면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { runId: 'run-1', requestId: 'req-1' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('behavior가 알 수 없는 값이면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { runId: 'run-1', requestId: 'req-1', behavior: 'permit' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('behavior가 빈 문자열이면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { runId: 'run-1', requestId: 'req-1', behavior: '' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('behavior가 대소문자 불일치("Allow")면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { runId: 'run-1', requestId: 'req-1', behavior: 'Allow' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it.each(['allow', 'allow_always', 'deny'] as const)(
      '올바른 behavior "%s"는 검증을 통과한다',
      (behavior) => {
        const { manager, calls } = makeFakeRunManager(true)
        const result = handlePermissionRespond(
          { runId: 'run-1', requestId: 'req-1', behavior },
          manager
        )
        expect(result).toEqual({ ok: true })
        expect(calls).toHaveLength(1)
        expect(calls[0].response).toEqual({ kind: 'permission', behavior })
      }
    )
  })

  describe('RunManager.respond 위임', () => {
    it('검증 통과 시 runManager.respond에 올바른 인자를 전달한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      handlePermissionRespond(
        { runId: 'run-abc', requestId: 'req-xyz', behavior: 'allow_always' },
        manager
      )
      expect(calls).toHaveLength(1)
      expect(calls[0]).toEqual({
        runId: 'run-abc',
        requestId: 'req-xyz',
        response: { kind: 'permission', behavior: 'allow_always' }
      })
    })

    it('runManager.respond가 true를 반환하면 { ok: true }를 반환한다', () => {
      const { manager } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { runId: 'run-1', requestId: 'req-1', behavior: 'deny' },
        manager
      )
      expect(result).toEqual({ ok: true })
    })

    it('runManager.respond가 false(미존재 run)를 반환하면 { ok: false }를 반환한다', () => {
      const { manager } = makeFakeRunManager(false)
      const result = handlePermissionRespond(
        { runId: 'nonexistent', requestId: 'req-1', behavior: 'allow' },
        manager
      )
      expect(result).toEqual({ ok: false })
    })

    it('runManager.respond가 false(완료된 run)를 반환하면 { ok: false }를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(false)
      const result = handlePermissionRespond(
        { runId: 'done-run', requestId: 'req-1', behavior: 'allow' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(1)
    })
  })
})

// M05 G10 ack 통일 — 옛 { accepted }를 돌려주던 agent 5채널이 permissionRespond와 같은 { ok }를 돌려준다.
describe('agent ack 5채널 실물 응답 모양 (M05 G10)', () => {
  const ackChannels = [
    IPC_CHANNELS.AGENT_ABORT,
    IPC_CHANNELS.AGENT_INTERRUPT,
    IPC_CHANNELS.AGENT_TASK_STOP,
    IPC_CHANNELS.AGENT_SET_MODE,
    IPC_CHANNELS.AGENT_SET_MODEL,
  ] as const
  const valid: Record<(typeof ackChannels)[number], unknown> = {
    'agent.abort': { runId: 'r1' },
    'agent.interrupt': { runId: 'r1' },
    'agent.taskStop': { runId: 'r1', taskId: 't1' },
    'agent.setMode': { runId: 'r1', mode: 'plan' },
    'agent.setModel': { runId: 'r1', model: 'claude-sonnet-5' },
  }

  function register(result: boolean): void {
    h.handlers.clear()
    const delegate = (): boolean => result
    const manager = { abort: delegate, interrupt: delegate, taskStop: delegate, setMode: delegate, setModel: delegate }
    registerAgentHandlers({ state: { win: null }, runManager: manager as unknown as RunManager })
  }

  for (const ch of ackChannels) {
    it(`${ch}: 위임 결과를 { ok }로 미러하고 { accepted }는 더 없다`, () => {
      register(true)
      const handler = h.handlers.get(ch)
      expect(handler).toBeTypeOf('function')
      expect(handler?.({} as never, valid[ch])).toEqual({ ok: true })
      register(false)
      expect(h.handlers.get(ch)?.({} as never, valid[ch])).toEqual({ ok: false })
    })

    it(`${ch}: 잘못된 요청은 위임 없이 { ok: false }다`, () => {
      register(true)
      expect(h.handlers.get(ch)?.({} as never, null)).toEqual({ ok: false })
    })
  }
})
