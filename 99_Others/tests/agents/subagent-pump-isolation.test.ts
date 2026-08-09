import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent, AgentEventText } from '../../../02_Source/shared/agentEvents'
import { makeMockQueryFn } from './helpers/fakeQuery'

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

describe('P-iso-1: 서브에이전트 full text → push된 이벤트에 parentToolId 보유', () => {
  it('시퀀스: 메인 델타("main ") → 서브에이전트 full("sub work") → 메인 델타("continues") → 서브에이전트 text가 parentToolId="toolu_sa1" 보유', async () => {
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

    const subText = allTexts.find(e => (e as AgentEventText & { parentToolId?: string }).parentToolId === 'toolu_sa1')

    expect(subText).toBeDefined()
    expect((subText as AgentEventText & { parentToolId?: string }).parentToolId).toBe('toolu_sa1')
    expect(subText!.delta).toBe('sub work')
  })
})

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

    const mainTexts = allTexts.filter(
      e => (e as AgentEventText & { parentToolId?: string }).parentToolId === undefined
    )

    expect(mainTexts.length).toBeGreaterThanOrEqual(2)

    const mainDelta1 = mainTexts.find(e => e.delta === 'main ')
    const mainDelta2 = mainTexts.find(e => e.delta === 'continues')

    expect(mainDelta1).toBeDefined()
    expect(mainDelta2).toBeDefined()

    expect(mainDelta1!.messageId).toBeDefined()
    expect(mainDelta1!.messageId).toBe(mainDelta2!.messageId)
  })

  it('서브에이전트 full msg 전후로 _streamedThisMsg가 true 유지 — 메인 turn full suppress 동작 불변', async () => {
    const messages = [
      mkInit(),
      mkMainStreamTextDelta('A'),
      mkSubAgentFullText('toolu_sa1', 'sub content'),
      {
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

    const mainTexts = textEvents(events).filter(
      e => (e as AgentEventText & { parentToolId?: string }).parentToolId === undefined
    )

    const mainADeltas = mainTexts.filter(e => e.delta === 'A')
    expect(mainADeltas).toHaveLength(1)
  })
})
