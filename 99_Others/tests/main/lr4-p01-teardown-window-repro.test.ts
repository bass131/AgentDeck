/**
 * lr4-p01-teardown-window-repro.test.ts — LR4 Phase 01 RED 재현 하네스.
 *
 * BF3-P03은 idle-close 판정과 `_inputGen`의 실제 return 사이(전-종료 μs창)를 봉합했다.
 * 이 파일은 그보다 뒤인 다음 순서를 deferred gate로 고정한다:
 *
 *   turn1 done → `_inputGen.next()`가 done:true → SDK query teardown 대기
 *   → 같은 sessionKey 후속 start → 기존 query teardown 해제
 *
 * 현재 코드는 `_inputGen`이 이미 닫혔어도 query/events의 `finally`가 끝나기 전까지
 * `persistentRuns` 엔트리를 done=false로 유지한다. 따라서 후속 start가 죽어가는 run에
 * HIT해 push되고, 새 backend run은 열리지 않으며 입력이 고아가 된다.
 *
 * 두 테스트는 P02 전까지 `it.fails`로 RED를 CI green 안에 박제했다. P02가 입력-gen
 * 종료와 persistent 라우팅 제거를 원자화해 `.fails`를 제거, 이제 GREEN이다.
 * 실제 688ms 대기/setTimeout은 사용하지 않는다.
 */
import { describe, it, expect } from 'vitest'
import { createRunManager } from '../../../02.Source/main/00_ipc/agent-runs'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentBackend, AgentRunInput } from '../../../02.Source/main/01_agents/AgentBackend'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

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
      // done 처리 뒤 idle-close가 input generator를 실제로 닫을 때까지 기다린다.
      // 이 resolve 이후부터 old query teardown 해제 전까지가 LR4의 688ms 창이다.
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

  // 실제 시간 대신 causal gate: `_inputGen` done:true를 직접 관측한 뒤 후속 send를 넣는다.
  await inputGenClosed.promise
  await manager.start(
    countingBackend,
    { messages: [{ role: 'user', content: 'turn2' }], persistent: true, sessionKey: 'conv-lr4-window' },
    onEvent,
  )
  // 새 run 생성 경로라면 background consumer가 queryFn의 두 번째 호출까지 진입하게 한다.
  // 시간 대기가 아니라 정해진 Promise continuation만 비운다.
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
      // 현재는 stale HIT라 1 — P02에서 miss→새 run이면 2가 된다.
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
      // 현재 agent-runs.ts는 cleanup finally 전까지 persistentRuns를 지우지 않아 1회다.
      expect(h.backendStartCount).toBe(2)
      expect(h.queryCallCount).toBe(2)
    } finally {
      await h.cleanup()
    }
  })
})
