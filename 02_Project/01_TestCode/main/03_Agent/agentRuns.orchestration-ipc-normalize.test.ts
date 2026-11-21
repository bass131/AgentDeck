import { describe, it, expect, vi } from 'vitest'
import { createRunManager } from '@main/03_Agent/agentRuns'
import type { RunManager } from '@main/03_Agent/agentRuns'
import type { AgentBackend, AgentRun, AgentRunInput } from '@main/03_Agent/AgentBackend'
import type { AgentEvent } from '@shared/agentEvents'
import type { BackendId } from '@shared/ipcContract'

// 실물 AGENT_RUN 핸들러에 신뢰할 수 없는 값을 넣고 runManager.start가 받은 정규화 결과를 읽는다
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
import { IPC_CHANNELS } from '@shared/ipcContract'

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

async function captureRunInput(extra: Record<string, unknown>): Promise<AgentRunInput> {
  let captured: AgentRunInput | undefined
  const runManager = {
    start: async (_backend: AgentBackend, input: AgentRunInput): Promise<string> => {
      captured = input
      return 'run-cw'
    },
  }
  h.handlers.clear()
  registerAgentHandlers({ state: { win: null }, runManager: runManager as unknown as RunManager })
  const handler = h.handlers.get(IPC_CHANNELS.AGENT_RUN)
  if (!handler) throw new Error('AGENT_RUN 핸들러가 등록되지 않았다')
  await handler({} as never, { messages: [{ role: 'user', content: 'hello' }], ...extra })
  if (!captured) throw new Error('runManager.start가 호출되지 않았다')
  return captured
}

// 루프 잠금 노드는 실행기가 연 세션에만 붙는다 — 화면이 잠금을 붙이거나 환경을 바꿀 수 없다
describe('루프 세션 전용 칸은 IPC로 넘어가지 않는다 (M09 G2)', () => {
  it('요청에 env·loopLock이 있어도 실행 입력에는 없다', async () => {
    const input = await captureRunInput({
      env: { GH_TOKEN: 'x' },
      loopLock: { repoRoot: 'C:/r', appLoopDir: 'C:/a' },
    })
    expect(input).not.toHaveProperty('env')
    expect(input).not.toHaveProperty('loopLock')
  })
})

describe('contextWindow 정규화 (M06 G4)', () => {
  it('양의 정수는 그대로 넘긴다', async () => {
    expect((await captureRunInput({ contextWindow: 200_000 })).contextWindow).toBe(200_000)
  })
  it('미전달·0·음수·NaN·문자열은 undefined', async () => {
    for (const bad of [undefined, 0, -5, Number.NaN, '200000']) {
      expect((await captureRunInput({ contextWindow: bad })).contextWindow).toBeUndefined()
    }
  })
})

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
})
