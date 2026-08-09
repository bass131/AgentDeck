import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRunManager } from '../../../02_Project/00_Source/main/00_ipc/agentRuns'
import { ClaudeCodeBackend } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { AgentBackend, AgentRunInput } from '../../../02_Project/00_Source/main/01_agents/AgentBackend'
import type { AgentEvent, AgentEventDone } from '../../../02_Project/00_Source/shared/agentEvents'

function mkResult(turnLabel = 'turn') {
  return {
    type: 'result' as const,
    subtype: 'success' as const,
    is_error: false,
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: 1,
    result: turnLabel,
    stop_reason: 'end_turn',
    total_cost_usd: 0,
    usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    errors: [],
    uuid: 'uuid-0000-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-p12',
  }
}

function mkErrorResult(msg = 'engine stream failure (P12 fixture)') {
  return {
    type: 'result' as const,
    subtype: 'error_during_execution' as const,
    is_error: true,
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: 1,
    stop_reason: null,
    total_cost_usd: 0,
    usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    errors: [msg],
    uuid: 'uuid-0000-0000-0000-0000-0000000000e1' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-p12',
  }
}

function ss(state: 'idle' | 'running' | 'requires_action') {
  return {
    type: 'system' as const,
    subtype: 'session_state_changed' as const,
    state,
    uuid: '387c0f11-6230-424c-9f7f-edefffd2df6f',
    session_id: 'sess-p12',
  }
}

function mkAssistantToolUse(id: string) {
  return {
    type: 'assistant' as const,
    message: {
      content: [{ type: 'tool_use' as const, id, name: 'Bash', input: { command: 'echo late-after-error' } }],
    },
  }
}

type AgentEventError = Extract<AgentEvent, { type: 'error' }>

function errorsIn(events: AgentEvent[]): AgentEventError[] {
  return events.filter((e): e is AgentEventError => e.type === 'error')
}
function donesIn(events: AgentEvent[]): AgentEventDone[] {
  return events.filter((e): e is AgentEventDone => e.type === 'done')
}

async function flushMicrotasks(times = 32): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

async function waitUntil(cond: () => boolean, label: string, maxFlushes = 400): Promise<void> {
  for (let i = 0; i < maxFlushes; i++) {
    if (cond()) return
    await Promise.resolve()
  }
  throw new Error(`waitUntil 상한 초과(microtask ${maxFlushes}회): ${label}`)
}

