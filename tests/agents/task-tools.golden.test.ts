/**
 * task-tools.golden.test.ts — TaskCreate/TaskUpdate/TaskList 골든 테스트 (TDD: 실패 먼저)
 *
 * 배경(F1 fix):
 *   TodoWrite는 SDK 0.3.142+에서 폐기됨. 실 에이전트가 TaskCreate·TaskUpdate를 호출하지만
 *   우리 ClaudeAgentRun이 이를 todo 패널로 라우팅하지 않아 "할 일" 0/0 상태.
 *
 * 설계:
 *   - taskMap / taskSeq는 ClaudeAgentRun(stateful run) 내부에 위치.
 *   - mapClaudeStreamLine은 무상태 유지 — Task* tool_call을 일반 tool_call로 냄.
 *   - ClaudeAgentRun 펌프 루프에서 Task* tool_call을 가로채 taskMap 갱신 + todos 이벤트 push.
 *   - Task* tool_call 자체는 events에 push하지 않음(도구 로그 제외).
 *   - Task* tool_result(id 매칭)도 suppress(고아 결과 방지).
 *
 * 원본 참조: C:/Dev/AgentCodeGUI/src/main/claude/engine.ts L603~628
 */

import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../src/main/agents/ClaudeCodeBackend'
import type { QueryFn } from '../../src/main/agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../src/shared/agent-events'

// ── 픽스처 헬퍼 ─────────────────────────────────────────────────────────────────

/** SDK assistant 메시지 픽스처 (tool_use 전용) */
function mkAssistantToolUse(toolUses: { id: string; name: string; input: unknown }[]) {
  const content: unknown[] = toolUses.map(tu => ({
    type: 'tool_use',
    id: tu.id,
    name: tu.name,
    input: tu.input
  }))
  return {
    type: 'assistant' as const,
    message: {
      id: 'msg_task_001',
      type: 'message' as const,
      role: 'assistant' as const,
      content,
      model: 'claude-haiku-4-5-20251001',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: 'uuid-task-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-task',
  }
}

/** SDK user 메시지 픽스처 (tool_result) */
function mkToolResult(toolUseId: string, output: unknown = 'ok', isError = false) {
  return {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          is_error: isError,
          content: output
        }
      ]
    },
    parent_tool_use_id: null,
    uuid: 'uuid-user-0000-0000-0000-000000000002' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-task',
  }
}

/** SDK result 성공 픽스처 */
function mkResultSuccess() {
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
    uuid: 'uuid-rslt-0000-0000-0000-000000000003' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session-task',
  }
}

/** mock queryFn 생성 */
function makeMockQueryFn(messages: unknown[]): QueryFn {
  return async function* mockQuery(params: { prompt: string; options?: unknown }) {
    const opts = params.options as { abortController?: AbortController } | undefined
    for (const msg of messages) {
      if (opts?.abortController?.signal.aborted) return
      yield msg
    }
  }
}

/** events 전체 수집 헬퍼 */
async function collectEvents(queryFn: QueryFn): Promise<AgentEvent[]> {
  const backend = new ClaudeCodeBackend(queryFn)
  const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
  const events: AgentEvent[] = []
  for await (const event of run.events) {
    events.push(event)
  }
  return events
}

// ── 주요 골든 테스트 ──────────────────────────────────────────────────────────────

