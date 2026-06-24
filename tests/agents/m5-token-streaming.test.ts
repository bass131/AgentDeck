/**
 * m5-token-streaming.test.ts — Phase 33: 진짜 토큰 스트리밍 TDD
 *
 * TDD 순서: 실패 테스트 먼저 → 구현 후 통과.
 *
 * 검증 항목:
 * A. 매퍼 단위(순수): stream_event content_block_delta text_delta → text 이벤트
 * B. 펌프 델타 누적+suppress: 델타 N개 + full → 버블 1개(full suppress)
 * C. 인터리브 회귀가드(CRITICAL): 델타→full+tool→result→델타→full → [msg, toolgroup, msg]
 * D. 멀티블록 분리(B1): content_block_start 경계로 새 버블
 * E. 연속 run stale(B2): 첫 run 스트리밍 종료 → 둘째 run 첫 full suppress 없음
 * F. Phase A 폴백: 델타 없이 full만 → 버블 1개(suppress 없음)
 * G. 델타 사이 비-stream_event 끼임(S3): 누적 유지(분절 없음)
 * H. thinking suppress: 스트리밍된 메시지의 full thinking suppress
 */

import { describe, it, expect } from 'vitest'
import { mapClaudeStreamLine } from '../../src/main/agents/claude-stream'
import { ClaudeCodeBackend } from '../../src/main/agents/ClaudeCodeBackend'
import type { QueryFn } from '../../src/main/agents/ClaudeCodeBackend'
import type { AgentEvent, AgentEventText } from '../../src/shared/agent-events'

// ── 픽스처 헬퍼 ──────────────────────────────────────────────────────────────

function mkInit() {
  return {
    type: 'system' as const,
    subtype: 'init' as const,
    session_id: 'test-session-m5',
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
    uuid: 'uuid-init-m5-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
  }
}

/** stream_event content_block_delta text_delta 픽스처 */
function mkTextDelta(text: string) {
  return {
    type: 'stream_event' as const,
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    },
    parent_tool_use_id: null,
    uuid: 'uuid-strm-m5-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-m5',
  }
}

/** stream_event content_block_start (text 타입) 픽스처 */
function mkContentBlockStart(blockType: 'text' | 'tool_use' = 'text', name?: string) {
  return {
    type: 'stream_event' as const,
    event: {
      type: 'content_block_start',
      index: 0,
      content_block: blockType === 'tool_use'
        ? { type: 'tool_use', id: 'toolu_x', name: name ?? 'Bash' }
        : { type: 'text' },
    },
    parent_tool_use_id: null,
    uuid: 'uuid-cbs-m5-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-m5',
  }
}

/** stream_event thinking_delta 픽스처 */
function mkThinkingDelta(thinking: string) {
  return {
    type: 'stream_event' as const,
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'thinking_delta', thinking },
    },
    parent_tool_use_id: null,
    uuid: 'uuid-thk-m5-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-m5',
  }
}

/** stream_event input_json_delta 픽스처 */
function mkInputJsonDelta(partial: string) {
  return {
    type: 'stream_event' as const,
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: partial },
    },
    parent_tool_use_id: null,
    uuid: 'uuid-ijd-m5-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-m5',
  }
}

/** assistant full 메시지 (text 블록만) */
function mkAssistantFull(text: string) {
  return {
    type: 'assistant' as const,
    message: {
      id: 'msg_full',
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'text', text }],
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn' as const,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    parent_tool_use_id: null,
    uuid: 'uuid-asst-m5-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-m5',
  }
}

/** assistant full 메시지 (text + tool_use) */
function mkAssistantFullWithTool(text: string, toolId: string, toolName: string) {
  return {
    type: 'assistant' as const,
    message: {
      id: 'msg_full_with_tool',
      type: 'message' as const,
      role: 'assistant' as const,
      content: [
        { type: 'text', text },
        { type: 'tool_use', id: toolId, name: toolName, input: { command: 'ls' } },
      ],
      model: 'claude-sonnet-4-6',
      stop_reason: 'tool_use' as const,
      stop_sequence: null,
      usage: { input_tokens: 20, output_tokens: 10 },
    },
    parent_tool_use_id: null,
    uuid: 'uuid-asst2-m5-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-m5',
  }
}

