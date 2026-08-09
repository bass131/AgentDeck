import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mapClaudeStreamLine } from '../../../02_Project/00_Source/main/01_agents/claudeStream'
import { ClaudeCodeBackend } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import { EchoBackend } from '../../../02_Project/00_Source/main/01_agents/EchoBackend'
import type { AgentRun } from '../../../02_Project/00_Source/main/01_agents/AgentBackend'
import type { AgentEvent } from '../../../02_Project/00_Source/shared/agentEvents'

type BgTaskEv = Extract<AgentEvent, { type: 'bg_task' }>
type ToolCallEv = Extract<AgentEvent, { type: 'tool_call' }>
type OrchProgressEv = Extract<AgentEvent, { type: 'orchestration_progress' }>
type ToolResultEv = Extract<AgentEvent, { type: 'tool_result' }>

type RunWithStopTask = AgentRun & { stopTask?: (taskId: string) => void }

const FIXTURE_PATH = fileURLToPath(
  new URL('../fixtures/gap1-p03/probe-4-bg-bash.jsonl', import.meta.url)
)

const fixtureLines: Record<string, unknown>[] = readFileSync(FIXTURE_PATH, 'utf-8')
  .split('\n')
  .filter((line) => line.trim().length > 0)
  .map((line) => JSON.parse(line) as Record<string, unknown>)

const allEvents: AgentEvent[] = fixtureLines.flatMap((line) => mapClaudeStreamLine(line))

const TOOL_USE_ID = 'toolu_01T5qbRPpVRhXhNidJFukFYj'
const TASK_ID = 'b7hqf83vz'
const DESCRIPTION = 'Background loop printing tick counter with 1-second delays'

describe('gap1-p09 어댑터 골든 — run_in_background → tool_call.background (RED)', () => {
  it('probe④ 재생: Bash tool_call 1개 + background:true + input passthrough', () => {
    const toolCalls = allEvents.filter((e): e is ToolCallEv => e.type === 'tool_call')
    expect(toolCalls).toHaveLength(1)
    const bash = toolCalls[0]
    expect(bash.id).toBe(TOOL_USE_ID)
    expect(bash.name).toBe('Bash')
    expect((bash.input as { run_in_background?: boolean }).run_in_background).toBe(true)
    expect(bash.background).toBe(true)
  })

  it('대조군(GREEN 핀): 포그라운드 Bash(플래그 부재) → background 키 자체가 없다', () => {
    const obj = {
      type: 'assistant',
      parent_tool_use_id: null,
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'toolu_fg_01', name: 'Bash', input: { command: 'ls', description: 'List files' } },
        ],
      },
    }
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      { type: 'tool_call', id: 'toolu_fg_01', name: 'Bash', input: { command: 'ls', description: 'List files' } },
    ])
  })

  it('대조군(GREEN 핀): run_in_background:false → background는 true가 아니다(포그라운드 취급)', () => {
    const obj = {
      type: 'assistant',
      parent_tool_use_id: null,
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_fg_02',
            name: 'Bash',
            input: { command: 'ls', run_in_background: false },
          },
        ],
      },
    }
    const events = mapClaudeStreamLine(obj)
    expect(events).toHaveLength(1)
    const tc = events[0] as ToolCallEv
    expect(tc.type).toBe('tool_call')
    expect(tc.background).not.toBe(true)
  })
})

describe('gap1-p09 어댑터 골든 — system task_* → bg_task (RED)', () => {
  const bgTasks = allEvents.filter((e): e is BgTaskEv => e.type === 'bg_task')

  it('probe④ 재생: bg_task 정확히 3건 — started → updated → notification 순서', () => {
    expect(bgTasks.map((e) => e.kind)).toEqual(['started', 'updated', 'notification'])
  })

  it("kind:'started' — taskId/toolUseId/taskType/description 매핑(probe 17행)", () => {
    const started = bgTasks.find((e) => e.kind === 'started')
    expect(started).toEqual<BgTaskEv>({
      type: 'bg_task',
      kind: 'started',
      taskId: TASK_ID,
      toolUseId: TOOL_USE_ID,
      taskType: 'local_bash',
      description: DESCRIPTION,
    })
  })

  it("kind:'updated' — patch snake→camel(end_time→endTime) + toolUseId 부재(probe 27행)", () => {
    const updated = bgTasks.find((e) => e.kind === 'updated')
    expect(updated).toBeDefined()
    expect(updated).toMatchObject({
      type: 'bg_task',
      kind: 'updated',
      taskId: TASK_ID,
      patch: { status: 'killed', endTime: 1783947441873 },
    })
    expect(updated?.toolUseId).toBeUndefined()
  })

  it("kind:'notification' — status/outputFile/summary 매핑(probe 28행)", () => {
    const rawNotif = fixtureLines.find((l) => l['subtype'] === 'task_notification')
    expect(rawNotif).toBeDefined()
    const notif = bgTasks.find((e) => e.kind === 'notification')
    expect(notif).toEqual<BgTaskEv>({
      type: 'bg_task',
      kind: 'notification',
      taskId: TASK_ID,
      toolUseId: TOOL_USE_ID,
      status: 'stopped',
      outputFile: rawNotif?.['output_file'] as string,
      summary: DESCRIPTION,
    })
  })

  it('대조군(GREEN 핀): 기존 orchestration_progress 이중 방출은 변경 없이 유지', () => {
    const progress = allEvents.filter((e): e is OrchProgressEv => e.type === 'orchestration_progress')
    expect(progress).toEqual<OrchProgressEv[]>([
      { type: 'orchestration_progress', id: TOOL_USE_ID, status: 'running' },
      { type: 'orchestration_progress', id: TOOL_USE_ID, status: 'running', summary: DESCRIPTION },
    ])
  })
})

