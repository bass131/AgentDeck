import { describe, it, expect } from 'vitest'
import { createRunManager } from '../../../02_Project/00_Source/main/00_ipc/agentRuns'
import type { RunManager } from '../../../02_Project/00_Source/main/00_ipc/agentRuns'
import type { AgentBackend, AgentRun, AgentRunInput } from '../../../02_Project/00_Source/main/01_agents/AgentBackend'
import type { AgentEvent } from '../../../02_Project/00_Source/shared/agentEvents'
import type { BackendId } from '../../../02_Project/00_Source/shared/ipcContract'
import { KNOWN_MODELS, resolveSetModelRequest } from '../../../02_Project/00_Source/main/01_agents/runArgs'

type RunWithSetModel = AgentRun & { setModel?: (modelId: string) => void }
type ManagerWithSetModel = RunManager & { setModel?: (runId: string, model: string) => boolean }

function makeModelRun(
  opts: { modelCalls?: string[]; withSetModel?: boolean; holdMs?: number } = {}
): RunWithSetModel {
  const run: RunWithSetModel = {
    events: (async function* () {
      await new Promise<void>((r) => setTimeout(r, opts.holdMs ?? 200))
      yield { type: 'done' } as AgentEvent
    })(),
    abort: () => {},
    interrupt: () => {},
    push: () => {},
    respond: () => {},
  }
  if (opts.withSetModel !== false) {
    run.setModel = (modelId) => {
      opts.modelCalls?.push(modelId)
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

describe('LM1 P03 ⑨ RunManager.setModel — 라이브 모델 전환 라우팅 (RED)', () => {
  it('createRunManager()가 setModel 메서드를 노출한다', () => {
    const manager = createRunManager() as ManagerWithSetModel
    expect(typeof manager.setModel).toBe('function')
  })

  it('활성 run → true + run.setModel(model) 위임 — 받은 값 원문 그대로(순수 라우터)', async () => {
    const modelCalls: string[] = []
    const manager = createRunManager() as ManagerWithSetModel
    const runId = await manager.start(backendOf(makeModelRun({ modelCalls })), { messages: [] }, () => {})

    const accepted = manager.setModel?.(runId, 'claude-haiku-4-5')

    expect(accepted).toBe(true)
    expect(modelCalls).toEqual(['claude-haiku-4-5'])
  })

  it('미존재 runId → false (no-op, throw 없음)', () => {
    const manager = createRunManager() as ManagerWithSetModel
    expect(manager.setModel?.('nonexistent-run-id', 'haiku')).toBe(false)
  })

  it('완료된 run → false (setMode/taskStop과 동일 no-op 일관성)', async () => {
    const modelCalls: string[] = []
    const manager = createRunManager() as ManagerWithSetModel
    const runId = await manager.start(
      backendOf(makeModelRun({ modelCalls, holdMs: 0 })),
      { messages: [] },
      () => {}
    )
    await new Promise<void>((r) => setTimeout(r, 100))

    expect(manager.setModel?.(runId, 'haiku')).toBe(false)
    expect(modelCalls).toHaveLength(0)
  })

  it('setModel 미구현 run(Echo류) → 수락(true) + throw 없음 (optional chaining no-op — setMode 미러)', async () => {
    const manager = createRunManager() as ManagerWithSetModel
    const runId = await manager.start(
      backendOf(makeModelRun({ withSetModel: false })),
      { messages: [] },
      () => {}
    )

    let accepted: boolean | undefined
    expect(() => {
      accepted = manager.setModel?.(runId, 'sonnet')
    }).not.toThrow()
    expect(accepted).toBe(true)
  })
})

interface SetModelInput {
  runId?: unknown
  model?: unknown
}

interface SetModelDelegate {
  setModel?: (runId: string, model: string) => boolean
}

function handleSetModel(req: SetModelInput, manager: SetModelDelegate): { accepted: boolean } {
  const resolved = resolveSetModelRequest(req)
  if (resolved === null) {
    return { accepted: false }
  }
  const accepted = manager.setModel?.(resolved.runId, resolved.model) === true
  return { accepted }
}

function makeRecordingDelegate(ret: boolean): {
  delegate: SetModelDelegate
  calls: Array<{ runId: string; model: string }>
} {
  const calls: Array<{ runId: string; model: string }> = []
  return {
    delegate: {
      setModel(runId, model) {
        calls.push({ runId, model })
        return ret
      },
    },
    calls,
  }
}

describe('LM1 P03 핸들러 guard — runId 검증 (untrusted)', () => {
  it('② runId가 undefined면 accepted:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleSetModel({ model: 'haiku' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it('② runId가 빈 문자열/공백만이면 accepted:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleSetModel({ runId: '', model: 'haiku' }, delegate)).toEqual({ accepted: false })
    expect(handleSetModel({ runId: '   ', model: 'haiku' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it('② runId가 number(타입 불일치)면 accepted:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleSetModel({ runId: 123, model: 'haiku' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })
})

describe('LM1 P03 핸들러 guard — model KNOWN_MODELS 화이트리스트 (CORE-01)', () => {
  it("④ KNOWN_MODELS 밖('gpt-5' — 미지 엔진 id) → accepted:false + 위임 0건", () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleSetModel({ runId: 'run-1', model: 'gpt-5' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it("④ 임의 문자열('x; rm -rf' — 인젝션류 페이로드) → accepted:false + 위임 0건", () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleSetModel({ runId: 'run-1', model: 'x; rm -rf' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it('③ model이 비-string(객체/undefined/빈 문자열)이면 accepted:false + 위임 0건', () => {
    const { delegate, calls } = makeRecordingDelegate(true)
    expect(handleSetModel({ runId: 'run-1', model: { evil: true } }, delegate)).toEqual({ accepted: false })
    expect(handleSetModel({ runId: 'run-1' }, delegate)).toEqual({ accepted: false })
    expect(handleSetModel({ runId: 'run-1', model: '' }, delegate)).toEqual({ accepted: false })
    expect(calls).toHaveLength(0)
  })

  it('① KNOWN_MODELS 전종(full ID) → 정규화가 항등이라 인자 그대로 위임 + accepted 미러', () => {
    for (const model of KNOWN_MODELS) {
      const { delegate, calls } = makeRecordingDelegate(true)
      expect(handleSetModel({ runId: 'run-abc', model }, delegate)).toEqual({ accepted: true })
      expect(calls).toEqual([{ runId: 'run-abc', model }])
    }
  })

  it("⑤ delegate가 false(미존재/완료 run) → accepted:false (검증 통과해도 라우팅 실패 반영)", () => {
    const { delegate, calls } = makeRecordingDelegate(false)
    expect(handleSetModel({ runId: 'run-gone', model: 'haiku' }, delegate)).toEqual({ accepted: false })
    expect(calls).toEqual([{ runId: 'run-gone', model: 'claude-haiku-4-5' }])
  })

  it('⑥ 비정상 입력(null·중첩객체·number)에도 throw 금지 — 항상 응답 반환', () => {
    const { delegate } = makeRecordingDelegate(true)
    expect(() => handleSetModel(null as unknown as SetModelInput, delegate)).not.toThrow()
    expect(handleSetModel(null as unknown as SetModelInput, delegate)).toEqual({ accepted: false })
    expect(() => handleSetModel({ runId: {}, model: [] }, delegate)).not.toThrow()
    expect(handleSetModel({ runId: {}, model: [] }, delegate)).toEqual({ accepted: false })
  })
})

describe('LM1 P03 핸들러 guard — 실 RunManager 경유 (RED)', () => {
  it('① happy path — 활성 run 전환 요청이 수락되고 run.setModel에 도달한다 (RED)', async () => {
    const modelCalls: string[] = []
    const manager = createRunManager() as ManagerWithSetModel
    const runId = await manager.start(backendOf(makeModelRun({ modelCalls })), { messages: [] }, () => {})

    const result = handleSetModel({ runId, model: 'haiku' }, manager)
    expect(result).toEqual({ accepted: true })
    expect(modelCalls).toEqual(['claude-haiku-4-5'])
  })

  it('⑤ 미존재 runId는 검증을 통과해도 accepted:false(존재 검증 — 임의 통과 0)', () => {
    const manager = createRunManager() as ManagerWithSetModel
    const result = handleSetModel({ runId: 'no-such-run', model: 'sonnet' }, manager)
    expect(result).toEqual({ accepted: false })
  })
})

interface SessionSpy {
  setModelCalls: string[]
  pushedContents: string[]
  orderedCalls: string[]
  run: AgentRun
}

function makeSessionBackend(sessions: SessionSpy[]): AgentBackend {
  return {
    id: 'claude-code' as BackendId,
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    listSupportedCommands: () => [],
    start: (): AgentRun => {
      const setModelCalls: string[] = []
      const pushedContents: string[] = []
      const orderedCalls: string[] = []

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

      const run: RunWithSetModel = {
        events: iterable,
        abort: () => {
          release?.()
        },
        interrupt: () => {},
        push: (content: string) => {
          pushedContents.push(content)
          orderedCalls.push(`push:${content}`)
        },
        setModel: (modelId: string) => {
          setModelCalls.push(modelId)
          orderedCalls.push(`setModel:${modelId}`)
        },
        respond: () => {},
      }

      sessions.push({ setModelCalls, pushedContents, orderedCalls, run })
      return run
    },
  }
}

async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

const SESSION_KEY = 'lm1-p03-sess'

async function driveReuse(
  manager: RunManager,
  backend: AgentBackend,
  sessions: SessionSpy[],
  secondReq: Partial<AgentRunInput>
): Promise<SessionSpy> {
  const onEvent = (): void => {}
  await manager.start(
    backend,
    { messages: [{ role: 'user', content: 'first turn' }], persistent: true, sessionKey: SESSION_KEY, model: 'sonnet' },
    onEvent
  )
  await flushMicrotasks()
  await manager.start(
    backend,
    { messages: [{ role: 'user', content: 'second turn' }], persistent: true, sessionKey: SESSION_KEY, ...secondReq },
    onEvent
  )
  await flushMicrotasks()
  return sessions[0]
}

describe('LM1 P03 재사용 경로 안전망 — 자기치유 재위임 (RED)', () => {
  it('⑦ 재사용 턴에서 req.model=haiku → setModelFn(haiku) 재위임 (pushFn보다 먼저)', async () => {
    const manager = createRunManager()
    const sessions: SessionSpy[] = []
    const backend = makeSessionBackend(sessions)
    try {
      const session = await driveReuse(manager, backend, sessions, { model: 'haiku' })

      expect(sessions).toHaveLength(1)
      expect(session.setModelCalls).toEqual(['haiku'])
      const setModelIdx = session.orderedCalls.indexOf('setModel:haiku')
      const pushIdx = session.orderedCalls.indexOf('push:second turn')
      expect(setModelIdx).toBeGreaterThanOrEqual(0)
      expect(pushIdx).toBeGreaterThanOrEqual(0)
      expect(setModelIdx).toBeLessThan(pushIdx)
    } finally {
      manager.closeAll()
    }
  })

  it('⑧ 재사용 턴에서 req.model undefined → setModelFn 미호출(skip) — pushFn만 (GREEN 핀)', async () => {
    const manager = createRunManager()
    const sessions: SessionSpy[] = []
    const backend = makeSessionBackend(sessions)
    try {
      const session = await driveReuse(manager, backend, sessions, {})

      expect(sessions).toHaveLength(1)
      expect(session.setModelCalls).toHaveLength(0)
      expect(session.pushedContents).toEqual(['second turn'])
    } finally {
      manager.closeAll()
    }
  })
})
