/**
 * claude-stream.golden.test.ts
 *
 * 고정 샘플 → 기대 AgentEvent[] 비교(골든).
 * mapClaudeStreamLine 함수의 CLI 스키마(Phase 20) + SDK 스키마 확장(Phase 21b) 검증.
 *
 * Phase 21b 추가 케이스:
 * - result is_error=false → done (SDK success 판정 기준)
 * - result is_error=true  → error + done
 * - result subtype=error_max_turns → error + done
 * - result subtype=error_during_execution → error + done
 * - result with modelUsage → done.contextWindow = max(contextWindow)
 * - stream_event → [] (ignored this phase)
 * - 기존 subtype='success' 골든 유지
 */
import { describe, it, expect } from 'vitest'
import { mapClaudeStreamLine } from '../../src/main/agents/claude-stream'
import type { AgentEvent } from '../../src/shared/agent-events'

// ── Claude CLI / SDK stream-json 샘플 스키마 가정 (주석으로 격리) ─────────────
// 1. assistant 메시지 (스트리밍 텍스트):
//    { type: "assistant", message: { role: "assistant", content: [ { type: "text", text: "..." } ] } }
//
// 2. tool_use 블록:
//    { type: "assistant", message: { role: "assistant", content: [ { type: "tool_use", id: "...", name: "...", input: {...} } ] } }
//
// 3. tool_result (사용자 메시지로 반환):
//    { type: "user", message: { role: "user", content: [ { type: "tool_result", tool_use_id: "...", content: [...] } ] } }
//
// 4. result (최종 완료, SDK 기준):
//    { type: "result", subtype: "success", is_error: false, usage: {...}, modelUsage: { "model-id": { contextWindow: N } } }
//    { type: "result", subtype: "error_max_turns" | "error_during_execution", is_error: true, ... }
//
// 5. system 이니셜라이즈:
//    { type: "system", subtype: "init", ... }
//
// 6. stream_event (partial, 이 phase 무시):
//    { type: "stream_event", event: { ... } }
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

  describe('result 타입 (완료) — Phase 20 + 21b 통합', () => {
    // ── 기존 CLI subtype='success' 호환 ─────────────────────────────────────────

    it('result subtype=success + usage → AgentEventDone (usage 변환)', () => {
      const obj = {
        type: 'result',
        subtype: 'success',
        is_error: false,
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
        is_error: false,
        result: 'Done.'
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toEqual<AgentEvent[]>([
        { type: 'done' }
      ])
    })

    // ── Phase 21b: is_error 기반 판정 ───────────────────────────────────────────

    it('result is_error=false (성공) → done (contextWindow 없으면 없음)', () => {
      const obj = {
        type: 'result',
        subtype: 'success',
        is_error: false,
        usage: { input_tokens: 10, output_tokens: 5 }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('done')
      expect((events[0] as { type: 'done'; contextWindow?: number }).contextWindow).toBeUndefined()
    })

    it('result is_error=false + modelUsage → done.contextWindow = max(contextWindow)', () => {
      const obj = {
        type: 'result',
        subtype: 'success',
        is_error: false,
        usage: { input_tokens: 100, output_tokens: 20 },
        modelUsage: {
          'claude-haiku-4-5-20251001': { contextWindow: 200000 },
          'claude-sonnet-4-6': { contextWindow: 180000 }
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('done')
      // max contextWindow: 200000
      expect((events[0] as { type: 'done'; contextWindow?: number }).contextWindow).toBe(200000)
    })

    it('result modelUsage 단일 모델 → done.contextWindow = 해당 모델 값', () => {
      const obj = {
        type: 'result',
        subtype: 'success',
        is_error: false,
        usage: { input_tokens: 50, output_tokens: 10 },
        modelUsage: {
          'claude-haiku-4-5-20251001': { contextWindow: 200000 }
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toHaveLength(1)
      expect((events[0] as { type: 'done'; contextWindow?: number }).contextWindow).toBe(200000)
    })

    it('result modelUsage contextWindow 없는 모델 → done.contextWindow undefined', () => {
      const obj = {
        type: 'result',
        subtype: 'success',
        is_error: false,
        usage: { input_tokens: 50, output_tokens: 10 },
        modelUsage: {
          'some-model': { inputTokens: 50, outputTokens: 10 } // no contextWindow
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toHaveLength(1)
      expect((events[0] as { type: 'done'; contextWindow?: number }).contextWindow).toBeUndefined()
    })

    it('result is_error=true → AgentEventError + AgentEventDone', () => {
      const obj = {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        errors: ['Tool execution failed']
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toHaveLength(2)
      expect(events[0].type).toBe('error')
      expect(events[1].type).toBe('done')
    })

    it('result subtype=error_max_turns is_error=true → error + done', () => {
      const obj = {
        type: 'result',
        subtype: 'error_max_turns',
        is_error: true,
        errors: []
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toHaveLength(2)
      expect(events[0]).toMatchObject({ type: 'error' })
      expect(events[1]).toMatchObject({ type: 'done' })
    })

    it('result subtype=error_during_execution is_error=true → error + done', () => {
      const obj = {
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        errors: ['Some error occurred']
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toHaveLength(2)
      expect(events[0].type).toBe('error')
      expect((events[0] as { type: 'error'; message: string }).message).toContain('Some error occurred')
      expect(events[1].type).toBe('done')
    })

    it('result is_error=true errors 없음 → error(기본 메시지) + done', () => {
      const obj = {
        type: 'result',
        subtype: 'error_max_turns',
        is_error: true
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toHaveLength(2)
      expect(events[0].type).toBe('error')
      expect(typeof (events[0] as { type: 'error'; message: string }).message).toBe('string')
    })

    it('result subtype=success + usage + modelUsage → done에 usage와 contextWindow 모두', () => {
      const obj = {
        type: 'result',
        subtype: 'success',
        is_error: false,
        usage: {
          input_tokens: 1000,
          output_tokens: 200,
          cache_creation_input_tokens: 50,
          cache_read_input_tokens: 25
        },
        modelUsage: {
          'claude-haiku-4-5-20251001': { contextWindow: 200000 }
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toHaveLength(1)
      const done = events[0] as { type: 'done'; usage?: { inputTokens: number; outputTokens: number }; contextWindow?: number }
      expect(done.type).toBe('done')
      expect(done.usage?.inputTokens).toBe(1000)
      expect(done.usage?.outputTokens).toBe(200)
      expect(done.contextWindow).toBe(200000)
    })

    // ── 구 CLI subtype=error 호환 ────────────────────────────────────────────────

    it('result subtype=error (구 CLI 포맷) → error + done', () => {
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

  // ── Phase 21b: stream_event 무시 ───────────────────────────────────────────

  describe('stream_event (partial message, Phase 21b 무시)', () => {
    it('type=stream_event → [] (이 phase에서 무시)', () => {
      const obj = {
        type: 'stream_event',
        event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hello' } }
      }
      expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([])
    })

    it('type=stream_event 다양한 형태 → []', () => {
      expect(mapClaudeStreamLine({ type: 'stream_event' })).toEqual([])
      expect(mapClaudeStreamLine({ type: 'stream_event', event: null })).toEqual([])
    })
  })

  describe('system 초기화 이벤트', () => {
    it('type=system subtype=init → 빈 배열 (무시)', () => {
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

  // ── Phase 24a: thinking / thinking_clear / todos 골든 테스트 ─────────────────

  describe('thinking 블록 (Phase 24a)', () => {
    it('thinking 블록 → AgentEventThinking (텍스트 1줄·90자 cap)', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'The user wants me to analyze the code.' }]
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toEqual<AgentEvent[]>([
        { type: 'thinking', text: 'The user wants me to analyze the code.' }
      ])
    })

    it('thinking 블록 — 여러 줄 → 공백 정규화(1줄)', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'First line\nSecond line\n  Third line' }]
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('thinking')
      // 줄바꿈이 공백으로 정규화되어 1줄
      expect((events[0] as { type: 'thinking'; text: string }).text).toBe('First line Second line Third line')
    })

    it('thinking 블록 — 90자 초과 → cap+줄임표', () => {
      const longThinking = 'A'.repeat(100)
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: longThinking }]
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('thinking')
      const text = (events[0] as { type: 'thinking'; text: string }).text
      // 89자 + '…' = 90자
      expect(text.length).toBe(90)
      expect(text.endsWith('…')).toBe(true)
    })

    it('빈 thinking → skip (이벤트 미생성)', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: '' }]
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toEqual<AgentEvent[]>([])
    })

    it('공백만인 thinking → skip', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: '   \n  ' }]
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toEqual<AgentEvent[]>([])
    })
  })

  describe('thinking_clear — 같은 메시지 내 text 직전 (Phase 24a)', () => {
    it('thinking + text 한 메시지 → [thinking, thinking_clear, text] 순서', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'I need to respond.' },
            { type: 'text', text: 'Here is my response.' }
          ]
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toEqual<AgentEvent[]>([
        { type: 'thinking', text: 'I need to respond.' },
        { type: 'thinking_clear' },
        { type: 'text', delta: 'Here is my response.' }
      ])
    })

    it('thinking 없는 메시지 → thinking_clear 미생성', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Plain response.' }]
        }
      }
      const events = mapClaudeStreamLine(obj)
      // thinking_clear 없음
      expect(events).toEqual<AgentEvent[]>([
        { type: 'text', delta: 'Plain response.' }
      ])
    })

    it('thinking + tool_use → thinking 뒤 thinking_clear 없음(text 없으므로)', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'I will call a tool.' },
            { type: 'tool_use', id: 'toolu_xyz', name: 'bash', input: { command: 'echo hi' } }
          ]
        }
      }
      const events = mapClaudeStreamLine(obj)
      // thinking → tool_call 순서. text가 없으므로 thinking_clear 없음
      expect(events).toEqual<AgentEvent[]>([
        { type: 'thinking', text: 'I will call a tool.' },
        { type: 'tool_call', id: 'toolu_xyz', name: 'bash', input: { command: 'echo hi' } }
      ])
    })

    it('thinking_clear는 메시지 내 첫 text 직전에만 1회', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'Thinking...' },
            { type: 'text', text: 'First text.' },
            { type: 'text', text: 'Second text.' }
          ]
        }
      }
      const events = mapClaudeStreamLine(obj)
      // thinking_clear는 첫 text 직전에만 1회 삽입
      expect(events).toEqual<AgentEvent[]>([
        { type: 'thinking', text: 'Thinking...' },
        { type: 'thinking_clear' },
        { type: 'text', delta: 'First text.' },
        { type: 'text', delta: 'Second text.' }
      ])
    })
  })

  describe('TodoWrite tool_use → AgentEventTodos (Phase 24a)', () => {
    it('TodoWrite → todos 이벤트 (tool_call 미emit)', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_todo1',
              name: 'TodoWrite',
              input: {
                todos: [
                  { id: 'task-1', content: 'Setup project', status: 'completed' },
                  { id: 'task-2', content: 'Write tests', status: 'in_progress' },
                  { id: 'task-3', content: 'Deploy', status: 'pending' }
                ]
              }
            }
          ]
        }
      }
      const events = mapClaudeStreamLine(obj)
      // tool_call 미emit, todos만 emit
      expect(events).toHaveLength(1)
      expect(events[0]).toEqual<AgentEvent>({
        type: 'todos',
        todos: [
          { id: 'task-1', label: 'Setup project', status: 'done' },
          { id: 'task-2', label: 'Write tests', status: 'running' },
          { id: 'task-3', label: 'Deploy', status: 'planned' }
        ]
      })
    })

    it('in_progress + activeForm → label = activeForm', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_todo2',
              name: 'TodoWrite',
              input: {
                todos: [
                  { id: 't1', content: 'Actual content', status: 'in_progress', activeForm: 'Active form label' }
                ]
              }
            }
          ]
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toHaveLength(1)
      expect((events[0] as AgentEvent & { type: 'todos' }).todos[0].label).toBe('Active form label')
    })

    it('in_progress + activeForm 없음 → label = content', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_todo3',
              name: 'TodoWrite',
              input: {
                todos: [
                  { id: 't1', content: 'Regular content', status: 'in_progress' }
                ]
              }
            }
          ]
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toHaveLength(1)
      expect((events[0] as AgentEvent & { type: 'todos' }).todos[0].label).toBe('Regular content')
    })

    it('id 없는 todos → 인덱스 기반 id 생성(1-indexed)', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_todo4',
              name: 'TodoWrite',
              input: {
                todos: [
                  { content: 'First', status: 'completed' },
                  { content: 'Second', status: 'pending' }
                ]
              }
            }
          ]
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toHaveLength(1)
      const todos = (events[0] as AgentEvent & { type: 'todos' }).todos
      expect(todos[0].id).toBe('1')
      expect(todos[1].id).toBe('2')
    })

    it('todos 비배열/누락 → todos=[] 안전 처리', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_todo5',
              name: 'TodoWrite',
              input: {} // todos 누락
            }
          ]
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toHaveLength(1)
      expect(events[0]).toEqual<AgentEvent>({ type: 'todos', todos: [] })
    })

    it('todos null → todos=[] 안전 처리', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_todo6',
              name: 'TodoWrite',
              input: { todos: null }
            }
          ]
        }
      }
      const events = mapClaudeStreamLine(obj)
      expect(events).toHaveLength(1)
      expect(events[0]).toEqual<AgentEvent>({ type: 'todos', todos: [] })
    })

    it('TodoWrite + 일반 tool_use 혼합 → todos만 emit, 일반은 tool_call emit', () => {
      const obj = {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_todo7',
              name: 'TodoWrite',
              input: { todos: [{ id: 't1', content: 'Task A', status: 'pending' }] }
            },
            {
              type: 'tool_use',
              id: 'toolu_bash1',
              name: 'bash',
              input: { command: 'echo done' }
            }
          ]
        }
      }
      const events = mapClaudeStreamLine(obj)
      // TodoWrite → todos (tool_call X), bash → tool_call
      expect(events).toHaveLength(2)
      expect(events[0].type).toBe('todos')
      expect(events[1]).toEqual<AgentEvent>({
        type: 'tool_call',
        id: 'toolu_bash1',
        name: 'bash',
        input: { command: 'echo done' }
      })
    })
  })
})
