import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'
import { makeMockQueryFn } from './helpers/fakeQuery'

function mkInit(sessionId = 'wf-session-001') {
  return {
    type: 'system' as const,
    subtype: 'init' as const,
    session_id: sessionId,
    model: 'claude-haiku-4-5-20251001',
    tools: ['Workflow', 'Task'],
    cwd: '/workspace',
    apiKeySource: 'user' as const,
    betas: [],
    claude_code_version: '1.0.0',
    mcp_servers: [],
    permissionMode: 'bypassPermissions' as const,
    slash_commands: [],
    output_style: 'stream-json',
    skills: [],
    plugins: [],
    uuid: 'uuid-init-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
  }
}

function mkAssistant(text: string, toolUse?: { id: string; name: string; input: unknown }) {
  const content: unknown[] = []
  if (text) content.push({ type: 'text', text })
  if (toolUse) content.push({ type: 'tool_use', id: toolUse.id, name: toolUse.name, input: toolUse.input })
  return {
    type: 'assistant' as const,
    message: {
      id: 'msg_wf',
      type: 'message' as const,
      role: 'assistant' as const,
      content,
      model: 'claude-haiku-4-5-20251001',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: 'uuid-asst-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'wf-session-001',
  }
}

function mkToolResult(toolUseId: string, output: unknown, isError = false) {
  return {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [{ type: 'tool_result', tool_use_id: toolUseId, is_error: isError, content: output }]
    },
    parent_tool_use_id: null,
    uuid: 'uuid-user-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'wf-session-001',
  }
}