/** assistant full 메시지 (thinking + text) */
function mkAssistantFullWithThinking(thinking: string, text: string) {
  return {
    type: 'assistant' as const,
    message: {
      id: 'msg_full_thinking',
      type: 'message' as const,
      role: 'assistant' as const,
      content: [
        { type: 'thinking', thinking },
        { type: 'text', text },
      ],
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn' as const,
      stop_sequence: null,
      usage: { input_tokens: 30, output_tokens: 15 },
    },
    parent_tool_use_id: null,
    uuid: 'uuid-asst3-m5-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-m5',
  }
}

/** user tool_result 메시지 */
function mkToolResult(toolUseId: string) {
  return {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseId,
        is_error: false,
        content: [{ type: 'text', text: 'ok' }],
      }],
    },
    parent_tool_use_id: null,
    uuid: 'uuid-user-m5-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-m5',
  }
}

/** result (성공) */
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
    uuid: 'uuid-rslt-m5-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-m5',
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

// ── A. 매퍼 단위 테스트 (순수 함수) ──────────────────────────────────────────

describe('A. 매퍼 단위 — mapClaudeStreamLine stream_event', () => {
  it('A-1: stream_event content_block_delta text_delta "Hi" → [{type:text, delta:"Hi"}]', () => {
    const obj = mkTextDelta('Hi')
    const events = mapClaudeStreamLine(obj)
    expect(events).toEqual<AgentEvent[]>([{ type: 'text', delta: 'Hi' }])
  })

  it('A-2: stream_event text_delta 빈 문자열 → []', () => {
    const obj = {
      type: 'stream_event',
      event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '' } },
    }
    const events = mapClaudeStreamLine(obj)
    expect(events).toEqual<AgentEvent[]>([])
  })

  it('A-3: stream_event content_block_start (text) → [] (서브타입 무시)', () => {
    const obj = mkContentBlockStart('text')
    const events = mapClaudeStreamLine(obj)
    expect(events).toEqual<AgentEvent[]>([])
  })

  it('A-4: stream_event thinking_delta → [] (이 phase 무시)', () => {
    const obj = mkThinkingDelta('생각 중...')
    const events = mapClaudeStreamLine(obj)
    expect(events).toEqual<AgentEvent[]>([])
  })

  it('A-5: stream_event input_json_delta → [] (무시)', () => {
    const obj = mkInputJsonDelta('{"command":')
    const events = mapClaudeStreamLine(obj)
    expect(events).toEqual<AgentEvent[]>([])
  })

  it('A-6: stream_event content_block_start tool_use → [] (무시)', () => {
    const obj = mkContentBlockStart('tool_use', 'Bash')
    const events = mapClaudeStreamLine(obj)
    expect(events).toEqual<AgentEvent[]>([])
  })

  it('A-7: 무상태 — 같은 입력 같은 출력 (두 번 호출 동일)', () => {
    const obj = mkTextDelta('Hello')
    const r1 = mapClaudeStreamLine(obj)
    const r2 = mapClaudeStreamLine(obj)
    expect(r1).toEqual(r2)
    expect(r1).toEqual<AgentEvent[]>([{ type: 'text', delta: 'Hello' }])
  })
})

// ── B. 펌프 델타 누적 + full suppress ─────────────────────────────────────────

describe('B. 펌프 델타 누적 + full suppress (중복 0)', () => {
  it('B-1: 델타 3개 + full → 버블 1개(같은 messageId), full suppress', async () => {
    const messages = [
      mkInit(),
      mkTextDelta('안'),
      mkTextDelta('녕'),
      mkTextDelta('하세요'),
      mkAssistantFull('안녕하세요'),
      mkResult(),
    ]

    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
    const events = await collectEvents(run)

    const texts = textEvents(events)
    // 델타 3개 → text 이벤트 3개 (full suppress)
    expect(texts).toHaveLength(3)
    expect(texts[0].delta).toBe('안')
    expect(texts[1].delta).toBe('녕')
    expect(texts[2].delta).toBe('하세요')
    // 모두 같은 messageId (같은 버블)
    expect(texts[0].messageId).toBeDefined()
    expect(texts[0].messageId).toBe(texts[1].messageId)
    expect(texts[1].messageId).toBe(texts[2].messageId)
  })

  it('B-2: 델타만(full 없음) → 버블 1개', async () => {
    // full 메시지 없이 델타만 오는 경우 (Phase A 완전 폴백 아닌 경우)
    const messages = [
      mkInit(),
      mkTextDelta('A'),
      mkTextDelta('B'),
      mkResult(),
    ]

    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
    const events = await collectEvents(run)

    const texts = textEvents(events)
    expect(texts).toHaveLength(2)
    expect(texts[0].messageId).toBe(texts[1].messageId)
  })
})

