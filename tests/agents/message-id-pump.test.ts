/**
 * message-id-pump.test.ts — Phase A-1: backend 펌프 messageId 부여 TDD
 *
 * ClaudeAgentRun._runPump이 텍스트 블록마다 messageId를 부여하는지 검증.
 *
 * 설계 근거:
 *  - mapClaudeStreamLine은 순수 무상태 유지(messageId 미부여).
 *  - stateful 펌프(ClaudeAgentRun)가 후처리로 messageId를 채운다.
 *  - 런 내 결정적(같은 블록 = 같은 id), 런 간 고유(충돌 0).
 *  - tool_call 발생 시 _curTextId 리셋 → 다음 text는 새 블록(새 messageId).
 *  - SDK 메시지 경계(각 msg 처리 후)에서도 _curTextId 리셋.
 *  - Task*(suppress), subagent 이벤트는 리셋하지 않음.
 *
 * AC:
 * ① [text][tool_call][text] → 두 text의 messageId가 서로 다르다 (블록 경계 분리)
 * ② 사이에 tool 없이 연속 text → 같은 messageId (같은 블록)
 * ③ SDK 메시지 경계를 넘으면 새 messageId
 * ④ 실 tool_call이 리셋, Task* / subagent는 리셋 안 함
 * ⑤ 런 간 고유성: 두 run의 첫 text messageId가 서로 다르다
 * ⑥ 회귀: mapClaudeStreamLine 골든 테스트 순수성(messageId 미부여) 보존
 */

import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../src/main/01_agents/ClaudeCodeBackend'
import { mapClaudeStreamLine } from '../../src/main/01_agents/claude-stream'
import type { QueryFn } from '../../src/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent, AgentEventText } from '../../src/shared/agent-events'

// ── 픽스처 헬퍼 (claude-backend-sdk.test.ts 패턴 재사용) ────────────────────────

function mkInit() {
  return {
    type: 'system' as const,
    subtype: 'init' as const,
    session_id: 'test-session-msgid',
    model: 'claude-haiku-4-5-20251001',
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
    uuid: 'uuid-init-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
  }
}

/** SDK assistant 메시지 — 한 메시지 내 content 배열로 구성 */
function mkAssistantMsg(blocks: Array<
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
>) {
  return {
    type: 'assistant' as const,
    message: {
      id: 'msg_001',
      type: 'message' as const,
      role: 'assistant' as const,
      content: blocks,
      model: 'claude-haiku-4-5-20251001',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: 'uuid-asst-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-msgid',
  }
}

function mkToolResultMsg(toolUseId: string) {
  return {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseId,
        is_error: false,
        content: [{ type: 'text', text: 'ok' }]
      }]
    },
    parent_tool_use_id: null,
    uuid: 'uuid-user-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-msgid',
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
    uuid: 'uuid-rslt-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-msgid',
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

/** 이벤트 스트림을 배열로 수집하는 헬퍼 */
async function collectEvents(run: { events: AsyncIterable<AgentEvent> }): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  for await (const event of run.events) {
    events.push(event)
  }
  return events
}

/** text 이벤트만 필터 */
function textEvents(events: AgentEvent[]): AgentEventText[] {
  return events.filter((e): e is AgentEventText => e.type === 'text')
}

// ── AC① [text][tool_call][text] → 두 text의 messageId가 서로 다르다 ──────────