describe('Task 도구 → 할 일 패널 배선 (F1 fix)', () => {

  // ── 1. TaskCreate: id 발급, todos emit, tool_call 미emit ─────────────────────

  describe('TaskCreate', () => {
    it('TaskCreate(subject A) → todos에 1건(id=1), tool_call 미emit', async () => {
      const msgs = [
        mkAssistantToolUse([
          { id: 'tc-001', name: 'TaskCreate', input: { subject: 'Task A' } }
        ]),
        mkToolResult('tc-001', 'created'),
        mkResultSuccess()
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))

      // todos 이벤트가 있어야 함
      const todosEvents = events.filter(e => e.type === 'todos')
      expect(todosEvents.length).toBeGreaterThanOrEqual(1)

      // 마지막 todos 이벤트에 Task A가 있어야 함
      const lastTodos = todosEvents[todosEvents.length - 1] as AgentEvent & { type: 'todos' }
      const taskA = lastTodos.todos.find(t => t.label === 'Task A')
      expect(taskA).toBeDefined()
      expect(taskA?.id).toBe('1')
      expect(taskA?.status).toBe('planned')

      // tool_call(name=TaskCreate)은 없어야 함
      const taskCreateCalls = events.filter(
        e => e.type === 'tool_call' && (e as AgentEvent & { type: 'tool_call' }).name === 'TaskCreate'
      )
      expect(taskCreateCalls).toHaveLength(0)
    })

    it('TaskCreate(A) + TaskCreate(B) → todos에 2건(id=1,2 순서 발급), 둘 다 tool_call 미emit', async () => {
      const msgs = [
        mkAssistantToolUse([
          { id: 'tc-001', name: 'TaskCreate', input: { subject: 'Task A' } },
          { id: 'tc-002', name: 'TaskCreate', input: { subject: 'Task B' } }
        ]),
        mkToolResult('tc-001', 'created'),
        mkToolResult('tc-002', 'created'),
        mkResultSuccess()
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))

      // todos 이벤트가 있어야 함
      const todosEvents = events.filter(e => e.type === 'todos')
      expect(todosEvents.length).toBeGreaterThanOrEqual(1)

      // 최종 todos에 A(id=1), B(id=2) 모두 있어야 함
      const lastTodos = todosEvents[todosEvents.length - 1] as AgentEvent & { type: 'todos' }
      const taskA = lastTodos.todos.find(t => t.label === 'Task A')
      const taskB = lastTodos.todos.find(t => t.label === 'Task B')
      expect(taskA).toBeDefined()
      expect(taskB).toBeDefined()
      expect(taskA?.id).toBe('1')
      expect(taskB?.id).toBe('2')

      // tool_call(TaskCreate) 없어야 함
      const taskCalls = events.filter(
        e => e.type === 'tool_call' && (e as AgentEvent & { type: 'tool_call' }).name === 'TaskCreate'
      )
      expect(taskCalls).toHaveLength(0)
    })

    it('description을 subject 폴백으로 사용', async () => {
      const msgs = [
        mkAssistantToolUse([
          { id: 'tc-003', name: 'TaskCreate', input: { description: 'Description Task' } }
        ]),
        mkToolResult('tc-003', 'created'),
        mkResultSuccess()
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))
      const todosEvents = events.filter(e => e.type === 'todos')
      expect(todosEvents.length).toBeGreaterThanOrEqual(1)
      const lastTodos = todosEvents[todosEvents.length - 1] as AgentEvent & { type: 'todos' }
      expect(lastTodos.todos.some(t => t.label === 'Description Task')).toBe(true)
    })

    it('subject/description 빈 문자열 → taskMap에 추가 안 됨', async () => {
      const msgs = [
        mkAssistantToolUse([
          { id: 'tc-004', name: 'TaskCreate', input: { subject: '' } }
        ]),
        mkToolResult('tc-004', 'created'),
        mkResultSuccess()
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))
      // todos 이벤트가 없거나 빈 todos여야 함
      const todosEvents = events.filter(e => e.type === 'todos')
      if (todosEvents.length > 0) {
        const lastTodos = todosEvents[todosEvents.length - 1] as AgentEvent & { type: 'todos' }
        // 빈 subject는 추가 안 됨
        expect(lastTodos.todos.every(t => t.label !== '')).toBe(true)
      }
      // 정상 완료 확인 (에러 없음)
      expect(events.some(e => e.type === 'done')).toBe(true)
    })
  })

  // ── 2. TaskUpdate: status 갱신, deleted 제거 ────────────────────────────────

  describe('TaskUpdate', () => {
    it('TaskCreate(A) → TaskUpdate(taskId=1, status=completed) → todos에 A=done 반영', async () => {
      const msgs = [
        mkAssistantToolUse([
          { id: 'tc-001', name: 'TaskCreate', input: { subject: 'Task A' } }
        ]),
        mkToolResult('tc-001', 'created'),
        mkAssistantToolUse([
          { id: 'tu-001', name: 'TaskUpdate', input: { taskId: '1', status: 'completed' } }
        ]),
        mkToolResult('tu-001', 'updated'),
        mkResultSuccess()
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))
      const todosEvents = events.filter(e => e.type === 'todos')
      expect(todosEvents.length).toBeGreaterThanOrEqual(2)

      // 마지막 todos에 A가 done 상태여야 함
      const lastTodos = todosEvents[todosEvents.length - 1] as AgentEvent & { type: 'todos' }
      const taskA = lastTodos.todos.find(t => t.label === 'Task A')
      expect(taskA).toBeDefined()
      expect(taskA?.status).toBe('done')

      // tool_call(TaskUpdate) 없어야 함
      const taskUpdateCalls = events.filter(
        e => e.type === 'tool_call' && (e as AgentEvent & { type: 'tool_call' }).name === 'TaskUpdate'
      )
      expect(taskUpdateCalls).toHaveLength(0)
    })

    it('TaskCreate(A) + TaskCreate(B) → TaskUpdate(taskId=2, status=deleted) → todos에서 B 제거', async () => {
      const msgs = [
        mkAssistantToolUse([
          { id: 'tc-001', name: 'TaskCreate', input: { subject: 'Task A' } },
          { id: 'tc-002', name: 'TaskCreate', input: { subject: 'Task B' } }
        ]),
        mkToolResult('tc-001', 'created'),
        mkToolResult('tc-002', 'created'),
        mkAssistantToolUse([
          { id: 'tu-002', name: 'TaskUpdate', input: { taskId: '2', status: 'deleted' } }
        ]),
        mkToolResult('tu-002', 'deleted'),
        mkResultSuccess()
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))
      const todosEvents = events.filter(e => e.type === 'todos')
      expect(todosEvents.length).toBeGreaterThanOrEqual(1)

      // 최종 todos에 B가 없어야 함(deleted로 제거)
      const lastTodos = todosEvents[todosEvents.length - 1] as AgentEvent & { type: 'todos' }
      expect(lastTodos.todos.some(t => t.label === 'Task B')).toBe(false)
      // A는 남아 있어야 함
      expect(lastTodos.todos.some(t => t.label === 'Task A')).toBe(true)
    })

    it('TaskUpdate status=in_progress → todos에 running 반영', async () => {
      const msgs = [
        mkAssistantToolUse([
          { id: 'tc-001', name: 'TaskCreate', input: { subject: 'Task A' } }
        ]),
        mkToolResult('tc-001', 'created'),
        mkAssistantToolUse([
          { id: 'tu-001', name: 'TaskUpdate', input: { taskId: '1', status: 'in_progress' } }
        ]),
        mkToolResult('tu-001', 'updated'),
        mkResultSuccess()
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))
      const todosEvents = events.filter(e => e.type === 'todos')
      const lastTodos = todosEvents[todosEvents.length - 1] as AgentEvent & { type: 'todos' }
      const taskA = lastTodos.todos.find(t => t.label === 'Task A')
      expect(taskA?.status).toBe('running')
    })

    it('TaskUpdate subject 갱신 → todos에 새 label 반영', async () => {
      const msgs = [
        mkAssistantToolUse([
          { id: 'tc-001', name: 'TaskCreate', input: { subject: 'Old Subject' } }
        ]),
        mkToolResult('tc-001', 'created'),
        mkAssistantToolUse([
          { id: 'tu-001', name: 'TaskUpdate', input: { taskId: '1', subject: 'New Subject', status: 'pending' } }
        ]),
        mkToolResult('tu-001', 'updated'),
        mkResultSuccess()
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))
      const todosEvents = events.filter(e => e.type === 'todos')
      const lastTodos = todosEvents[todosEvents.length - 1] as AgentEvent & { type: 'todos' }
      expect(lastTodos.todos.some(t => t.label === 'New Subject')).toBe(true)
      expect(lastTodos.todos.some(t => t.label === 'Old Subject')).toBe(false)
    })

    it('TaskUpdate 미존재 taskId → todos 변화 없음(에러 없음)', async () => {
      const msgs = [
        mkAssistantToolUse([
          { id: 'tc-001', name: 'TaskCreate', input: { subject: 'Task A' } }
        ]),
        mkToolResult('tc-001', 'created'),
        mkAssistantToolUse([
          { id: 'tu-999', name: 'TaskUpdate', input: { taskId: '999', status: 'completed' } }
        ]),
        mkToolResult('tu-999', 'not found'),
        mkResultSuccess()
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))
      // 에러 없음
      expect(events.some(e => e.type === 'error')).toBe(false)
      // 정상 완료
      expect(events.some(e => e.type === 'done')).toBe(true)
    })
  })

  // ── 3. TaskList: 현재 스냅샷 re-emit, 변경 없음 ────────────────────────────

  describe('TaskList', () => {
    it('TaskCreate(A) → TaskList → 동일 todos 스냅샷 re-emit', async () => {
      const msgs = [
        mkAssistantToolUse([
          { id: 'tc-001', name: 'TaskCreate', input: { subject: 'Task A' } }
        ]),
        mkToolResult('tc-001', 'created'),
        mkAssistantToolUse([
          { id: 'tl-001', name: 'TaskList', input: {} }
        ]),
        mkToolResult('tl-001', []),
        mkResultSuccess()
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))
      const todosEvents = events.filter(e => e.type === 'todos')
      // TaskCreate 1건 + TaskList 1건 = todos 이벤트 2건 이상
      expect(todosEvents.length).toBeGreaterThanOrEqual(2)

      // 최종 todos에 A가 있어야 함
      const lastTodos = todosEvents[todosEvents.length - 1] as AgentEvent & { type: 'todos' }
      expect(lastTodos.todos.some(t => t.label === 'Task A')).toBe(true)

      // tool_call(TaskList) 없어야 함
      const taskListCalls = events.filter(
        e => e.type === 'tool_call' && (e as AgentEvent & { type: 'tool_call' }).name === 'TaskList'
      )
      expect(taskListCalls).toHaveLength(0)
    })
  })

  // ── 4. tool_result suppress (Task* id 고아 결과 방지) ─────────────────────

  describe('Task* tool_result suppress', () => {
    it('TaskCreate의 tool_result → tool_result 이벤트 미emit(suppress)', async () => {
      const msgs = [
        mkAssistantToolUse([
          { id: 'tc-001', name: 'TaskCreate', input: { subject: 'Task A' } }
        ]),
        mkToolResult('tc-001', 'Task created successfully'),
        mkResultSuccess()
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))

      // tool_result(id='tc-001') 없어야 함
      const taskResults = events.filter(
        e => e.type === 'tool_result' && (e as AgentEvent & { type: 'tool_result' }).id === 'tc-001'
      )
      expect(taskResults).toHaveLength(0)
    })

    it('TaskUpdate의 tool_result → tool_result 이벤트 미emit(suppress)', async () => {
      const msgs = [
        mkAssistantToolUse([
          { id: 'tc-001', name: 'TaskCreate', input: { subject: 'Task A' } }
        ]),
        mkToolResult('tc-001', 'created'),
        mkAssistantToolUse([
          { id: 'tu-001', name: 'TaskUpdate', input: { taskId: '1', status: 'completed' } }
        ]),
        mkToolResult('tu-001', 'Task updated'),
        mkResultSuccess()
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))

      // tool_result(id='tu-001') 없어야 함
      const updateResults = events.filter(
        e => e.type === 'tool_result' && (e as AgentEvent & { type: 'tool_result' }).id === 'tu-001'
      )
      expect(updateResults).toHaveLength(0)
    })

    it('TaskList의 tool_result → tool_result 이벤트 미emit(suppress)', async () => {
      const msgs = [
        mkAssistantToolUse([
          { id: 'tl-001', name: 'TaskList', input: {} }
        ]),
        mkToolResult('tl-001', []),
        mkResultSuccess()
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))

      // tool_result(id='tl-001') 없어야 함
      const listResults = events.filter(
        e => e.type === 'tool_result' && (e as AgentEvent & { type: 'tool_result' }).id === 'tl-001'
      )
      expect(listResults).toHaveLength(0)
    })
  })

  // ── 5. 비-Task 도구 회귀: todos 0, 정상 tool_call ──────────────────────────

  describe('비-Task 도구 회귀', () => {
    it('Read 도구 → todos 0, 정상 tool_call emit', async () => {
      const msgs = [
        mkAssistantToolUse([
          { id: 'read-001', name: 'Read', input: { file_path: '/src/index.ts' } }
        ]),
        mkToolResult('read-001', 'file contents'),
        mkResultSuccess()
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))

      // todos 이벤트 없음
      expect(events.filter(e => e.type === 'todos')).toHaveLength(0)
      // tool_call(Read) 있어야 함
      const readCalls = events.filter(
        e => e.type === 'tool_call' && (e as AgentEvent & { type: 'tool_call' }).name === 'Read'
      )
      expect(readCalls).toHaveLength(1)
      // tool_result(read-001) 있어야 함
      const readResults = events.filter(
        e => e.type === 'tool_result' && (e as AgentEvent & { type: 'tool_result' }).id === 'read-001'
      )
      expect(readResults).toHaveLength(1)
    })

    it('Bash 도구 → todos 0, 정상 tool_call emit(기존 회귀)', async () => {
      const msgs = [
        mkAssistantToolUse([
          { id: 'bash-001', name: 'Bash', input: { command: 'ls' } }
        ]),
        mkToolResult('bash-001', 'output'),
        mkResultSuccess()
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))

      expect(events.filter(e => e.type === 'todos')).toHaveLength(0)
      const bashCalls = events.filter(
        e => e.type === 'tool_call' && (e as AgentEvent & { type: 'tool_call' }).name === 'Bash'
      )
      expect(bashCalls).toHaveLength(1)
    })
  })

  // ── 6. Task* + 비-Task 혼합 ─────────────────────────────────────────────────

  describe('Task* + 비-Task 도구 혼합', () => {
    it('TaskCreate + Read 혼합 → todos emit, tool_call(Read)만 emit', async () => {
      const msgs = [
        mkAssistantToolUse([
          { id: 'tc-001', name: 'TaskCreate', input: { subject: 'Setup' } },
          { id: 'read-001', name: 'Read', input: { file_path: '/README.md' } }
        ]),
        mkToolResult('tc-001', 'created'),
        mkToolResult('read-001', 'readme'),
        mkResultSuccess()
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))

      // todos 이벤트 있어야 함
      expect(events.filter(e => e.type === 'todos').length).toBeGreaterThanOrEqual(1)
      // tool_call(Read) 있어야 함
      expect(events.filter(
        e => e.type === 'tool_call' && (e as AgentEvent & { type: 'tool_call' }).name === 'Read'
      )).toHaveLength(1)
      // tool_call(TaskCreate) 없어야 함
      expect(events.filter(
        e => e.type === 'tool_call' && (e as AgentEvent & { type: 'tool_call' }).name === 'TaskCreate'
      )).toHaveLength(0)
      // tool_result(read-001) 있어야 함(suppress 안 됨)
      expect(events.filter(
        e => e.type === 'tool_result' && (e as AgentEvent & { type: 'tool_result' }).id === 'read-001'
      )).toHaveLength(1)
      // tool_result(tc-001) 없어야 함(suppress)
      expect(events.filter(
        e => e.type === 'tool_result' && (e as AgentEvent & { type: 'tool_result' }).id === 'tc-001'
      )).toHaveLength(0)
    })
  })

  // ── 7. 통합 시퀀스: TaskCreate(A) + TaskCreate(B) → TaskUpdate(1=completed) → TaskUpdate(2=deleted) → TaskList ──

  describe('통합 시퀀스', () => {
    it('TaskCreate(A+B) → TaskUpdate(1=completed) → TaskUpdate(2=deleted) → TaskList re-emit', async () => {
      const msgs = [
        // A, B 생성
        mkAssistantToolUse([
          { id: 'tc-001', name: 'TaskCreate', input: { subject: 'Task A' } },
          { id: 'tc-002', name: 'TaskCreate', input: { subject: 'Task B' } }
        ]),
        mkToolResult('tc-001', 'created'),
        mkToolResult('tc-002', 'created'),
        // A 완료
        mkAssistantToolUse([
          { id: 'tu-001', name: 'TaskUpdate', input: { taskId: '1', status: 'completed' } }
        ]),
        mkToolResult('tu-001', 'updated'),
        // B 삭제
        mkAssistantToolUse([
          { id: 'tu-002', name: 'TaskUpdate', input: { taskId: '2', status: 'deleted' } }
        ]),
        mkToolResult('tu-002', 'deleted'),
        // 목록 확인
        mkAssistantToolUse([
          { id: 'tl-001', name: 'TaskList', input: {} }
        ]),
        mkToolResult('tl-001', []),
        mkResultSuccess()
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))

      // 최종 todos: A=done, B 없음
      const todosEvents = events.filter(e => e.type === 'todos')
      expect(todosEvents.length).toBeGreaterThanOrEqual(1)
      const lastTodos = todosEvents[todosEvents.length - 1] as AgentEvent & { type: 'todos' }

      const taskA = lastTodos.todos.find(t => t.label === 'Task A')
      expect(taskA).toBeDefined()
      expect(taskA?.status).toBe('done')
      expect(lastTodos.todos.some(t => t.label === 'Task B')).toBe(false)

      // Task* tool_call 전혀 없어야 함
      const taskToolCalls = events.filter(e => {
        if (e.type !== 'tool_call') return false
        const name = (e as AgentEvent & { type: 'tool_call' }).name
        return ['TaskCreate', 'TaskUpdate', 'TaskList'].includes(name)
      })
      expect(taskToolCalls).toHaveLength(0)

      // Task* tool_result 없어야 함
      const suppressedIds = new Set(['tc-001', 'tc-002', 'tu-001', 'tu-002', 'tl-001'])
      const leakedResults = events.filter(e => {
        if (e.type !== 'tool_result') return false
        const id = (e as AgentEvent & { type: 'tool_result' }).id
        return suppressedIds.has(id)
      })
      expect(leakedResults).toHaveLength(0)
    })
  })

  // ── 8. TodoWrite 기존 경로 회귀 (dead path지만 동작 방해 없어야 함) ────────────

  describe('TodoWrite 기존 경로 회귀', () => {
    it('TodoWrite tool_use → todos 이벤트(기존 claude-stream 경로, 회귀 0)', async () => {
      const msgs = [
        {
          type: 'assistant' as const,
          message: {
            id: 'msg_tw',
            type: 'message' as const,
            role: 'assistant' as const,
            content: [
              {
                type: 'tool_use',
                id: 'tw-001',
                name: 'TodoWrite',
                input: {
                  todos: [
                    { id: 't1', content: 'Write tests', status: 'completed' }
                  ]
                }
              }
            ],
            model: 'claude-haiku-4-5-20251001',
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 5, output_tokens: 2 }
          },
          parent_tool_use_id: null,
          uuid: 'uuid-tw00-0000-0000-0000-000000000010' as `${string}-${string}-${string}-${string}-${string}`,
          session_id: 'test-session-task',
        },
        mkResultSuccess()
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))

      // todos 이벤트가 있어야 함
      const todosEvents = events.filter(e => e.type === 'todos')
      expect(todosEvents.length).toBeGreaterThanOrEqual(1)
      const todos = (todosEvents[0] as AgentEvent & { type: 'todos' }).todos
      expect(todos.some(t => t.label === 'Write tests' && t.status === 'done')).toBe(true)
      // tool_call(TodoWrite) 없어야 함(claude-stream에서 억제)
      expect(events.filter(
        e => e.type === 'tool_call' && (e as AgentEvent & { type: 'tool_call' }).name === 'TodoWrite'
      )).toHaveLength(0)
    })
  })

  // ── 9. 분기 주의: Task(서브에이전트 스폰)는 TaskCreate와 이름이 다름 ──────────

  describe('Task/Agent(서브에이전트 스폰) 분기 회귀', () => {
    it('Task 도구(서브에이전트 스폰)는 TaskCreate와 다름 → subagent 이벤트, todos 0', async () => {
      const msgs = [
        {
          type: 'assistant' as const,
          // parent_tool_use_id 없음 = 최상위
          message: {
            id: 'msg_task',
            type: 'message' as const,
            role: 'assistant' as const,
            content: [
              {
                type: 'tool_use',
                id: 'toolu_task_spawn',
                name: 'Task',
                input: {
                  subagent_type: 'explorer',
                  description: 'Explore the codebase',
                  prompt: 'List files'
                }
              }
            ],
            model: 'claude-haiku-4-5-20251001',
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 5, output_tokens: 2 }
          },
          parent_tool_use_id: null,
          uuid: 'uuid-task-0000-0000-0000-0000-spawn001' as `${string}-${string}-${string}-${string}-${string}`,
          session_id: 'test-session-task',
        },
        mkResultSuccess()
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))

      // subagent 이벤트 있어야 함 (claude-stream 경로, 기존 동작)
      expect(events.filter(e => e.type === 'subagent')).toHaveLength(1)
      // todos 이벤트 없어야 함 (Task != TaskCreate)
      expect(events.filter(e => e.type === 'todos')).toHaveLength(0)
      // tool_call 없어야 함 (subagent로 처리)
      expect(events.filter(e => e.type === 'tool_call')).toHaveLength(0)
    })
  })
})
