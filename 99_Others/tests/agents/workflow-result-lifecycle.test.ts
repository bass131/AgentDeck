/**
 * workflow-result-lifecycle.test.ts — F-B: 펌프 done 병합(다중 result → 단일 terminal done)
 *
 * 버그(사용자 실측): UltraCode로 Workflow(fire-and-watch) 실행 시 워크플로 결과를 메인 세션이
 * 못 이어받음. 근본원인 = run-manager(agent-runs.ts)가 *첫* done(=1턴 "launched" result)에서
 * run을 break/폐기 → 2번째 턴(진짜 결과)을 못 받음. raw SDK 프로브로 규명한 SDK 동작:
 *   Workflow tool_use → tool_result "launched in background" → result#1(턴1 종료) →
 *   system/task_notification → system/init → 턴2 assistant(진짜 결과) → result#2 →
 *   iterator 자연 종료.
 *
 * 수정(후보 a, plan-auditor 승인): 펌프가 중간 done을 보류하고 iterator가 자연 종료될 때만
 * 단 한 번 최종 done(마지막 result usage 운반)을 push. run-manager·claude-stream 무변경.
 *   → run-manager가 받는 done이 1개(최종)뿐이라 첫-done-break가 정상 종료점이 됨.
 *
 * 신뢰경계: 실 SDK 호출 0. mock queryFn으로 fixture SDKMessage[] yield.
 */

import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

// ── 픽스처 SDKMessage 헬퍼 (claude-backend-sdk.test.ts 패턴 차용) ────────────────

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

/** result(success) — inputTokens/contextWindow를 파라미터화해 턴별 구분 */
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

/** result(error) — is_error=true → claude-stream이 [error, done] 반환 */
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

/** system/task_started 픽스처 (tool_use_id로 카드 상관) */
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

/** system/task_progress 픽스처 (workflow_progress 포함) */
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

/** system/task_notification 픽스처 (워크플로 완료 신호) */
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

function makeMockQueryFn(messages: unknown[]): QueryFn {
  return async function* mockQuery(params: { prompt: string; options?: unknown }) {
    const opts = params.options as { abortController?: AbortController } | undefined
    for (const msg of messages) {
      if (opts?.abortController?.signal.aborted) return
      yield msg
    }
  }
}

/** result#1 yield 후 throw하는 queryFn (이중-done 방지 검증용) */
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

// ── F-B 핵심: 워크플로 2턴(result 2개) → 단일 terminal done ──────────────────────