// ── C. 인터리브 회귀가드 (CRITICAL) ───────────────────────────────────────────

describe('C. 인터리브 회귀가드 (CRITICAL)', () => {
  it('C-1: 델타"A"→full(text+tool)→result→델타"B"→full → [msg"A", toolgroup, msg"B"] 중복0', async () => {
    const toolId = 'toolu_bash_m5_001'
    const messages = [
      mkInit(),
      // 첫 assistant 턴: 델타 + full(text+tool)
      mkTextDelta('A'),
      mkAssistantFullWithTool('A', toolId, 'Bash'),
      // tool result
      mkToolResult(toolId),
      // 둘째 assistant 턴: 델타 + full
      mkTextDelta('B'),
      mkAssistantFull('B'),
      mkResult(),
    ]

    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
    const events = await collectEvents(run)

    const texts = textEvents(events)
    const toolCalls = events.filter(e => e.type === 'tool_call')
    const toolResults = events.filter(e => e.type === 'tool_result')

    // text 버블: 2개 (A, B)
    expect(texts).toHaveLength(2)
    // 중복 0: A와 B는 다른 messageId
    expect(texts[0].messageId).not.toBe(texts[1].messageId)
    // 도구 그룹
    expect(toolCalls).toHaveLength(1)
    expect(toolResults).toHaveLength(1)

    // 순서 검증: textA → tool_call → tool_result → textB
    const textAIdx = events.indexOf(texts[0])
    const toolCallIdx = events.findIndex(e => e.type === 'tool_call')
    const toolResultIdx = events.findIndex(e => e.type === 'tool_result')
    const textBIdx = events.indexOf(texts[1])

    expect(textAIdx).toBeLessThan(toolCallIdx)
    expect(toolCallIdx).toBeLessThan(toolResultIdx)
    expect(toolResultIdx).toBeLessThan(textBIdx)
  })

  it('C-2: tool 경계에서 _curTextId 리셋 → 두 text 버블 다른 messageId', async () => {
    const toolId = 'toolu_read_m5_001'
    const messages = [
      mkInit(),
      mkTextDelta('Before'),
      mkAssistantFullWithTool('Before', toolId, 'Read'),
      mkToolResult(toolId),
      mkTextDelta('After'),
      mkAssistantFull('After'),
      mkResult(),
    ]

    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
    const events = await collectEvents(run)

    const texts = textEvents(events)
    expect(texts).toHaveLength(2)
    // 도구 경계 → 다른 버블
    expect(texts[0].messageId).not.toBe(texts[1].messageId)
  })
})

// ── D. 멀티블록 분리 (B1) ─────────────────────────────────────────────────────

describe('D. 멀티블록 분리 — content_block_start 경계 (B1)', () => {
  it('D-1: content_block_start(text) → 델타"A" → content_block_start(tool) → content_block_start(text) → 델타"B" → "B"가 "A"와 다른 버블', async () => {
    const toolId = 'toolu_multi_001'
    const messages = [
      mkInit(),
      mkContentBlockStart('text'),       // 텍스트 블록 시작
      mkTextDelta('A'),                   // 첫 텍스트 블록 델타
      mkContentBlockStart('tool_use', 'Bash'),  // 도구 블록 시작 → _curTextId 리셋
      mkContentBlockStart('text'),        // 두 번째 텍스트 블록 시작 → _curTextId 리셋
      mkTextDelta('B'),                   // 둘째 텍스트 블록 델타 → 새 버블
      // full: A+tool+B 전부
      mkAssistantFullWithTool('A', toolId, 'Bash'),
      mkToolResult(toolId),
      mkAssistantFull('B'),
      mkResult(),
    ]

    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
    const events = await collectEvents(run)

    const texts = textEvents(events)
    // 델타 A와 B는 있어야 함
    const deltaA = texts.find(t => t.delta === 'A')
    const deltaB = texts.find(t => t.delta === 'B')
    expect(deltaA).toBeDefined()
    expect(deltaB).toBeDefined()
    // 다른 버블이어야 함 (B1 - content_block_start 리셋)
    expect(deltaA!.messageId).not.toBe(deltaB!.messageId)
  })
})