function mkResultSuccess(inputTokens: number, contextWindow = 200000) {
  return {
    type: 'result' as const,
    subtype: 'success' as const,
    is_error: false,
    duration_ms: 100,
    duration_api_ms: 80,
    num_turns: 1,
    result: 'Done',
    stop_reason: 'end_turn',
    total_cost_usd: 0.001,
    usage: { input_tokens: inputTokens, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {
      'claude-haiku-4-5-20251001': {
        contextWindow,
        inputTokens,
        outputTokens: 20,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        webSearchRequests: 0,
        costUSD: 0.001,
        maxOutputTokens: 8096
      }
    },
    permission_denials: [],
    errors: [],
    uuid: 'uuid-rslt-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'wf-session-001',
  }
}

function mkResultError() {
  return {
    type: 'result' as const,
    subtype: 'error_during_execution' as const,
    is_error: true,
    duration_ms: 100,
    duration_api_ms: 80,
    num_turns: 1,
    stop_reason: null,
    total_cost_usd: 0,
    usage: { input_tokens: 50, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    errors: ['Tool execution failed'],
    uuid: 'uuid-rerr-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'wf-session-001',
  }
}

function mkTaskStartedSys(toolUseId: string) {
  return {
    type: 'system' as const,
    subtype: 'task_started' as const,
    task_id: 't1',
    tool_use_id: toolUseId,
    description: 'probe',
    task_type: 'local_workflow',
    workflow_name: 'p',
    session_id: 'wf-session-001',
    uuid: 'uuid-tstart-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
  }
}

function mkTaskProgressSys(toolUseId: string, state: 'start' | 'progress' | 'done') {
  return {
    type: 'system' as const,
    subtype: 'task_progress' as const,
    task_id: 't1',
    tool_use_id: toolUseId,
    workflow_progress: [
      { type: 'workflow_phase', index: 1, title: 'Probe' },
      { type: 'workflow_agent', index: 1, label: 'probe', phaseTitle: 'Probe', state, tokens: 500 },
    ],
    session_id: 'wf-session-001',
    uuid: 'uuid-tprog-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
  }
}

function mkTaskNotification(toolUseId?: string, status = 'completed') {
  return {
    type: 'system' as const,
    subtype: 'task_notification' as const,
    ...(toolUseId ? { tool_use_id: toolUseId } : {}),
    task_id: 't1',
    status,
    summary: 'workflow completed',
    session_id: 'wf-session-001',
    uuid: 'uuid-notif-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
  }
}

function makeThrowAfterResultQueryFn(messages: unknown[], errMsg: string): QueryFn {
  return async function* throwingQuery(params: { prompt: string; options?: unknown }) {
    const opts = params.options as { abortController?: AbortController } | undefined
    for (const msg of messages) {
      if (opts?.abortController?.signal.aborted) return
      yield msg
    }
    throw new Error(errMsg)
  }
}

async function drain(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  for await (const e of events) out.push(e)
  return out
}

describe('F-B — 펌프 done 병합: 다중 result → 단일 최종 done', () => {

  it('워크플로 2턴(launched→result#1→완료→result#2) → done 정확히 1개 + 마지막에 위치', async () => {
    const messages = [
      mkInit(),
      mkAssistant('Launching the workflow in background.', { id: 'wf-1', name: 'Workflow', input: { script: 'probe' } }),
      mkToolResult('wf-1', [{ type: 'text', text: 'Workflow launched in background. Task ID: abc123' }]),
      mkResultSuccess(100),
      mkTaskNotification(),
      mkInit(),
      mkAssistant('The workflow finished: WORKFLOW_RESULT_OK.'),
      mkResultSuccess(555),
    ]

    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'run workflow' }], orchestration: true })
    const events = await drain(run.events)

    const doneEvents = events.filter(e => e.type === 'done')
    expect(doneEvents).toHaveLength(1)

    expect(events[events.length - 1].type).toBe('done')

    const done = doneEvents[0] as { type: 'done'; usage?: { inputTokens: number }; contextWindow?: number }
    expect(done.usage?.inputTokens).toBe(555)
    expect(done.contextWindow).toBe(200000)
  })

  it('맥락 연속: 2번째 턴의 진짜 결과 텍스트가 메인 스트림에 도달', async () => {
    const messages = [
      mkInit(),
      mkAssistant('Launching the workflow in background.', { id: 'wf-1', name: 'Workflow', input: { script: 'probe' } }),
      mkToolResult('wf-1', [{ type: 'text', text: 'Workflow launched in background.' }]),
      mkResultSuccess(100),
      mkTaskNotification(),
      mkAssistant('The workflow finished: WORKFLOW_RESULT_OK.'),
      mkResultSuccess(555),
    ]

    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'run workflow' }], orchestration: true })
    const events = await drain(run.events)

    const texts = events.filter(e => e.type === 'text').map(e => (e as { delta: string }).delta).join('')
    expect(texts).toContain('Launching the workflow')
    expect(texts).toContain('WORKFLOW_RESULT_OK')
  })

  it('회귀: 단일턴(result 1개) → done 정확히 1개 + 마지막 + usage 보존', async () => {
    const messages = [
      mkInit(),
      mkAssistant('Hello.'),
      mkResultSuccess(100),
    ]

    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'hi' }] })
    const events = await drain(run.events)

    const doneEvents = events.filter(e => e.type === 'done')
    expect(doneEvents).toHaveLength(1)
    expect(events[events.length - 1].type).toBe('done')
    expect((doneEvents[0] as { usage?: { inputTokens: number } }).usage?.inputTokens).toBe(100)
  })

  it('엣지: result#1 후 throw → error 1개 + done 정확히 1개(이중 done 없음)', async () => {
    const messages = [
      mkInit(),
      mkAssistant('Working.'),
      mkResultSuccess(100),
    ]
    const backend = new ClaudeCodeBackend(makeThrowAfterResultQueryFn(messages, 'boom'))
    const run = backend.start({ messages: [{ role: 'user', content: 'go' }] })
    const events = await drain(run.events)

    expect(events.filter(e => e.type === 'done')).toHaveLength(1)
    expect(events.filter(e => e.type === 'error')).toHaveLength(1)
    expect(events[events.length - 1].type).toBe('done')
  })

  it('엣지: is_error result(단일) → error 1개 + done 정확히 1개 + 마지막', async () => {
    const messages = [
      mkInit(),
      mkAssistant('Trying.'),
      mkResultError(),
    ]

    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'go' }] })
    const events = await drain(run.events)

    expect(events.filter(e => e.type === 'error')).toHaveLength(1)
    expect(events.filter(e => e.type === 'done')).toHaveLength(1)
    expect(events[events.length - 1].type).toBe('done')
  })

  it('엣지: result 수신 후 signal abort → done 미push(abort 가드)', async () => {
    const messages = [mkInit(), mkAssistant('Working.'), mkResultSuccess(100)]
    const queryFn: QueryFn = async function* abortingQuery(params: { prompt: string; options?: unknown }) {
      const opts = params.options as { abortController?: AbortController } | undefined
      for (const msg of messages) {
        if (opts?.abortController?.signal.aborted) return
        yield msg
      }
      opts?.abortController?.abort()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'go' }] })
    const events = await drain(run.events)

    expect(events.filter(e => e.type === 'done')).toHaveLength(0)
  })

  it('F-C: Workflow → orchestration 카드 emit + launched tool_result suppress + 진행/완료', async () => {
    const messages = [
      mkInit(),
      mkAssistant('Launching.', { id: 'wf-1', name: 'Workflow', input: { script: 'export const meta = { name: "p", description: "d" }\n' } }),
      mkToolResult('wf-1', [{ type: 'text', text: 'Workflow launched in background. Task ID: t1' }]),
      mkTaskStartedSys('wf-1'),
      mkTaskProgressSys('wf-1', 'progress'),
      mkResultSuccess(100),
      mkTaskProgressSys('wf-1', 'done'),
      mkTaskNotification('wf-1', 'completed'),
      mkAssistant('Result: WORKFLOW_RESULT_OK.'),
      mkResultSuccess(555),
    ]
    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'go' }], orchestration: true })
    const events = await drain(run.events)

    expect(events.filter(e => e.type === 'orchestration')).toHaveLength(1)
    expect(events.filter(e => e.type === 'tool_result' && (e as { id?: string }).id === 'wf-1')).toHaveLength(0)
    const progs = events.filter(e => e.type === 'orchestration_progress') as Array<{ status: string; id: string }>
    expect(progs.length).toBeGreaterThanOrEqual(2)
    expect(progs.every(p => p.id === 'wf-1')).toBe(true)
    expect(progs.some(p => p.status === 'completed')).toBe(true)
    expect(events.filter(e => e.type === 'done')).toHaveLength(1)
  })
})
