/**
 * subagent-pump-isolation.test.ts — Phase 37 #3: 펌프 B2 격리 TDD RED
 *
 * 검증 대상: ClaudeCodeBackend._runPump 에서
 *   parentToolId 있는 text/thinking이 메인 stream M5 상태
 *   (_curTextId / _streamedThisMsg / messageId) 를 오염시키지 않는다.
 *
 * 현재 구현: early-skip 미적용 → 서브에이전트 text가 메인 stream 블록 상태를 건드림 → RED.
 * 구현 수정(early-skip 추가) 후 GREEN 예정.
 *
 * 하네스 패턴: m5-token-streaming.test.ts 동일 (fake query yield + collectEvents).
 *
 * P-iso-1: 서브에이전트 text → parentToolId='toolu_sa1' 보유
 * P-iso-2: 메인 델타 messageId 연속성 — 서브에이전트 full msg에 의해 끊기지 않음
 */
import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent, AgentEventText } from '../../../02.Source/shared/agent-events'

// ── 픽스처 헬퍼 ──────────────────────────────────────────────────────────────

function mkInit() {
  return {
    type: 'system' as const,
    subtype: 'init' as const,
    session_id: 'test-session-pump-iso',
    model: 'claude-sonnet-4-6',
    tools: [],
    cwd: '/workspace',
    apiKeySource: 'user' as const,
    betas: [],
    claude_code_version: '1.0.0',
    mcp_servers: [],
    permissionMode: 'acceptEdits' as const,
    slash_commands: [],
    output_style: 'stream-json',
    skills: [],
    plugins: [],
    uuid: 'uuid-init-pump-iso-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
  }
}

function mkResult() {
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
    usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    errors: [],
    uuid: 'uuid-rslt-pump-iso-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-pump-iso',
  }
}

/** 메인 stream_event text delta 픽스처 */
function mkMainStreamTextDelta(text: string) {
  return {
    type: 'stream_event' as const,
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    },
    parent_tool_use_id: null,
    uuid: 'uuid-main-delta-pump-iso-000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-pump-iso',
  }
}

/**
 * 서브에이전트 full assistant 메시지 (parent_tool_use_id 있음).
 * isStreamEventMsg=false → full 메시지 경로로 처리됨.
 */