// ── E. 연속 run stale (B2) ───────────────────────────────────────────────────

describe('E. 연속 run stale 방지 (B2)', () => {
  it('E-1: 첫 run 스트리밍(_streamedThisMsg=true) 종료 → 둘째 run 첫 full text suppress 없음', async () => {
    // 첫 run: 델타 있음 → _streamedThisMsg=true 종료 (별도 backend 인스턴스)
    const backend1 = new ClaudeCodeBackend(makeMockQueryFn([
      mkInit(),
      mkTextDelta('델타'),
      mkAssistantFull('델타'),
      mkResult(),
    ]))

    const run1 = backend1.start({ messages: [{ role: 'user', content: 'run1' }] })
    const events1 = await collectEvents(run1)
    const texts1 = textEvents(events1)
    // 델타만 있어야 함(full suppress)
    expect(texts1).toHaveLength(1)
    expect(texts1[0].delta).toBe('델타')

    // 둘째 run: 동일 backend에서 새 run — _streamedThisMsg 초기화로 stale 차단
    // 같은 backend 인스턴스에서 두 번째 start (ClaudeAgentRun이 새 인스턴스 생성)
    const backend2 = new ClaudeCodeBackend(makeMockQueryFn([
      mkInit(),
      mkAssistantFull('둘째 run full'),
      mkResult(),
    ]))
    const run2 = backend2.start({ messages: [{ role: 'user', content: 'run2' }] })
    const events2 = await collectEvents(run2)
    const texts2 = textEvents(events2)
    // full이 suppress 없이 나와야 함 (B2 초기화 — _streamedThisMsg=false로 시작)
    expect(texts2).toHaveLength(1)
    expect(texts2[0].delta).toBe('둘째 run full')
  })

  it('E-2: 같은 backend에서 연속 run — 두 번째 run에서 _streamedThisMsg 리셋', async () => {
    // run1: 델타 수신 → _streamedThisMsg=true
    // run2: 같은 backend.start() 호출 → ClaudeAgentRun 새 인스턴스 → _streamedThisMsg=false 시작
    let callCount = 0
    const twoRunQueryFn: QueryFn = async function* (params) {
      callCount++
      const opts = params.options as { abortController?: AbortController } | undefined
      if (callCount === 1) {
        // 첫 run: 델타 + full
        const msgs = [mkInit(), mkTextDelta('Run1'), mkAssistantFull('Run1'), mkResult()]
        for (const msg of msgs) {
          if (opts?.abortController?.signal.aborted) return
          yield msg
        }
      } else {
        // 둘째 run: full만 (델타 없음)
        const msgs = [mkInit(), mkAssistantFull('Run2'), mkResult()]
        for (const msg of msgs) {
          if (opts?.abortController?.signal.aborted) return
          yield msg
        }
      }
    }

    const backend = new ClaudeCodeBackend(twoRunQueryFn)

    const run1 = backend.start({ messages: [{ role: 'user', content: 'msg1' }] })
    const events1 = await collectEvents(run1)
    const texts1 = textEvents(events1)
    // 첫 run: 델타만 (full suppress)
    expect(texts1.find(t => t.delta === 'Run1')).toBeDefined()
    expect(texts1.find(t => t.delta === 'Run1')?.delta).toBe('Run1')

    const run2 = backend.start({ messages: [{ role: 'user', content: 'msg2' }] })
    const events2 = await collectEvents(run2)
    const texts2 = textEvents(events2)
    // 둘째 run: full이 suppress 없이 나와야 함 (새 ClaudeAgentRun → _streamedThisMsg=false)
    expect(texts2).toHaveLength(1)
    expect(texts2[0].delta).toBe('Run2')
  })
})

// ── F. Phase A 폴백 ───────────────────────────────────────────────────────────

