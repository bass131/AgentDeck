import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ClaudeCodeBackend } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import { DEFAULT_TAIL_INTERVAL_MS } from '../../../02_Source/main/01_agents/bgTaskTail'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'

const TOOL_USE_ID = 'toolu_01T5qbRPpVRhXhNidJFukFYj'
const TASK_ID = 'b7hqf83vz'
const DESCRIPTION = 'Background loop printing tick counter with 1-second delays'
const SESSION_ID = 'sess-p09-wiring'

function mkInit() {
  return {
    type: 'system' as const,
    subtype: 'init' as const,
    session_id: SESSION_ID,
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

function mkResult(turnLabel = 'turn1') {
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
    session_id: SESSION_ID,
  }
}

function mkTaskStarted() {
  return {
    type: 'system',
    subtype: 'task_started',
    task_id: TASK_ID,
    tool_use_id: TOOL_USE_ID,
    description: DESCRIPTION,
    task_type: 'local_bash',
    session_id: SESSION_ID,
  }
}

function mkTaskNotification(outputFile: string) {
  return {
    type: 'system',
    subtype: 'task_notification',
    task_id: TASK_ID,
    tool_use_id: TOOL_USE_ID,
    status: 'stopped',
    output_file: outputFile,
    summary: DESCRIPTION,
    session_id: SESSION_ID,
  }
}

function mkBgToolResult(outputFile: string, withHint: boolean) {
  const content = withHint
    ? `Command running in background with ID: ${TASK_ID}. Output is being written to: ${outputFile}. You will be notified when it completes. To check interim output, use Read on that file path.`
    : `Command running in background with ID: ${TASK_ID}. You will be notified when it completes. To check interim output, use the TaskOutput tool.`
  return {
    type: 'user',
    parent_tool_use_id: null,
    session_id: SESSION_ID,
    message: {
      role: 'user',
      content: [{ tool_use_id: TOOL_USE_ID, type: 'tool_result', content, is_error: false }],
    },
    tool_use_result: {
      stdout: '',
      stderr: '',
      interrupted: false,
      isImage: false,
      noOutputExpected: false,
      backgroundTaskId: TASK_ID,
    },
  }
}

class Gate {
  private arrived = false
  private released = false
  private arrivedResolver: (() => void) | null = null
  private releaseResolver: (() => void) | null = null

  async reach(): Promise<void> {
    this.arrived = true
    this.arrivedResolver?.()
    if (this.released) return
    await new Promise<void>((resolve) => {
      this.releaseResolver = resolve
    })
  }

  async waitArrived(): Promise<void> {
    if (this.arrived) return
    await new Promise<void>((resolve) => {
      this.arrivedResolver = resolve
    })
  }

  release(): void {
    this.released = true
    this.releaseResolver?.()
  }
}

function makeWiringQueryFn(gate: Gate, outputFile: string, withHint: boolean, persistent: boolean): QueryFn {
  return (p) =>
    (async function* () {
      let inputIter: AsyncIterator<unknown> | null = null
      if (persistent) {
        const prompt = p.prompt as unknown as AsyncIterable<unknown>
        inputIter = prompt[Symbol.asyncIterator]()
        const first = await inputIter.next()
        if (first.done) return
      }
      yield mkInit()
      yield mkTaskStarted()
      yield mkBgToolResult(outputFile, withHint)
      await gate.reach()
      yield mkTaskNotification(outputFile)
      yield mkResult('turn1')
      if (inputIter) await inputIter.next()
    })()
}

async function runWiringScenario(opts: {
  persistent: boolean
  withHint: boolean
  outputFile: string
  duringPark: (events: AgentEvent[]) => Promise<void>
}): Promise<AgentEvent[]> {
  const gate = new Gate()
  const events: AgentEvent[] = []
  const backend = new ClaudeCodeBackend(
    makeWiringQueryFn(gate, opts.outputFile, opts.withHint, opts.persistent)
  )
  const run = backend.start({
    messages: [{ role: 'user', content: 'dev 서버를 백그라운드로 돌려줘' }],
    ...(opts.persistent ? { persistent: true } : {}),
  })
  const consume = (async () => {
    for await (const e of run.events) {
      events.push(e)
      if (opts.persistent && e.type === 'done') run.abort()
    }
  })()
  try {
    await gate.waitArrived()
    await opts.duringPark(events)
  } finally {
    gate.release()
    await consume
  }
  return events
}

type BgTaskEv = Extract<AgentEvent, { type: 'bg_task' }>

function bgOutputs(events: AgentEvent[]): BgTaskEv[] {
  return events.filter((e): e is BgTaskEv => e.type === 'bg_task' && e.kind === 'output')
}

function joinedOutput(events: AgentEvent[]): string {
  return bgOutputs(events)
    .map((e) => e.outputChunk ?? '')
    .join('')
}

function bgKinds(events: AgentEvent[]): string[] {
  return events.filter((e): e is BgTaskEv => e.type === 'bg_task').map((e) => e.kind)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function until(cond: () => boolean, timeoutMs = 5000): Promise<boolean> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) return false
    await sleep(10)
  }
  return true
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'agentdeck-p09-wiring-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('gap1-p09 회귀 핀 — content 경로 추출 → 라이브 tail 시작 배선(GREEN)', () => {
  it(
    '① 단발 펌프: probe④ 형상 주입 후 실파일 append → bg_task kind=output 조각이 스트림에 흐른다',
    async () => {
      const file = path.join(dir, `${TASK_ID}.output`)
      writeFileSync(file, '')

      const events = await runWiringScenario({
        persistent: false,
        withHint: true,
        outputFile: file,
        duringPark: async (evs) => {
          appendFileSync(file, 'tick-live-1\n')
          expect(await until(() => joinedOutput(evs) === 'tick-live-1\n')).toBe(true)
        },
      })

      const outs = bgOutputs(events)
      expect(outs.length).toBeGreaterThanOrEqual(1)
      for (const o of outs) expect(o.taskId).toBe(TASK_ID)
      expect(bgKinds(events)).toContain('started')
      expect(bgKinds(events)).toContain('notification')
      expect(events.filter((e) => e.type === 'done')).toHaveLength(1)
      expect(events.some((e) => e.type === 'error')).toBe(false)
    },
    15_000
  )

  it(
    '② 지속 펌프(REPL 기본 경로): 동일 형상 — persistent call site 배선도 tail을 시작시킨다',
    async () => {
      const file = path.join(dir, `${TASK_ID}.output`)
      writeFileSync(file, '')

      const events = await runWiringScenario({
        persistent: true,
        withHint: true,
        outputFile: file,
        duringPark: async (evs) => {
          appendFileSync(file, 'tick-live-repl\n')
          expect(await until(() => joinedOutput(evs) === 'tick-live-repl\n')).toBe(true)
        },
      })

      const outs = bgOutputs(events)
      expect(outs.length).toBeGreaterThanOrEqual(1)
      for (const o of outs) expect(o.taskId).toBe(TASK_ID)
      expect(bgKinds(events)).toContain('started')
      expect(bgKinds(events)).toContain('notification')
      expect(events.filter((e) => e.type === 'done')).toHaveLength(1)
      expect(events.some((e) => e.type === 'error')).toBe(false)
    },
    15_000
  )

  it(
    '③ 대조군(graceful degrade 핀): 안내 문구 없는 동형 메시지 → 추출 실패 → output 무방출 + 생명주기 정상',
    async () => {
      const file = path.join(dir, `${TASK_ID}.output`)
      writeFileSync(file, '')

      const events = await runWiringScenario({
        persistent: false,
        withHint: false,
        outputFile: file,
        duringPark: async (evs) => {
          appendFileSync(file, 'tick-ctrl-1\n')
          await sleep(DEFAULT_TAIL_INTERVAL_MS * 2)
          expect(bgOutputs(evs)).toHaveLength(0)
        },
      })

      expect(bgOutputs(events)).toHaveLength(0)
      expect(bgKinds(events)).toEqual(['started', 'notification'])
      expect(events.filter((e) => e.type === 'tool_result')).toHaveLength(1)
      expect(events.filter((e) => e.type === 'done')).toHaveLength(1)
      expect(events.some((e) => e.type === 'error')).toBe(false)
    },
    15_000
  )
})
