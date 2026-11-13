import { describe, it, expect, vi } from 'vitest'
import { createRunManager } from '../../../02_Project/00_Source/main/00_ipc/agentRuns'
import type { RunManager } from '../../../02_Project/00_Source/main/00_ipc/agentRuns'
import type { AgentBackend, AgentRun, AgentRunInput } from '../../../02_Project/00_Source/main/01_agents/AgentBackend'
import type { AgentEvent } from '../../../02_Project/00_Source/shared/agentEvents'
import type { BackendId } from '../../../02_Project/00_Source/shared/ipcContract'

// Layer A 실물 검사 — ipcMain.handle을 가로채 registerAgentHandlers가 등록한 AGENT_RUN 핸들러에
// 신뢰할 수 없는 orchestration 값을 넣고, runManager.start가 받은 정규화 결과를 읽는다
const h = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>() }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown): void => {
      h.handlers.set(ch, fn)
    },
  },
}))

vi.mock('../../../02_Project/00_Source/main/01_agents/registry', () => ({
  getBackend: (): unknown => ({}),
}))

import { registerAgentHandlers } from '../../../02_Project/00_Source/main/00_ipc/handlers/agent'
import { IPC_CHANNELS } from '../../../02_Project/00_Source/shared/ipcContract'

async function applyOrchestrationNormalize(raw: unknown): Promise<unknown> {
  let captured: AgentRunInput | undefined
  const runManager = {
    start: async (_backend: AgentBackend, input: AgentRunInput): Promise<string> => {
      captured = input
      return 'run-orc'
    },
  }
  h.handlers.clear()
  registerAgentHandlers({ state: { win: null }, runManager: runManager as unknown as RunManager })
  const handler = h.handlers.get(IPC_CHANNELS.AGENT_RUN)
  if (!handler) throw new Error('AGENT_RUN 핸들러가 등록되지 않았다')
  await handler({} as never, { messages: [{ role: 'user', content: 'hello' }], orchestration: raw })
  if (!captured) throw new Error('runManager.start가 호출되지 않았다')
  return captured.orchestration
}

function makeFakeRun(captured?: { req?: AgentRunInput }): AgentRun {
  return {
    events: (async function* () {
      yield { type: 'done' } as AgentEvent
    })(),
    abort: () => {},
    interrupt: () => {},
    push: () => {},
    respond: () => {},
    ...(captured ? {} : {}),
  }
}

function makeSpyBackend(): { backend: AgentBackend; startSpy: ReturnType<typeof vi.fn> } {
  const startSpy = vi.fn((_req: AgentRunInput): AgentRun => makeFakeRun())

  const backend: AgentBackend = {
    id: 'claude-code' as BackendId,
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    start: startSpy,
    listSupportedCommands: () => [],
  }

  return { backend, startSpy }
}

describe('orchestration 정규화 — `=== true` 표현식 계약 고정 (Layer A)', () => {

  describe('ORC-1: boolean true → true (정상 케이스)', () => {
    it('true → true', async () => {
      expect(await applyOrchestrationNormalize(true)).toBe(true)
    })
  })

  describe('ORC-2: boolean false → false', () => {
    it('false → false', async () => {
      expect(await applyOrchestrationNormalize(false)).toBe(false)
    })
  })

  describe('ORC-3: undefined(미전달) → false', () => {
    it('undefined → false', async () => {
      expect(await applyOrchestrationNormalize(undefined)).toBe(false)
    })
  })

  describe('신뢰경계 핵심: truthy non-boolean → false (통과 금지)', () => {
    it('ORC-4: number 1 → false (truthy지만 boolean true 아님)', async () => {
      expect(await applyOrchestrationNormalize(1)).toBe(false)
    })

    it('ORC-5: string "true" → false (truthy지만 boolean true 아님)', async () => {
      expect(await applyOrchestrationNormalize('true')).toBe(false)
    })

    it('ORC-6: string "1" → false (truthy지만 boolean true 아님)', async () => {
      expect(await applyOrchestrationNormalize('1')).toBe(false)
    })

    it('ORC-7: {} (truthy object) → false (boolean true 아님)', async () => {
      expect(await applyOrchestrationNormalize({})).toBe(false)
    })

    it('ORC-7b: [] (truthy array) → false', async () => {
      expect(await applyOrchestrationNormalize([])).toBe(false)
    })

    it('ORC-7c: 임의 함수 → false', async () => {
      expect(await applyOrchestrationNormalize(() => true)).toBe(false)
    })
  })

  describe('ORC-8: null → false', () => {
    it('null → false', async () => {
      expect(await applyOrchestrationNormalize(null)).toBe(false)
    })
  })

  describe('기타 falsy 값 → false', () => {
    it('0 → false', async () => {
      expect(await applyOrchestrationNormalize(0)).toBe(false)
    })

    it('빈문자열("") → false', async () => {
      expect(await applyOrchestrationNormalize('')).toBe(false)
    })
  })

  describe('boolean true만 엄격히 통과 — 불변 단정', () => {
    it('typeof 결과가 boolean이고 값이 true인 경우만 true', async () => {
      const trueCases = [true]
      const falseCases = [false, 0, 1, '', 'true', '1', null, undefined, {}, [], () => {}, -1, NaN]

      for (const v of trueCases) {
        expect(await applyOrchestrationNormalize(v)).toBe(true)
      }
      for (const v of falseCases) {
        expect(await applyOrchestrationNormalize(v)).toBe(false)
      }
    })
  })
})

describe('B1 — backend.start에 orchestration 전달 보장 (Layer B spy 패턴)', () => {

  it('orchestration: true → backend.start에 orchestration: true 전달', async () => {
    const { backend, startSpy } = makeSpyBackend()
    const manager = createRunManager()

    await manager.start(
      backend,
      { messages: [{ role: 'user', content: 'hello' }], orchestration: true },
      () => {}
    )

    expect(startSpy).toHaveBeenCalledOnce()
    const req: AgentRunInput = startSpy.mock.calls[0][0]
    expect(req.orchestration).toBe(true)
  })

  it('orchestration: false → backend.start에 orchestration: false 전달', async () => {
    const { backend, startSpy } = makeSpyBackend()
    const manager = createRunManager()

    await manager.start(
      backend,
      { messages: [{ role: 'user', content: 'hello' }], orchestration: false },
      () => {}
    )

    expect(startSpy).toHaveBeenCalledOnce()
    const req: AgentRunInput = startSpy.mock.calls[0][0]
    expect(req.orchestration).toBe(false)
  })

  it('orchestration 미전달(undefined) → backend.start에 orchestration: undefined 전달', async () => {
    const { backend, startSpy } = makeSpyBackend()
    const manager = createRunManager()

    await manager.start(
      backend,
      { messages: [{ role: 'user', content: 'hello' }] },
      () => {}
    )

    expect(startSpy).toHaveBeenCalledOnce()
    const req: AgentRunInput = startSpy.mock.calls[0][0]
    expect(req.orchestration).toBeFalsy()
  })
  // 「IPC 핸들러 정규화 시뮬레이션」 it 3개(number 1·"true"·{})는 지웠다 — 정규화 식을 테스트 안에서 다시 계산하는
  // 복제 검사였고, 같은 입력은 위 Layer A가 실제 AGENT_RUN 핸들러로 검사한다 (M05 G3 검수 경미 1).
})