function mkSubAgentFullText(parentToolId: string, text: string) {
  return {
    type: 'assistant' as const,
    parent_tool_use_id: parentToolId,
    message: {
      role: 'assistant' as const,
      content: [{ type: 'text', text }],
      id: 'msg-sub-001',
      type: 'message' as const,
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn' as const,
      stop_sequence: null,
      usage: { input_tokens: 5, output_tokens: 3 },
    },
    uuid: 'uuid-sub-full-pump-iso-000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-pump-iso',
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

async function collectEvents(run: { events: AsyncIterable<AgentEvent> }): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  for await (const e of run.events) {
    events.push(e)
  }
  return events
}

function textEvents(events: AgentEvent[]): AgentEventText[] {
  return events.filter((e): e is AgentEventText => e.type === 'text')
}

// ── P-iso-1: 서브에이전트 text → parentToolId 보유 ────────────────────────────

describe('P-iso-1: 서브에이전트 full text → push된 이벤트에 parentToolId 보유', () => {
  it('시퀀스: 메인 델타("main ") → 서브에이전트 full("sub work") → 메인 델타("continues") → 서브에이전트 text가 parentToolId="toolu_sa1" 보유', async () => {
    const messages = [
      mkInit(),
      // ① 메인 stream_event delta
      mkMainStreamTextDelta('main '),
      // ② 서브에이전트 full assistant 메시지 (parent_tool_use_id 있음)
      mkSubAgentFullText('toolu_sa1', 'sub work'),
      // ③ 메인 stream_event delta
      mkMainStreamTextDelta('continues'),
      mkResult(),
    ]

    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
    const events = await collectEvents(run)

    const allTexts = textEvents(events)

    // 서브에이전트 text 이벤트 찾기
    const subText = allTexts.find(e => (e as AgentEventText & { parentToolId?: string }).parentToolId === 'toolu_sa1')

    // RED: 현재 구현은 서브에이전트 text에 parentToolId를 부여하지 않음
    // → subText가 undefined이거나 parentToolId 없음 → 이 단정이 실패
    expect(subText).toBeDefined()
    expect((subText as AgentEventText & { parentToolId?: string }).parentToolId).toBe('toolu_sa1')
    // 서브에이전트 text 내용 확인
    expect(subText!.delta).toBe('sub work')
  })
})

// ── P-iso-2: 메인 델타 messageId 연속성 — 서브에이전트 msg에 의해 끊기지 않음 ──

describe('P-iso-2: 서브에이전트 full msg가 메인 stream _curTextId/_streamedThisMsg 오염 0', () => {
  it('메인 델타("main ") → 서브에이전트 full → 메인 델타("continues") — 두 메인 델타가 동일 messageId 또는 기대 블록경계 유지', async () => {
    const messages = [
      mkInit(),
      mkMainStreamTextDelta('main '),
      mkSubAgentFullText('toolu_sa1', 'sub work'),
      mkMainStreamTextDelta('continues'),
      mkResult(),
    ]

    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
    const events = await collectEvents(run)

    const allTexts = textEvents(events)

    // 메인 델타 이벤트 (parentToolId 없는 것들)
    const mainTexts = allTexts.filter(
      e => (e as AgentEventText & { parentToolId?: string }).parentToolId === undefined
    )

    // 메인 델타는 'main '와 'continues' 두 개여야 함
    expect(mainTexts.length).toBeGreaterThanOrEqual(2)

    const mainDelta1 = mainTexts.find(e => e.delta === 'main ')
    const mainDelta2 = mainTexts.find(e => e.delta === 'continues')

    expect(mainDelta1).toBeDefined()
    expect(mainDelta2).toBeDefined()

    // CRITICAL: 두 메인 델타가 같은 messageId를 가져야 함
    // (서브에이전트 full이 _curTextId를 오염시키지 않음 — early-skip 후)
    // RED: 현재 구현은 서브에이전트 full msg가 assistant 경계 리셋을 유발 → 메인 _curTextId=null
    // → continues 델타가 새 messageId 발급됨 → 두 메인 델타가 다른 messageId(오염)
    expect(mainDelta1!.messageId).toBeDefined()
    expect(mainDelta1!.messageId).toBe(mainDelta2!.messageId)
  })

  it('서브에이전트 full msg 전후로 _streamedThisMsg가 true 유지 — 메인 turn full suppress 동작 불변', async () => {
    // 메인 델타가 있으면 _streamedThisMsg=true → 이후 메인 full text는 suppress됨
    // 서브에이전트 full이 끼어들어도 이 불변식이 깨지지 않아야 함
    const messages = [
      mkInit(),
      mkMainStreamTextDelta('A'),
      mkSubAgentFullText('toolu_sa1', 'sub content'),
      {
        // 메인 full 텍스트 (suppress 대상)
        type: 'assistant' as const,
        parent_tool_use_id: null,
        message: {
          role: 'assistant' as const,
          content: [{ type: 'text', text: 'A' }],
          id: 'msg-main-full',
          type: 'message' as const,
          model: 'claude-sonnet-4-6',
          stop_reason: 'end_turn' as const,
          stop_sequence: null,
          usage: { input_tokens: 5, output_tokens: 1 },
        },
        uuid: 'uuid-main-full-pump-iso-000' as `${string}-${string}-${string}-${string}-${string}`,
        session_id: 'test-session-pump-iso',
      },
      mkResult(),
    ]

    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
    const events = await collectEvents(run)

    // 메인 텍스트(parentToolId 없는 것)
    const mainTexts = textEvents(events).filter(
      e => (e as AgentEventText & { parentToolId?: string }).parentToolId === undefined
    )

    // 메인 full text('A')는 suppress — 델타 'A'만 있어야 함
    // 단정: delta='A'가 1개만 있어야 함(suppress 불변)
    const mainADeltas = mainTexts.filter(e => e.delta === 'A')
    expect(mainADeltas).toHaveLength(1)
  })
})
