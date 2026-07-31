import { describe, it, expect } from 'vitest'
import { createRunManager } from '../../../02_Source/main/00_ipc/agentRuns'
import {
  PermissionCoordinator,
  type CanUseToolFn,
} from '../../../02_Source/main/01_agents/permissionCoordinator'
import { buildClaudeSdkOptions, WORKFLOW_GATE_NOTICE } from '../../../02_Source/main/01_agents/sdkOptions'
import type {
  AgentBackend,
  AgentRun,
  AgentRunInput,
} from '../../../02_Source/main/01_agents/AgentBackend'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'
import type { BackendId } from '../../../02_Source/shared/ipcContract'

interface SessionRun {
  orchestrationAtCreation: boolean
  gate: CanUseToolFn
  coord: PermissionCoordinator
  gatePushed: AgentEvent[]
  pushedContents: string[]
  setOrchestrationCalls: boolean[]
  run: AgentRun
}

function makeSessionBackend(sessions: SessionRun[]): AgentBackend {
  return {
    id: 'claude-code' as BackendId,
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    listSupportedCommands: () => [],
    start: (req: AgentRunInput): AgentRun => {
      const gatePushed: AgentEvent[] = []
      const coord = new PermissionCoordinator((e) => gatePushed.push(e))
      const orchestrationAtCreation = req.orchestration === true
      let currentOrchestration = orchestrationAtCreation
      const setOrchestrationCalls: boolean[] = []
      const gate = coord.makeCanUseTool(req.mode, () => currentOrchestration)
      const pushedContents: string[] = []

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

      const run: AgentRun = {
        events: iterable,
        abort: () => {
          coord.cancelAll()
          release?.()
        },
        interrupt: () => {},
        push: (content: string) => {
          pushedContents.push(content)
        },
        setOrchestration: (value: boolean) => {
          setOrchestrationCalls.push(value)
          currentOrchestration = value
        },
        respond: (rid, res) => coord.respond(rid, res),
      }

      sessions.push({ orchestrationAtCreation, gate, coord, gatePushed, pushedContents, setOrchestrationCalls, run })
      return run
    },
  }
}

function makeHarness(): {
  manager: ReturnType<typeof createRunManager>
  backend: AgentBackend
  sessions: SessionRun[]
} {
  const sessions: SessionRun[] = []
  return { manager: createRunManager(), backend: makeSessionBackend(sessions), sessions }
}

async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

const SESSION_KEY = 'uc1-p01-sess'

async function driveTwoTurns(
  h: ReturnType<typeof makeHarness>,
  first: boolean,
  second: boolean,
  secondContent: string
): Promise<SessionRun> {
  const onEvent = (): void => {}
  await h.manager.start(
    h.backend,
    { messages: [{ role: 'user', content: 'first turn' }], persistent: true, sessionKey: SESSION_KEY, orchestration: first, mode: 'normal' },
    onEvent
  )
  await flushMicrotasks()
  await h.manager.start(
    h.backend,
    { messages: [{ role: 'user', content: secondContent }], persistent: true, sessionKey: SESSION_KEY, orchestration: second, mode: 'normal' },
    onEvent
  )
  await flushMicrotasks()
  return h.sessions[0]
}

describe('UC1-P01 (a) 후속 턴 orchestration 반영 — held-open 세션(ADR-032, UC1-P03 배선)', () => {
  it('(a-setup) 후속 턴은 새 세션이 아니라 기존 held-open 세션에 content push + orchestration 갱신 콜백을 받는다 — 배선 지점(GREEN)', async () => {
    const h = makeHarness()
    const session = await driveTwoTurns(h, false, true, 'follow-up turn (ON)')
    try {
      expect(h.sessions).toHaveLength(1)
      expect(session.orchestrationAtCreation).toBe(false)
      expect(session.pushedContents).toEqual(['follow-up turn (ON)'])
      expect(session.setOrchestrationCalls).toEqual([true])
    } finally {
      h.manager.closeAll()
    }
  })

  it('ⓐ-1 첫 턴 OFF → 후속 턴 ON: 후속 ON 턴의 Workflow가 승인 게이트로 반영된다(P03 GREEN)', async () => {
    const h = makeHarness()
    const session = await driveTwoTurns(h, false, true, 'follow-up turn (ON)')
    try {
      const signal = new AbortController().signal
      const gatePromise = session.gate('Workflow', {}, { signal, toolUseID: 'wf-turn2' })
      void gatePromise.catch(() => {})
      await flushMicrotasks()
      const permReqs = session.gatePushed.filter(
        (e): e is Extract<AgentEvent, { type: 'permission_request' }> => e.type === 'permission_request'
      )
      expect(permReqs).toHaveLength(1)
      session.run.respond(permReqs[0].requestId, { kind: 'permission', behavior: 'allow' })
      const result = await gatePromise
      expect(result.behavior).not.toBe('deny')
    } finally {
      h.manager.closeAll()
    }
  })

  it('ⓐ-2 [역방향] 첫 턴 ON → 후속 턴 OFF: 후속 OFF 턴의 Workflow가 G4로 재봉인된다(P03 GREEN)', async () => {
    const h = makeHarness()
    const session = await driveTwoTurns(h, true, false, 'follow-up turn (OFF)')
    try {
      const signal = new AbortController().signal
      const gatePromise = session.gate('Workflow', {}, { signal, toolUseID: 'wf-turn2' })
      void gatePromise.catch(() => {})
      await flushMicrotasks()
      const permReqs = session.gatePushed.filter((e) => e.type === 'permission_request')
      expect(permReqs).toHaveLength(0)
    } finally {
      h.manager.closeAll()
    }
  })
})