function makeCountingBackend(queryFn: QueryFn): { backend: AgentBackend; startCount: () => number } {
  const claudeBackend = new ClaudeCodeBackend(queryFn)
  let count = 0
  const backend: AgentBackend = {
    id: 'claude-code',
    isAvailable: () => claudeBackend.isAvailable(),
    version: () => claudeBackend.version(),
    latestVersion: () => claudeBackend.latestVersion(),
    start: (req: AgentRunInput) => {
      count++
      return claudeBackend.start(req)
    },
    listSupportedCommands: (workspaceRoot) => claudeBackend.listSupportedCommands(workspaceRoot),
  }
  return { backend, startCount: () => count }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('§1 error terminal 고아 pump 종결 — ① abort 신호 · ② 생산자(prompt/queryFn) 종결 · ③ 후행 방출 0', () => {
  it('persistent is_error result → RunManager terminal cleanup 후: signal 발화(①RED)·park 해소+제너레이터 종결(②RED)·후행 tool 0(③핀)', async () => {
    const state = {
      abortController: undefined as AbortController | undefined,
      promptEnded: undefined as boolean | undefined,
      generatorFinalized: false,
    }

    const queryFn: QueryFn = async function* (p) {
      try {
        state.abortController = (p.options as { abortController?: AbortController } | undefined)
          ?.abortController
        const prompt = p.prompt as unknown as AsyncIterable<unknown>
        const inputIter = prompt[Symbol.asyncIterator]()
        const first = await inputIter.next()
        if (first.done) return

        const pendingPull = inputIter.next()
        void pendingPull.then((r) => {
          state.promptEnded = r.done === true
        })

        yield ss('running')
        yield mkErrorResult()
        yield mkAssistantToolUse('tu-late-1')

        await pendingPull
      } finally {
        state.generatorFinalized = true
      }
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const manager = createRunManager()
    const seen: AgentEvent[] = []
    const onEvent = (event: AgentEvent, _runId: string): void => {
      seen.push(event)
    }
    const KEY = 'conv-p12-orphan-1'

    const runId = await manager.start(
      backend,
      { messages: [{ role: 'user', content: '고아 pump 재현 턴' }], persistent: true, sessionKey: KEY },
      onEvent,
    )

    await waitUntil(() => errorsIn(seen).length >= 1, 'error 이벤트 onEvent 도달')
    await flushMicrotasks()

    const observed = {
      runIdStable: runId === KEY,
      errorsSeen: errorsIn(seen).length,
      errorMessage: errorsIn(seen)[0]?.message ?? null,
      signalAborted: state.abortController?.signal.aborted === true,
      promptEnded: state.promptEnded === true,
      generatorFinalized: state.generatorFinalized,
      lateToolCalls: seen.filter((e) => e.type === 'tool_call').length,
      latePermissions: seen.filter((e) => e.type === 'permission_request').length,
    }

    expect(observed).toEqual({
      runIdStable: true,
      errorsSeen: 1,
      errorMessage: 'engine stream failure (P12 fixture)',
      signalAborted: true,
      promptEnded: true,
      generatorFinalized: true,
      lateToolCalls: 0,
      latePermissions: 0,
    })

    manager.closeAll()
    await flushMicrotasks()
  })
})

describe('§2 error terminal 후 동일 sessionKey 재시작 — 죽은 라우팅 잔존 없음(backend.start 2회, GREEN 핀)', () => {
  it('persistent error 종결 → 동일 sessionKey 후속 start가 새 세션을 열고(start 2회) 그 턴이 완주(done 도달)', async () => {
    let invocation = 0
    const queryFn: QueryFn = async function* (p) {
      invocation++
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return

      if (invocation === 1) {
        yield ss('running')
        yield mkErrorResult('first session failure (P12 fixture)')
        await inputIter.next()
      } else {
        yield mkResult('second-session-turn')
        await inputIter.next()
      }
    }

    const { backend, startCount } = makeCountingBackend(queryFn)
    const manager = createRunManager()
    const seen: AgentEvent[] = []
    const onEvent = (event: AgentEvent, _runId: string): void => {
      seen.push(event)
    }
    const KEY = 'conv-p12-orphan-2'

    const runId1 = await manager.start(
      backend,
      { messages: [{ role: 'user', content: '세션1 — error로 죽을 턴' }], persistent: true, sessionKey: KEY },
      onEvent,
    )
    await waitUntil(() => errorsIn(seen).length >= 1, '세션1 error 도달')
    await flushMicrotasks()
    const errorIdx = seen.findIndex((e) => e.type === 'error')

    const runId2 = await manager.start(
      backend,
      { messages: [{ role: 'user', content: '세션2 — 재시작 턴' }], persistent: true, sessionKey: KEY },
      onEvent,
    )
    await waitUntil(
      () => seen.slice(errorIdx + 1).some((e) => e.type === 'done'),
      '세션2 done 도달(error 이후)',
    )

    const observed = {
      startCallsAfterResend: startCount(),
      runIdsStable: runId1 === KEY && runId2 === KEY,
      doneAfterError: donesIn(seen.slice(errorIdx + 1)).length >= 1,
    }

    manager.closeAll()
    await flushMicrotasks()

    expect(observed).toEqual({
      startCallsAfterResend: 2,
      runIdsStable: true,
      doneAfterError: true,
    })
  })
})
