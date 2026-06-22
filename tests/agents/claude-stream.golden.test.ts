/**
 * claude-stream.golden.test.ts
 *
 * 고정 NDJSON 샘플 → 기대 AgentEvent[] 비교(골든).
 * mapClaudeStreamLine 함수와 ClaudeCodeBackend 식별자를 검증.
 *
 * 식별자 참조: ClaudeCodeBackend, mapClaudeStreamLine
 */
import { describe, it, expect } from 'vitest'
import { mapClaudeStreamLine } from '../../src/main/agents/claude-stream'
import type { AgentEvent } from '../../src/shared/agent-events'

// ── Claude CLI stream-json 샘플 스키마 가정 (주석으로 격리) ─────────────────
// claude -p --output-format stream-json --verbose 출력 구조:
//
// 1. assistant 메시지 (스트리밍 텍스트):
//    { type: "assistant", message: { role: "assistant", content: [ { type: "text", text: "..." } ] } }
//
// 2. tool_use 블록:
//    { type: "assistant", message: { role: "assistant", content: [ { type: "tool_use", id: "...", name: "...", input: {...} } ] } }
//
// 3. tool_result (사용자 메시지로 반환):
//    { type: "user", message: { role: "user", content: [ { type: "tool_result", tool_use_id: "...", content: [...] } ] } }
//
// 4. result (최종 완료):
//    { type: "result", subtype: "success", result: "...", usage: { input_tokens: N, output_tokens: N, cache_creation_input_tokens?: N, cache_read_input_tokens?: N } }
//
// 5. system 이니셜라이즈:
//    { type: "system", subtype: "init", ... }
// ────────────────────────────────────────────────────────────────────────────

describe('mapClaudeStreamLine — 골든 테스트', () => {
  describe('assistant 텍스트 메시지', () => {
    it('단순 텍스트 content → AgentEventText', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello, world!' }]
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toEqual<AgentEvent[]>([
        { type: 'text', delta: 'Hello, world!' }
      ])
    })

    it('여러 텍스트 블록 → 여러 AgentEventText', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'First part. ' },
            { type: 'text', text: 'Second part.' }
          ]
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toEqual<AgentEvent[]>([
        { type: 'text', delta: 'First part. ' },
        { type: 'text', delta: 'Second part.' }
      ])
    })

    it('빈 텍스트 블록 → 빈 배열', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: '' }]
        }
      }
      const events = mapClaudeStreamLine(obj)
      // 빈 문자열 delta는 필터링
      expect(events).toEqual<AgentEvent[]>([])
    })
  })

  describe('tool_use 블록 (tool_call)', () => {
    it('tool_use content → AgentEventToolCall', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_01XFDUDYJgAACTvkkz7ZvXSy',
              name: 'bash',
              input: { command: 'ls -la' }
            }
          ]
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toEqual<AgentEvent[]>([
        {
          type: 'tool_call',
          id: 'toolu_01XFDUDYJgAACTvkkz7ZvXSy',
          name: 'bash',
          input: { command: 'ls -la' }
        }
      ])
    })

    it('혼합 텍스트 + tool_use → text + tool_call 순서 보존', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'I will run a command.' },
            {
              type: 'tool_use',
              id: 'toolu_abc123',
              name: 'read_file',
              input: { path: '/src/index.ts' }
            }
          ]
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toEqual<AgentEvent[]>([
        { type: 'text', delta: 'I will run a command.' },
        {
          type: 'tool_call',
          id: 'toolu_abc123',
          name: 'read_file',
          input: { path: '/src/index.ts' }
        }
      ])
    })
  })

  describe('tool_result (user 메시지)', () => {
    it('성공 tool_result → AgentEventToolResult ok=true', () => {
      const obj = {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_01XFDUDYJgAACTvkkz7ZvXSy',
              content: [{ type: 'text', text: 'file contents here' }]
            }
          ]
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toEqual<AgentEvent[]>([
        {
          type: 'tool_result',
          id: 'toolu_01XFDUDYJgAACTvkkz7ZvXSy',
          ok: true,
          output: [{ type: 'text', text: 'file contents here' }]
        }
      ])
    })

    it('에러 tool_result (is_error=true) → AgentEventToolResult ok=false', () => {
      const obj = {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_err456',
              is_error: true,
              content: [{ type: 'text', text: 'command not found' }]
            }
          ]
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toEqual<AgentEvent[]>([
        {
          type: 'tool_result',
          id: 'toolu_err456',
          ok: false,
          output: [{ type: 'text', text: 'command not found' }]
        }
      ])
    })
  })

  describe('result 타입 (완료)', () => {
    it('result subtype=success + usage → AgentEventDone', () => {
      const obj = {
        type: 'result',
        subtype: 'success',
        result: 'Task completed successfully.',
        usage: {
          input_tokens: 1234,
          output_tokens: 567,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 50
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toEqual<AgentEvent[]>([
        {
          type: 'done',
          usage: {
            inputTokens: 1234,
            outputTokens: 567,
            cacheCreationTokens: 100,
            cacheReadTokens: 50
          }
        }
      ])
    })

    it('result subtype=success usage 없음 → AgentEventDone usage 없음', () => {
      const obj = {
        type: 'result',
        subtype: 'success',
        result: 'Done.'
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toEqual<AgentEvent[]>([
        { type: 'done' }
      ])
    })

    it('result subtype=error → AgentEventError + AgentEventDone', () => {
      const obj = {
        type: 'result',
        subtype: 'error',
        error: 'Something went wrong'
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toEqual<AgentEvent[]>([
        { type: 'error', message: 'Something went wrong' },
        { type: 'done' }
      ])
    })
  })

  describe('system 초기화 이벤트', () => {
    it('type=system → 빈 배열 (무시)', () => {
      const obj = {
        type: 'system',
        subtype: 'init',
        cwd: '/workspace',
        tools: ['bash', 'read_file'],
        model: 'claude-sonnet-4-6'
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toEqual<AgentEvent[]>([])
    })
  })

  describe('알 수 없는 줄', () => {
    it('null → 빈 배열', () => {
      expect(mapClaudeStreamLine(null)).toEqual<AgentEvent[]>([])
    })

    it('빈 객체 → 빈 배열', () => {
      expect(mapClaudeStreamLine({})).toEqual<AgentEvent[]>([])
    })

    it('알 수 없는 type → 빈 배열', () => {
      const obj = { type: 'unknown_future_type', data: 'something' }
      expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([])
    })

    it('비객체(문자열) → 빈 배열', () => {
      expect(mapClaudeStreamLine('raw string')).toEqual<AgentEvent[]>([])
    })

    it('숫자 → 빈 배열', () => {
      expect(mapClaudeStreamLine(42)).toEqual<AgentEvent[]>([])
    })
  })
})