describe('UC1-P01 (b) G4 deny 회귀 고정(GREEN·불변)', () => {
  it('orchestration=false 게이트 → Workflow: permission_request 0 + 즉시 deny + orchestration_denied 1건(UC1-P09)', async () => {
    const pushed: AgentEvent[] = []
    const coord = new PermissionCoordinator((e) => pushed.push(e))
    const gate = coord.makeCanUseTool('normal', () => false)

    const result = await gate('Workflow', {}, { signal: new AbortController().signal, toolUseID: 'wf-off' })

    expect(result.behavior).toBe('deny')
    expect(pushed.filter((e) => e.type === 'permission_request')).toHaveLength(0)
    const denied = pushed.filter((e) => e.type === 'orchestration_denied')
    expect(denied).toHaveLength(1)
    expect(denied[0]).toMatchObject({ type: 'orchestration_denied', id: 'wf-off', reason: 'orchestration-off' })
  })

  it('orchestration=false 게이트 → mode:auto여도 Workflow는 즉시 deny(auto 조기허용 우회 X) + orchestration_denied 1건', async () => {
    const pushed: AgentEvent[] = []
    const coord = new PermissionCoordinator((e) => pushed.push(e))
    const gate = coord.makeCanUseTool('auto', () => false)

    const result = await gate('Workflow', {}, { signal: new AbortController().signal, toolUseID: 'wf-off-auto' })

    expect(result.behavior).toBe('deny')
    expect(pushed.filter((e) => e.type === 'permission_request')).toHaveLength(0)
    const denied = pushed.filter((e) => e.type === 'orchestration_denied')
    expect(denied).toHaveLength(1)
    expect(denied[0]).toMatchObject({ type: 'orchestration_denied', id: 'wf-off-auto', reason: 'orchestration-off' })
    expect(pushed).toHaveLength(1)
  })
})

describe('UC1-P02 (c) sdkOptions 스냅샷 — 새 스펙(Workflow 상시 노출 + 고지 상시 합성)', () => {
  const noopCanUse: CanUseToolFn = async (_t, input) => ({ behavior: 'allow', updatedInput: input })
  const noopDialog = async (): Promise<{ behavior: 'cancelled' }> => ({ behavior: 'cancelled' as const })

  it('신규스펙: buildClaudeSdkOptions(orchestration=false) → disallowedTools 부재(Workflow 상시 노출)', () => {
    const opts = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal', orchestration: false },
      abortController: new AbortController(),
      canUseTool: noopCanUse,
      skillOverrides: null,
      mcpDenied: null,
      onUserDialog: noopDialog,
    })

    expect('disallowedTools' in opts).toBe(false)
    expect((opts['systemPrompt'] as { append?: string }).append).toBe(WORKFLOW_GATE_NOTICE)
  })

  it('신규스펙: buildClaudeSdkOptions(orchestration 미전달) → disallowedTools 부재 + 고지 상시 합성', () => {
    const opts = buildClaudeSdkOptions({
      req: { messages: [], mode: 'normal' },
      abortController: new AbortController(),
      canUseTool: noopCanUse,
      skillOverrides: null,
      mcpDenied: null,
      onUserDialog: noopDialog,
    })

    expect('disallowedTools' in opts).toBe(false)
    const append = (opts['systemPrompt'] as { append?: string }).append
    expect(typeof append).toBe('string')
    expect(append as string).toContain(WORKFLOW_GATE_NOTICE)
  })
})
