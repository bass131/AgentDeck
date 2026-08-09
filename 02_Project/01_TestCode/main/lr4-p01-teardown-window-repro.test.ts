import { describe, it, expect } from 'vitest'
import { createRunManager } from '../../../02_Project/00_Source/main/00_ipc/agentRuns'
import { ClaudeCodeBackend } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { AgentBackend, AgentRunInput } from '../../../02_Project/00_Source/main/01_agents/AgentBackend'
import type { AgentEvent } from '../../../02_Project/00_Source/shared/agentEvents'

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}

function mkResult(turnLabel: string) {
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
    uuid: `uuid-${turnLabel}-0000-0000-000000000001` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-lr4-p01',
  }
}

async function flushMicrotasks(times = 16): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

async function openTeardownWindow() {
  const inputGenClosed = deferred()
  const releaseOldQueryTeardown = deferred()
  const secondTurnDone = deferred()
  const seen: AgentEvent[] = []
  let backendStartCount = 0
  let queryCallCount = 0
  let firstInputPullClosed = false
  let doneCount = 0

  const queryFn: QueryFn = async function* (p) {
    const call = ++queryCallCount
    const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
    const inputIter = prompt[Symbol.asyncIterator]()
    const first = await inputIter.next()
    if (first.done) return

    yield mkResult(`turn-${call}`)

    if (call === 1) {
      const second = await inputIter.next()
      firstInputPullClosed = second.done === true
      inputGenClosed.resolve()
      await releaseOldQueryTeardown.promise
    }
  }

  const claudeBackend = new ClaudeCodeBackend(queryFn)
  const countingBackend: AgentBackend = {
    id: 'claude-code',
    isAvailable: () => claudeBackend.isAvailable(),
    version: () => claudeBackend.version(),
    latestVersion: () => claudeBackend.latestVersion(),
    start: (req: AgentRunInput) => {
      backendStartCount++
      return claudeBackend.start(req)
    },
    listSupportedCommands: (workspaceRoot) => claudeBackend.listSupportedCommands(workspaceRoot),
  }

  const manager = createRunManager()
  const onEvent = (event: AgentEvent): void => {
    seen.push(event)
    if (event.type === 'done') {
      doneCount++
      if (doneCount === 2) secondTurnDone.resolve()
    }
  }

  await manager.start(
    countingBackend,
    { messages: [{ role: 'user', content: 'turn1' }], persistent: true, sessionKey: 'conv-lr4-window' },
    onEvent,
  )

  await inputGenClosed.promise
  await manager.start(
    countingBackend,
    { messages: [{ role: 'user', content: 'turn2' }], persistent: true, sessionKey: 'conv-lr4-window' },
    onEvent,
  )
  await flushMicrotasks()

  return {
    get backendStartCount() { return backendStartCount },
    get queryCallCount() { return queryCallCount },
    get firstInputPullClosed() { return firstInputPullClosed },
    seen,
    secondTurnDone: secondTurnDone.promise,
    async cleanup(): Promise<void> {
      releaseOldQueryTeardown.resolve()
      manager.closeAll()
      await flushMicrotasks()
    },
  }
}

describe('LR4-P01 — input-gen 종료 뒤/manager cleanup 전 teardown 창', () => {
  it('(a) 창 안의 후속 입력은 고아가 되지 않고 새 run의 turn2 done까지 도달해야 한다', async () => {
    const h = await openTeardownWindow()
    try {
      expect(h.firstInputPullClosed).toBe(true)
      expect(h.backendStartCount).toBe(2)
      await h.secondTurnDone
      expect(h.seen.filter((e) => e.type === 'done')).toHaveLength(2)
    } finally {
      await h.cleanup()
    }
  })

  it('(b) input-gen이 닫힌 run은 done=false stale HIT 대상이 아니어야 한다', async () => {
    const h = await openTeardownWindow()
    try {
      expect(h.firstInputPullClosed).toBe(true)
      expect(h.backendStartCount).toBe(2)
      expect(h.queryCallCount).toBe(2)
    } finally {
      await h.cleanup()
    }
  })
})