describe('gap1-p09 어댑터 골든 — tool_result backgroundTaskId 상관(무합성 대조군)', () => {
  it('대조군(GREEN 핀): probe④ 18행(user tool_result) → tool_result 1건만, bg_task 무합성', () => {
    const rawUser = fixtureLines.find((l) => l['type'] === 'user')
    expect(rawUser).toBeDefined()
    const events = mapClaudeStreamLine(rawUser)
    expect(events).toHaveLength(1)
    const tr = events[0] as ToolResultEv
    expect(tr.type).toBe('tool_result')
    expect(tr.id).toBe(TOOL_USE_ID)
    expect(tr.ok).toBe(true)
    expect(String(tr.output)).toContain('Command running in background with ID')
  })

  it('대조군(GREEN 핀): content 문자열의 미끼(decoy) taskId를 grep해 bg_task를 합성하지 않는다', () => {
    const obj = {
      type: 'user',
      parent_tool_use_id: null,
      tool_use_result: {
        stdout: '',
        stderr: '',
        interrupted: false,
        isImage: false,
        noOutputExpected: false,
        backgroundTaskId: 'real-task-99',
      },
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_bg_decoy',
            content:
              'Command running in background with ID: decoy-task-11. Output is being written to: C:\\tmp\\decoy-task-11.output.',
          },
        ],
      },
    }
    const events = mapClaudeStreamLine(obj)
    expect(events.filter((e) => e.type === 'bg_task')).toHaveLength(0)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('tool_result')
  })
})

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
    session_id: 'sess-p09-stop',
  }
}

function mkInit(sessionId = 'sess-p09-stop') {
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

function makeStopQueryFn(stopCalls: string[]): QueryFn {
  return (p) => {
    const gen = (async function* () {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkInit()
      yield mkResult('turn1')
      await inputIter.next()
    })()
    return Object.assign(gen, {
      stopTask: (taskId: string): void => {
        stopCalls.push(taskId)
      },
    })
  }
}

describe('gap1-p09 AgentRun.stopTask — query 핸들 위임 (RED)', () => {
  it('AgentRun이 stopTask 메서드를 노출한다', async () => {
    const backend = new ClaudeCodeBackend(makeStopQueryFn([]))
    const run = backend.start({
      messages: [{ role: 'user', content: 'dev 서버 백그라운드 시작' }],
      persistent: true,
    }) as RunWithStopTask
    try {
      expect(typeof run.stopTask).toBe('function')
    } finally {
      run.abort()
      for await (const e of run.events) void e
    }
  })

  it('핸들 캡처 후 stopTask(taskId) → q.stopTask(taskId)로 위임(fire-and-forget·재호출 안전)', async () => {
    const stopCalls: string[] = []
    const backend = new ClaudeCodeBackend(makeStopQueryFn(stopCalls))
    const run = backend.start({
      messages: [{ role: 'user', content: 'dev 서버 백그라운드 시작' }],
      persistent: true,
    }) as RunWithStopTask

    for await (const e of run.events) {
      if (e.type === 'done') {
        run.stopTask?.(TASK_ID)
        run.stopTask?.(TASK_ID)
        run.abort()
      }
    }

    expect(stopCalls.length).toBeGreaterThanOrEqual(1)
    expect(stopCalls.every((t) => t === TASK_ID)).toBe(true)
  })

  it('대조군(GREEN 핀): query 핸들 캡처 전 호출은 조용한 no-op(throw 금지)', async () => {
    const backend = new ClaudeCodeBackend(makeStopQueryFn([]))
    const run = backend.start({
      messages: [{ role: 'user', content: '즉시 정지 시도' }],
      persistent: true,
    }) as RunWithStopTask
    expect(() => run.stopTask?.('task-preflight')).not.toThrow()
    run.abort()
    for await (const e of run.events) void e
  })

  it('대조군(GREEN 핀): EchoBackend는 stopTask 미구현(no-op) — 호출해도 예외 없음', async () => {
    const run = new EchoBackend().start({
      messages: [{ role: 'user', content: 'echo' }],
    }) as RunWithStopTask
    expect(() => run.stopTask?.('task-echo')).not.toThrow()
    run.abort()
    for await (const e of run.events) void e
  })
})
