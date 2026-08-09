export type FixtureUuid = `${string}-${string}-${string}-${string}-${string}`

export const FIXTURE_MODEL_ID = 'claude-haiku-4-5-20251001'

export type FixturePatch = Record<string, unknown>

export function mkInit<P extends FixturePatch = FixturePatch>(patch?: P) {
  return {
    type: 'system' as const,
    subtype: 'init' as const,
    session_id: 'sess-test',
    apiKeySource: 'none',
    cwd: '/tmp',
    tools: [] as string[],
    mcp_servers: [] as unknown[],
    model: FIXTURE_MODEL_ID,
    permissionMode: 'default',
    slash_commands: [] as string[],
    uuid: 'uuid-init-0000-0000-0000-000000000002' as FixtureUuid,
    ...(patch ?? ({} as P)),
  }
}

export function mkResult<P extends FixturePatch = FixturePatch>(patch?: P) {
  return {
    type: 'result' as const,
    subtype: 'success',
    is_error: false,
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: 1,
    result: 'turn',
    stop_reason: 'end_turn',
    total_cost_usd: 0,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: {} as Record<string, unknown>,
    permission_denials: [] as unknown[],
    errors: [] as unknown[],
    uuid: 'uuid-0000-0000-0000-0000-000000000001' as FixtureUuid,
    session_id: 'sess-test',
    ...(patch ?? ({} as P)),
  }
}

export function mkAssistantText<P extends FixturePatch = FixturePatch>(text: string, patch?: P) {
  return {
    type: 'assistant' as const,
    message: {
      id: 'msg_001',
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'text', text }] as unknown[],
      model: FIXTURE_MODEL_ID,
      stop_reason: null as string | null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    parent_tool_use_id: null as string | null,
    uuid: 'uuid-asst-0000-0000-0000-000000000001' as FixtureUuid,
    session_id: 'sess-test',
    ...(patch ?? ({} as P)),
  }
}

export function mkToolUse<P extends FixturePatch = FixturePatch>(
  id: string,
  name: string,
  input: unknown,
  patch?: P
) {
  return {
    type: 'assistant' as const,
    message: {
      id: `msg_${id}`,
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'tool_use', id, name, input }] as unknown[],
      model: FIXTURE_MODEL_ID,
      stop_reason: 'tool_use' as string | null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    parent_tool_use_id: null as string | null,
    uuid: `uuid-asst-${id}` as FixtureUuid,
    session_id: 'sess-test',
    ...(patch ?? ({} as P)),
  }
}

export function mkToolResult<P extends FixturePatch = FixturePatch>(
  id: string,
  content: unknown,
  patch?: P
) {
  return {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [{ type: 'tool_result', tool_use_id: id, content }] as unknown[],
    },
    parent_tool_use_id: null as string | null,
    uuid: `uuid-user-${id}` as FixtureUuid,
    session_id: 'sess-test',
    ...(patch ?? ({} as P)),
  }
}