describe('F. Phase A 폴백 — 델타 없이 full만', () => {
  it('F-1: 델타 없이 assistant full만 → 버블 1개(suppress 없음, 회귀 0)', async () => {
    const messages = [
      mkInit(),
      mkAssistantFull('전체 텍스트'),
      mkResult(),
    ]

    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
    const events = await collectEvents(run)

    const texts = textEvents(events)
    expect(texts).toHaveLength(1)
    expect(texts[0].delta).toBe('전체 텍스트')
  })

  it('F-2: 공백-only full → 빈 버블 0(S2 — mapClaudeStreamLine 필터)', async () => {
    const messages = [
      mkInit(),
      {
        type: 'assistant' as const,
        message: {
          id: 'msg_blank',
          type: 'message' as const,
          role: 'assistant' as const,
          content: [{ type: 'text', text: '   ' }],
          model: 'claude-sonnet-4-6',
          stop_reason: 'end_turn' as const,
          stop_sequence: null,
          usage: { input_tokens: 5, output_tokens: 1 },
        },
        parent_tool_use_id: null,
        uuid: 'uuid-blank-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
        session_id: 'test-session-m5',
      },
      mkResult(),
    ]

    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
    const events = await collectEvents(run)

    const texts = textEvents(events)
    // 공백-only → mapClaudeStreamLine이 빈 텍스트 필터링 → 버블 0
    expect(texts).toHaveLength(0)
  })
})

// ── G. 델타 사이 비-stream_event 끼임 (S3) ────────────────────────────────────

describe('G. 델타 사이 비-stream_event 끼임 — 분절 없음 (S3)', () => {
  it('G-1: 델타"A" → tool_result → 델타"A2" → 같은 버블 누적(분절 0)', async () => {
    // 가상 시나리오: 델타 사이에 user(tool_result) 메시지가 끼임
    // assistant 경계가 아니므로 _curTextId 무리셋
    const toolId = 'toolu_s3_001'
    const messages = [
      mkInit(),
      mkTextDelta('Hello'),
      mkToolResult(toolId),   // 비-stream_event, 비-assistant → _curTextId 유지
      mkTextDelta(' World'),
      mkAssistantFull('Hello World'),
      mkResult(),
    ]

    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
    const events = await collectEvents(run)

    const texts = textEvents(events)
    // 두 델타 모두 있어야 함
    expect(texts.length).toBeGreaterThanOrEqual(2)
    const helloText = texts.find(t => t.delta === 'Hello')
    const worldText = texts.find(t => t.delta === ' World')
    expect(helloText).toBeDefined()
    expect(worldText).toBeDefined()
    // 같은 버블 (분절 0)
    expect(helloText!.messageId).toBe(worldText!.messageId)
  })
})

// ── H. thinking suppress ─────────────────────────────────────────────────────

describe('H. thinking suppress — 스트리밍된 메시지의 full thinking', () => {
  it('H-1: 텍스트 델타 수신 후 full(thinking+text) → thinking 이벤트 suppress', async () => {
    const messages = [
      mkInit(),
      mkTextDelta('답변 텍스트'),
      mkAssistantFullWithThinking('사고 과정', '답변 텍스트'),
      mkResult(),
    ]

    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
    const events = await collectEvents(run)

    // 텍스트 이벤트는 있어야 함 (델타)
    const texts = textEvents(events)
    expect(texts).toHaveLength(1)
    expect(texts[0].delta).toBe('답변 텍스트')

    // thinking 이벤트는 suppress됨 (_streamedThisMsg=true)
    const thinkingEvents = events.filter(e => e.type === 'thinking')
    expect(thinkingEvents).toHaveLength(0)
  })

  it('H-2: 델타 없이 full만(thinking+text) → thinking 정상 emit', async () => {
    const messages = [
      mkInit(),
      mkAssistantFullWithThinking('사고 과정', '답변'),
      mkResult(),
    ]

    const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
    const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
    const events = await collectEvents(run)

    const texts = textEvents(events)
    const thinkingEvents = events.filter(e => e.type === 'thinking')

    // 비스트리밍 → thinking emit
    expect(thinkingEvents).toHaveLength(1)
    expect(texts).toHaveLength(1)
  })
})