describe('F-B — 펌프 done 병합: 다중 result → 단일 최종 done', () => {

  it('워크플로 2턴(launched→result#1→완료→result#2) → done 정확히 1개 + 마지막에 위치', async () => {
    const messages = [
      mkInit(),
      // 턴1: Workflow 도구 호출 → "launched in background"(결과 아님) → result#1(턴 종료)
      mkAssistant('Launching the workflow in background.', { id: 'wf-1', name: 'Workflow', input: { script: 'probe' } }),
      mkToolResult('wf-1', [{ type: 'text', text: 'Workflow launched in background. Task ID: abc123' }]),
      mkResultSuccess(100),               // ← 중간 done(보류 대상)
      // 워크플로 완료 신호 → 2번째 턴
      mkTaskNotification(),
      mkInit(),                            // system/init (claude-stream이 삼킴)
      mkAssistant('The workflow finished: WORKFLOW_RESULT_OK.'),
      mkResultSuccess(555),               // ← 최종 done(유지 대상, usage.inputTokens=555)
    ]

    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'run workflow' }], orchestration: true })
    const events = await drain(run.events)

    // done은 정확히 1개여야 함 (중간 done 보류, 최종 done만 push)
    const doneEvents = events.filter(e => e.type === 'done')
    expect(doneEvents).toHaveLength(1)

    // 마지막 이벤트가 done
    expect(events[events.length - 1].type).toBe('done')

    // 최종 done은 2번째(마지막) result의 usage를 운반해야 함 (중간 result#1의 100이 아님)
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
    // 1턴 안내 + 2턴 진짜 결과 둘 다 메인 스트림에 존재 (결과 복귀 = 맥락 연속)
    expect(texts).toContain('Launching the workflow')
    expect(texts).toContain('WORKFLOW_RESULT_OK')
  })

  // ── 회귀: 비워크플로 단일턴 → 여전히 done 1개 (타이밍·usage 동일) ──────────────

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

  // ── 엣지: throw 중단 → catch가 error+done, 보류 done과 이중 안 됨 ──────────────

  it('엣지: result#1 후 throw → error 1개 + done 정확히 1개(이중 done 없음)', async () => {
    const messages = [
      mkInit(),
      mkAssistant('Working.'),
      mkResultSuccess(100),    // lastDone 보류됨
    ]
    // result 후 throw → catch가 error+done push. 루프밖(try) push는 throw로 건너뜀.
    const backend = new ClaudeCodeBackend(makeThrowAfterResultQueryFn(messages, 'boom'))
    const run = backend.start({ messages: [{ role: 'user', content: 'go' }] })
    const events = await drain(run.events)

    expect(events.filter(e => e.type === 'done')).toHaveLength(1)
    expect(events.filter(e => e.type === 'error')).toHaveLength(1)
    expect(events[events.length - 1].type).toBe('done')
  })

  // ── 엣지: is_error result(단일) → error는 통과, done은 보류 후 루프밖 1회 ─────────

  it('엣지: is_error result(단일) → error 1개 + done 정확히 1개 + 마지막', async () => {
    const messages = [
      mkInit(),
      mkAssistant('Trying.'),
      mkResultError(),    // claude-stream → [error, done]; error 통과·push, done 보류
    ]

    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'go' }] })
    const events = await drain(run.events)

    expect(events.filter(e => e.type === 'error')).toHaveLength(1)
    expect(events.filter(e => e.type === 'done')).toHaveLength(1)
    expect(events[events.length - 1].type).toBe('done')
  })

  // ── 엣지: 스트림 중 signal abort → 보류 done 미push(늦은 done 누수 0) ────────────

  it('엣지: result 수신 후 signal abort → done 미push(abort 가드)', async () => {
    const messages = [mkInit(), mkAssistant('Working.'), mkResultSuccess(100)]
    // result를 다 보낸 뒤 외부에서 signal abort → 펌프 for-await 자연 종료 →
    // 루프밖 push 가드(!_aborted && !signal.aborted)가 보류 done 차단.
    const queryFn: QueryFn = async function* abortingQuery(params: { prompt: string; options?: unknown }) {
      const opts = params.options as { abortController?: AbortController } | undefined
      for (const msg of messages) {
        if (opts?.abortController?.signal.aborted) return
        yield msg
      }
      opts?.abortController?.abort()   // SDK/외부 abort 시뮬(result 다 보낸 뒤)
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'go' }] })
    const events = await drain(run.events)

    // abort된 run엔 늦은 done이 새지 않아야 함
    expect(events.filter(e => e.type === 'done')).toHaveLength(0)
  })

  // ── F-C: 펌프 orchestration tool_result suppress + 진행 이벤트 (통합) ────────────

  it('F-C: Workflow → orchestration 카드 emit + launched tool_result suppress + 진행/완료', async () => {
    const messages = [
      mkInit(),
      mkAssistant('Launching.', { id: 'wf-1', name: 'Workflow', input: { script: 'export const meta = { name: "p", description: "d" }\n' } }),
      mkToolResult('wf-1', [{ type: 'text', text: 'Workflow launched in background. Task ID: t1' }]),
      mkTaskStartedSys('wf-1'),
      mkTaskProgressSys('wf-1', 'progress'),
      mkResultSuccess(100),       // 턴1
      mkTaskProgressSys('wf-1', 'done'),
      mkTaskNotification('wf-1', 'completed'),
      mkAssistant('Result: WORKFLOW_RESULT_OK.'),
      mkResultSuccess(555),       // 턴2
    ]
    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'go' }], orchestration: true })
    const events = await drain(run.events)

    // 카드 생성(orchestration) 1개
    expect(events.filter(e => e.type === 'orchestration')).toHaveLength(1)
    // launched tool_result(id 'wf-1')는 suppress → tool_result 이벤트에 없음(카드 오완료 방지)
    expect(events.filter(e => e.type === 'tool_result' && (e as { id?: string }).id === 'wf-1')).toHaveLength(0)
    // 진행 이벤트(orchestration_progress) ≥2 + 모두 카드 id + 완료(completed) 포함
    const progs = events.filter(e => e.type === 'orchestration_progress') as Array<{ status: string; id: string }>
    expect(progs.length).toBeGreaterThanOrEqual(2)
    expect(progs.every(p => p.id === 'wf-1')).toBe(true)
    expect(progs.some(p => p.status === 'completed')).toBe(true)
    // done은 여전히 1개(F-B 병합 유지)
    expect(events.filter(e => e.type === 'done')).toHaveLength(1)
  })
})
