import { describe, it, expect, vi } from 'vitest'
import { createRunManager } from '../../../02_Project/00_Source/main/00_ipc/agentRuns'
import type { AgentBackend, AgentRun, AgentRunInput } from '../../../02_Project/00_Source/main/01_agents/AgentBackend'
import type { AgentEvent } from '../../../02_Project/00_Source/shared/agentEvents'
import type { BackendId } from '../../../02_Project/00_Source/shared/ipcContract'

function applyOrchestrationNormalize(raw: unknown): boolean {
  return raw === true
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
    it('true → true', () => {
      expect(applyOrchestrationNormalize(true)).toBe(true)
    })
  })

  describe('ORC-2: boolean false → false', () => {
    it('false → false', () => {
      expect(applyOrchestrationNormalize(false)).toBe(false)
    })
  })

  describe('ORC-3: undefined(미전달) → false', () => {
    it('undefined → false', () => {
      expect(applyOrchestrationNormalize(undefined)).toBe(false)
    })
  })

  describe('신뢰경계 핵심: truthy non-boolean → false (통과 금지)', () => {
    it('ORC-4: number 1 → false (truthy지만 boolean true 아님)', () => {
      expect(applyOrchestrationNormalize(1)).toBe(false)
    })

    it('ORC-5: string "true" → false (truthy지만 boolean true 아님)', () => {
      expect(applyOrchestrationNormalize('true')).toBe(false)
    })

    it('ORC-6: string "1" → false (truthy지만 boolean true 아님)', () => {
      expect(applyOrchestrationNormalize('1')).toBe(false)
    })

    it('ORC-7: {} (truthy object) → false (boolean true 아님)', () => {
      expect(applyOrchestrationNormalize({})).toBe(false)
    })

    it('ORC-7b: [] (truthy array) → false', () => {
      expect(applyOrchestrationNormalize([])).toBe(false)
    })

    it('ORC-7c: 임의 함수 → false', () => {
      expect(applyOrchestrationNormalize(() => true)).toBe(false)
    })
  })

  describe('ORC-8: null → false', () => {
    it('null → false', () => {
      expect(applyOrchestrationNormalize(null)).toBe(false)
    })
  })

  describe('기타 falsy 값 → false', () => {
    it('0 → false', () => {
      expect(applyOrchestrationNormalize(0)).toBe(false)
    })

    it('빈문자열("") → false', () => {
      expect(applyOrchestrationNormalize('')).toBe(false)
    })
  })

  describe('boolean true만 엄격히 통과 — 불변 단정', () => {
    it('typeof 결과가 boolean이고 값이 true인 경우만 true', () => {
      const trueCases = [true]
      const falseCases = [false, 0, 1, '', 'true', '1', null, undefined, {}, [], () => {}, -1, NaN]

      for (const v of trueCases) {
        expect(applyOrchestrationNormalize(v)).toBe(true)
      }
      for (const v of falseCases) {
        expect(applyOrchestrationNormalize(v)).toBe(false)
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

  it('IPC 핸들러가 정규화 후 false를 전달하는 시나리오 시뮬레이션: number 1 → 정규화 결과 false', async () => {
    const untrustedOrchestration: unknown = 1
    const normalizedOrchestration = untrustedOrchestration === true

    const { backend, startSpy } = makeSpyBackend()
    const manager = createRunManager()

    await manager.start(
      backend,
      { messages: [{ role: 'user', content: 'test' }], orchestration: normalizedOrchestration },
      () => {}
    )

    expect(startSpy).toHaveBeenCalledOnce()
    const req: AgentRunInput = startSpy.mock.calls[0][0]
    expect(req.orchestration).toBe(false)
  })

  it('IPC 핸들러 정규화 시뮬레이션: string "true" → 정규화 결과 false', async () => {
    const untrustedOrchestration: unknown = 'true'
    const normalizedOrchestration = untrustedOrchestration === true

    const { backend, startSpy } = makeSpyBackend()
    const manager = createRunManager()

    await manager.start(
      backend,
      { messages: [{ role: 'user', content: 'test' }], orchestration: normalizedOrchestration },
      () => {}
    )

    expect(startSpy).toHaveBeenCalledOnce()
    const req: AgentRunInput = startSpy.mock.calls[0][0]
    expect(req.orchestration).toBe(false)
  })

  it('IPC 핸들러 정규화 시뮬레이션: {} (truthy object) → 정규화 결과 false', async () => {
    const untrustedOrchestration: unknown = {}
    const normalizedOrchestration = untrustedOrchestration === true

    const { backend, startSpy } = makeSpyBackend()
    const manager = createRunManager()

    await manager.start(
      backend,
      { messages: [{ role: 'user', content: 'test' }], orchestration: normalizedOrchestration },
      () => {}
    )

    expect(startSpy).toHaveBeenCalledOnce()
    const req: AgentRunInput = startSpy.mock.calls[0][0]
    expect(req.orchestration).toBe(false)
  })
})