describe('Phase A-1: backend 펌프 messageId 부여', () => {
  describe('AC① [text][tool_call][text] 블록 경계 분리', () => {
    it('한 assistant 메시지 내 text→tool_use→text → messageId 두 개가 다르다', async () => {
      // 한 SDK 메시지 content: [text, tool_use(Bash), text]
      const messages = [
        mkInit(),
        mkAssistantMsg([
          { type: 'text', text: '먼저 확인하겠습니다.' },
          { type: 'tool_use', id: 'toolu_bash_001', name: 'Bash', input: { command: 'ls' } },
          { type: 'text', text: '완료했습니다.' }
        ]),
        mkToolResultMsg('toolu_bash_001'),
        mkResult()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      const events = await collectEvents(run)

      const texts = textEvents(events)
      // text 이벤트가 2개여야 한다
      expect(texts).toHaveLength(2)
      // 두 text의 messageId가 모두 부여되어 있어야 한다
      expect(texts[0].messageId).toBeDefined()
      expect(texts[1].messageId).toBeDefined()
      // 두 messageId가 서로 달라야 한다 (블록 경계 분리)
      expect(texts[0].messageId).not.toBe(texts[1].messageId)
    })

    it('별도 SDK 메시지로 오는 text→tool→text → messageId 두 개가 다르다', async () => {
      // 별도 assistant 메시지: [text], 별도 [tool_use], 별도 [text]
      const messages = [
        mkInit(),
        mkAssistantMsg([
          { type: 'text', text: '시작합니다.' },
        ]),
        mkAssistantMsg([
          { type: 'tool_use', id: 'toolu_read_001', name: 'Read', input: { file_path: '/foo' } },
        ]),
        mkToolResultMsg('toolu_read_001'),
        mkAssistantMsg([
          { type: 'text', text: '읽었습니다.' },
        ]),
        mkResult()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      const events = await collectEvents(run)

      const texts = textEvents(events)
      expect(texts).toHaveLength(2)
      expect(texts[0].messageId).toBeDefined()
      expect(texts[1].messageId).toBeDefined()
      expect(texts[0].messageId).not.toBe(texts[1].messageId)
    })
  })

  describe('AC② 사이에 tool 없이 연속 text → 같은 messageId', () => {
    it('한 SDK 메시지 내 연속 text 두 개 → 같은 messageId', async () => {
      const messages = [
        mkInit(),
        mkAssistantMsg([
          { type: 'text', text: '첫 번째 텍스트.' },
          { type: 'text', text: '두 번째 텍스트.' }
        ]),
        mkResult()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      const events = await collectEvents(run)

      const texts = textEvents(events)
      expect(texts).toHaveLength(2)
      expect(texts[0].messageId).toBeDefined()
      // 같은 블록이므로 같은 messageId여야 한다
      expect(texts[0].messageId).toBe(texts[1].messageId)
    })
  })

  describe('AC③ SDK 메시지 경계를 넘으면 새 messageId', () => {
    it('연속 assistant 메시지의 text → 각각 다른 messageId(메시지 경계 리셋)', async () => {
      // 두 개의 별도 assistant 메시지, 둘 다 text만, tool 없음
      const messages = [
        mkInit(),
        mkAssistantMsg([{ type: 'text', text: '첫 번째 메시지.' }]),
        mkAssistantMsg([{ type: 'text', text: '두 번째 메시지.' }]),
        mkResult()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      const events = await collectEvents(run)

      const texts = textEvents(events)
      expect(texts).toHaveLength(2)
      expect(texts[0].messageId).toBeDefined()
      expect(texts[1].messageId).toBeDefined()
      // SDK 메시지 경계 리셋 → 두 번째 메시지는 새 블록
      expect(texts[0].messageId).not.toBe(texts[1].messageId)
    })
  })

  describe('AC④ 실 tool_call 리셋, Task*/subagent는 리셋 안 함', () => {
    it('Bash(부수효과 도구) tool_call 전후 text → 다른 messageId', async () => {
      const messages = [
        mkInit(),
        mkAssistantMsg([
          { type: 'text', text: '전 텍스트.' },
          { type: 'tool_use', id: 'toolu_write_001', name: 'Write', input: { file_path: '/tmp/x.txt', content: 'x' } },
          { type: 'text', text: '후 텍스트.' }
        ]),
        mkToolResultMsg('toolu_write_001'),
        mkResult()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      const events = await collectEvents(run)

      const texts = textEvents(events)
      expect(texts).toHaveLength(2)
      expect(texts[0].messageId).not.toBe(texts[1].messageId)
    })

    it('TaskCreate(suppress 도구) 전후 text → 같은 messageId(리셋 안 함)', async () => {
      // TaskCreate는 tool_call suppress되므로 리셋 대상 아님
      // 한 메시지 내 text → TaskCreate → text 순서
      // TaskCreate는 _TASK_TOOLS에 속해 continue되므로 _curTextId 유지
      const messages = [
        mkInit(),
        mkAssistantMsg([
          { type: 'text', text: '작업 시작.' },
          // TaskCreate: task* tool — suppress되어 events에 오지 않음
          { type: 'tool_use', id: 'toolu_task_001', name: 'TaskCreate', input: { subject: '할 일 1' } },
          { type: 'text', text: '계획 완료.' }
        ]),
        mkResult()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      const events = await collectEvents(run)

      const texts = textEvents(events)
      // TaskCreate 전후 text 둘 다 있어야 한다
      expect(texts).toHaveLength(2)
      // TaskCreate는 suppress이므로 리셋 안 함 → 같은 messageId
      expect(texts[0].messageId).toBeDefined()
      expect(texts[0].messageId).toBe(texts[1].messageId)
    })

    it('subagent(Task tool) 전후 text → 같은 messageId(리셋 안 함)', async () => {
      // Task(서브에이전트 스폰)는 subagent 이벤트 emit, tool_call 미emit
      // 리셋 대상 아님 → 전후 text 같은 messageId
      const messages = [
        mkInit(),
        mkAssistantMsg([
          { type: 'text', text: '서브에이전트 전.' },
          { type: 'tool_use', id: 'toolu_task_spawn_001', name: 'Task', input: { description: '탐색', subagent_type: 'explorer' } },
          { type: 'text', text: '서브에이전트 후.' }
        ]),
        mkResult()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      const events = await collectEvents(run)

      const texts = textEvents(events)
      // Task 전후 text
      expect(texts).toHaveLength(2)
      // subagent(Task) 이벤트는 리셋 안 함 → 같은 messageId
      expect(texts[0].messageId).toBeDefined()
      expect(texts[0].messageId).toBe(texts[1].messageId)
    })
  })

  describe('AC⑤ 런 간 고유성', () => {
    it('두 번의 run에서 첫 text의 messageId가 서로 다르다', async () => {
      const mkMessages = () => [
        mkInit(),
        mkAssistantMsg([{ type: 'text', text: '안녕하세요.' }]),
        mkResult()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(mkMessages()))

      // run1
      const run1 = backend.start({ messages: [{ role: 'user', content: 'test1' }] })
      const events1 = await collectEvents(run1)
      const texts1 = textEvents(events1)
      expect(texts1).toHaveLength(1)
      const msgId1 = texts1[0].messageId

      // run2 (새 인스턴스 — ClaudeCodeBackend.start()가 새 ClaudeAgentRun 생성)
      const run2 = backend.start({ messages: [{ role: 'user', content: 'test2' }] })
      const events2 = await collectEvents(run2)
      const texts2 = textEvents(events2)
      expect(texts2).toHaveLength(1)
      const msgId2 = texts2[0].messageId

      // 두 run의 messageId가 정의되어 있고 서로 달라야 한다
      expect(msgId1).toBeDefined()
      expect(msgId2).toBeDefined()
      expect(msgId1).not.toBe(msgId2)
    })
  })

  describe('AC⑥ 회귀: mapClaudeStreamLine 순수성 보존 (messageId 미부여)', () => {
    it('mapClaudeStreamLine이 반환하는 text 이벤트에는 messageId가 없다', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: '텍스트' }]
        },
        parent_tool_use_id: null
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('text')
      // 순수 함수 — messageId 미부여
      expect((events[0] as AgentEventText).messageId).toBeUndefined()
    })

    it('mapClaudeStreamLine — text+tool_use 복합 메시지에서도 text에 messageId 없음', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: '전 텍스트' },
            { type: 'tool_use', id: 'toolu_001', name: 'Read', input: {} },
            { type: 'text', text: '후 텍스트' }
          ]
        },
        parent_tool_use_id: null
      }
      const events = mapClaudeStreamLine(obj)
      const texts = events.filter((e): e is AgentEventText => e.type === 'text')
      expect(texts).toHaveLength(2)
      expect(texts[0].messageId).toBeUndefined()
      expect(texts[1].messageId).toBeUndefined()
    })
  })

  describe('messageId 형식 검증', () => {
    it('messageId는 비어있지 않은 문자열이다', async () => {
      const messages = [
        mkInit(),
        mkAssistantMsg([{ type: 'text', text: '텍스트' }]),
        mkResult()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      const events = await collectEvents(run)

      const texts = textEvents(events)
      expect(texts).toHaveLength(1)
      expect(typeof texts[0].messageId).toBe('string')
      expect(texts[0].messageId!.length).toBeGreaterThan(0)
    })

    it('같은 런 내 여러 블록의 messageId는 모두 다르다', async () => {
      const messages = [
        mkInit(),
        // 블록1: text
        mkAssistantMsg([{ type: 'text', text: '블록 1' }]),
        // 블록2: tool → text
        mkAssistantMsg([
          { type: 'tool_use', id: 'toolu_r_001', name: 'Read', input: { file_path: '/f' } },
        ]),
        mkToolResultMsg('toolu_r_001'),
        mkAssistantMsg([{ type: 'text', text: '블록 2' }]),
        // 블록3: tool → text
        mkAssistantMsg([
          { type: 'tool_use', id: 'toolu_r_002', name: 'Read', input: { file_path: '/g' } },
        ]),
        mkToolResultMsg('toolu_r_002'),
        mkAssistantMsg([{ type: 'text', text: '블록 3' }]),
        mkResult()
      ]

      const backend = new ClaudeCodeBackend(makeMockQueryFn(messages))
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      const events = await collectEvents(run)

      const texts = textEvents(events)
      expect(texts).toHaveLength(3)

      const ids = texts.map(t => t.messageId)
      // 모두 정의됨
      ids.forEach(id => expect(id).toBeDefined())
      // 모두 다름 (Set 크기 = 배열 크기)
      const idSet = new Set(ids)
      expect(idSet.size).toBe(3)
    })
  })
})
