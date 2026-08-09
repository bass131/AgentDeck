import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'

const EXPIRE_MS = 10_000

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
    session_id: 'sess-p09-idle',
  }
}

function mkInit(sessionId = 'sess-p09-idle') {
  return {
    type: 'system' as const,
    subtype: 'init' as const,
    session_id: sessionId,
    apiKeySource: 'none' as const,
    cwd: '/tmp',
    tools: [],
    mcp_servers: [],
    model: 'claude-haiku-4-5-20251001',
    permissionMode: 'default' as const,
    slash_commands: [],
    uuid: 'uuid-init-0000-0000-0000-000000000002' as `${string}-${string}-${string}-${string}-${string}`,
  }
}

function mkTaskStarted() {
  return {
    type: 'system',
    subtype: 'task_started',
    task_id: 'b7hqf83vz',
    tool_use_id: 'toolu_p09_idle',
    description: 'Background dev server',
    task_type: 'local_bash',
    session_id: 'sess-p09-idle',
  }
}

function mkTaskNotification() {
  return {
    type: 'system',
    subtype: 'task_notification',
    task_id: 'b7hqf83vz',
    tool_use_id: 'toolu_p09_idle',
    status: 'completed',
    output_file: 'C:\\tmp\\tasks\\b7hqf83vz.output',
    summary: 'Background dev server',
    session_id: 'sess-p09-idle',
  }
}

class Checkpoint {
  private arrivedEarly = false
  private arrivedResolver: (() => void) | null = null
  private releaseResolver: (() => void) | null = null

  async reach(): Promise<void> {
    this.arrivedEarly = true
    this.arrivedResolver?.()
    await new Promise<void>((resolve) => {
      this.releaseResolver = resolve
    })
  }

  async waitArrived(): Promise<void> {
    if (this.arrivedEarly) return
    await new Promise<void>((resolve) => {
      this.arrivedResolver = resolve
    })
  }

  release(): void {
    this.releaseResolver?.()
  }
}

interface IdleObservation {
  closedAtExpiry: boolean | null
  inputClosedFinally: boolean
  events: AgentEvent[]
}

async function runIdleScenario(withBgTask: boolean): Promise<IdleObservation> {
  const cp = new Checkpoint()
  const obs: IdleObservation = { closedAtExpiry: null, inputClosedFinally: false, events: [] }

  const queryFn: QueryFn = (p) =>
    (async function* () {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkInit()
      if (withBgTask) yield mkTaskStarted()
      yield mkResult('turn1')

      let closed = false
      const pull = inputIter.next()
      void pull.then((r) => {
        if (r.done) closed = true
      })
      await cp.reach()
      obs.closedAtExpiry = closed

      if (closed) return

      if (withBgTask) yield mkTaskNotification()
      const second = await pull
      obs.inputClosedFinally = second.done === true
    })()

  const backend = new ClaudeCodeBackend(queryFn)
  const run = backend.start({
    messages: [{ role: 'user', content: 'dev 서버를 백그라운드로 돌려줘' }],
    persistent: true,
  })

  const consume = (async () => {
    for await (const e of run.events) obs.events.push(e)
  })()

  await cp.waitArrived()
  await vi.advanceTimersByTimeAsync(EXPIRE_MS)
  await Promise.resolve()
  cp.release()
  await vi.advanceTimersByTimeAsync(EXPIRE_MS)
  await vi.advanceTimersByTimeAsync(EXPIRE_MS)
  await consume
  return obs
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('gap1-p09 — 활성 bg task 존재 시 idle-close 금지 (RED)', () => {
  it('bg task 활성 구간(started~notification)에는 유예 만료가 와도 입력 스트림이 닫히지 않는다', async () => {
    const obs = await runIdleScenario(true)
    expect(obs.closedAtExpiry).toBe(false)
    expect(obs.events.some((e) => e.type === 'error')).toBe(false)
  })

  it('bg task 종료(notification) 후에는 idle-close가 회복돼 세션이 자연 종료된다(좀비 0)', async () => {
    const obs = await runIdleScenario(true)
    expect(obs.inputClosedFinally).toBe(true)
  })

  it('대조군(GREEN 핀): bg task가 없으면 기존대로 유예 만료에 세션이 닫힌다(LR4 P03 계약2 보존)', async () => {
    const obs = await runIdleScenario(false)
    expect(obs.closedAtExpiry).toBe(true)
    expect(obs.events.filter((e) => e.type === 'done')).toHaveLength(1)
  })
})
