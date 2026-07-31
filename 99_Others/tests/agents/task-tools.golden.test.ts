import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'

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

function makeMockQueryFn(messages: unknown[]): QueryFn {
  return async function* mockQuery(params: { prompt: string; options?: unknown }) {
    const opts = params.options as { abortController?: AbortController } | undefined
    for (const msg of messages) {
      if (opts?.abortController?.signal.aborted) return
      yield msg
    }
  }
}

async function collectEvents(queryFn: QueryFn): Promise<AgentEvent[]> {
  const backend = new ClaudeCodeBackend(queryFn)
  const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
  const events: AgentEvent[] = []
  for await (const event of run.events) {
    events.push(event)
  }
  return events
}

describe('Task 도구 → 할 일 패널 배선 (F1 fix)', () => {

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

      const todosEvents = events.filter(e => e.type === 'todos')
      expect(todosEvents.length).toBeGreaterThanOrEqual(1)

      const lastTodos = todosEvents[todosEvents.length - 1] as AgentEvent & { type: 'todos' }
      const taskA = lastTodos.todos.find(t => t.label === 'Task A')
      expect(taskA).toBeDefined()
      expect(taskA?.id).toBe('1')
      expect(taskA?.status).toBe('planned')

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

      const todosEvents = events.filter(e => e.type === 'todos')
      expect(todosEvents.length).toBeGreaterThanOrEqual(1)

      const lastTodos = todosEvents[todosEvents.length - 1] as AgentEvent & { type: 'todos' }
      const taskA = lastTodos.todos.find(t => t.label === 'Task A')
      const taskB = lastTodos.todos.find(t => t.label === 'Task B')
      expect(taskA).toBeDefined()
      expect(taskB).toBeDefined()
      expect(taskA?.id).toBe('1')
      expect(taskB?.id).toBe('2')

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
      const todosEvents = events.filter(e => e.type === 'todos')
      if (todosEvents.length > 0) {
        const lastTodos = todosEvents[todosEvents.length - 1] as AgentEvent & { type: 'todos' }
        expect(lastTodos.todos.every(t => t.label !== '')).toBe(true)
      }
      expect(events.some(e => e.type === 'done')).toBe(true)
    })
  })

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

      const lastTodos = todosEvents[todosEvents.length - 1] as AgentEvent & { type: 'todos' }
      const taskA = lastTodos.todos.find(t => t.label === 'Task A')
      expect(taskA).toBeDefined()
      expect(taskA?.status).toBe('done')

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

      const lastTodos = todosEvents[todosEvents.length - 1] as AgentEvent & { type: 'todos' }
      expect(lastTodos.todos.some(t => t.label === 'Task B')).toBe(false)
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
      expect(events.some(e => e.type === 'error')).toBe(false)
      expect(events.some(e => e.type === 'done')).toBe(true)
    })
  })

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
      expect(todosEvents.length).toBeGreaterThanOrEqual(2)

      const lastTodos = todosEvents[todosEvents.length - 1] as AgentEvent & { type: 'todos' }
      expect(lastTodos.todos.some(t => t.label === 'Task A')).toBe(true)

      const taskListCalls = events.filter(
        e => e.type === 'tool_call' && (e as AgentEvent & { type: 'tool_call' }).name === 'TaskList'
      )
      expect(taskListCalls).toHaveLength(0)
    })
  })

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

      const listResults = events.filter(
        e => e.type === 'tool_result' && (e as AgentEvent & { type: 'tool_result' }).id === 'tl-001'
      )
      expect(listResults).toHaveLength(0)
    })
  })

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

      expect(events.filter(e => e.type === 'todos')).toHaveLength(0)
      const readCalls = events.filter(
        e => e.type === 'tool_call' && (e as AgentEvent & { type: 'tool_call' }).name === 'Read'
      )
      expect(readCalls).toHaveLength(1)
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

      expect(events.filter(e => e.type === 'todos').length).toBeGreaterThanOrEqual(1)
      expect(events.filter(
        e => e.type === 'tool_call' && (e as AgentEvent & { type: 'tool_call' }).name === 'Read'
      )).toHaveLength(1)
      expect(events.filter(
        e => e.type === 'tool_call' && (e as AgentEvent & { type: 'tool_call' }).name === 'TaskCreate'
      )).toHaveLength(0)
      expect(events.filter(
        e => e.type === 'tool_result' && (e as AgentEvent & { type: 'tool_result' }).id === 'read-001'
      )).toHaveLength(1)
      expect(events.filter(
        e => e.type === 'tool_result' && (e as AgentEvent & { type: 'tool_result' }).id === 'tc-001'
      )).toHaveLength(0)
    })
  })

  describe('통합 시퀀스', () => {
    it('TaskCreate(A+B) → TaskUpdate(1=completed) → TaskUpdate(2=deleted) → TaskList re-emit', async () => {
      const msgs = [
        mkAssistantToolUse([
          { id: 'tc-001', name: 'TaskCreate', input: { subject: 'Task A' } },
          { id: 'tc-002', name: 'TaskCreate', input: { subject: 'Task B' } }
        ]),
        mkToolResult('tc-001', 'created'),
        mkToolResult('tc-002', 'created'),
        mkAssistantToolUse([
          { id: 'tu-001', name: 'TaskUpdate', input: { taskId: '1', status: 'completed' } }
        ]),
        mkToolResult('tu-001', 'updated'),
        mkAssistantToolUse([
          { id: 'tu-002', name: 'TaskUpdate', input: { taskId: '2', status: 'deleted' } }
        ]),
        mkToolResult('tu-002', 'deleted'),
        mkAssistantToolUse([
          { id: 'tl-001', name: 'TaskList', input: {} }
        ]),
        mkToolResult('tl-001', []),
        mkResultSuccess()
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))

      const todosEvents = events.filter(e => e.type === 'todos')
      expect(todosEvents.length).toBeGreaterThanOrEqual(1)
      const lastTodos = todosEvents[todosEvents.length - 1] as AgentEvent & { type: 'todos' }

      const taskA = lastTodos.todos.find(t => t.label === 'Task A')
      expect(taskA).toBeDefined()
      expect(taskA?.status).toBe('done')
      expect(lastTodos.todos.some(t => t.label === 'Task B')).toBe(false)

      const taskToolCalls = events.filter(e => {
        if (e.type !== 'tool_call') return false
        const name = (e as AgentEvent & { type: 'tool_call' }).name
        return ['TaskCreate', 'TaskUpdate', 'TaskList'].includes(name)
      })
      expect(taskToolCalls).toHaveLength(0)

      const suppressedIds = new Set(['tc-001', 'tc-002', 'tu-001', 'tu-002', 'tl-001'])
      const leakedResults = events.filter(e => {
        if (e.type !== 'tool_result') return false
        const id = (e as AgentEvent & { type: 'tool_result' }).id
        return suppressedIds.has(id)
      })
      expect(leakedResults).toHaveLength(0)
    })
  })

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

      const todosEvents = events.filter(e => e.type === 'todos')
      expect(todosEvents.length).toBeGreaterThanOrEqual(1)
      const todos = (todosEvents[0] as AgentEvent & { type: 'todos' }).todos
      expect(todos.some(t => t.label === 'Write tests' && t.status === 'done')).toBe(true)
      expect(events.filter(
        e => e.type === 'tool_call' && (e as AgentEvent & { type: 'tool_call' }).name === 'TodoWrite'
      )).toHaveLength(0)
    })
  })

  describe('Task/Agent(서브에이전트 스폰) 분기 회귀', () => {
    it('Task 도구(서브에이전트 스폰)는 TaskCreate와 다름 → subagent 이벤트, todos 0', async () => {
      const msgs = [
        {
          type: 'assistant' as const,
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

      expect(events.filter(e => e.type === 'subagent')).toHaveLength(1)
      expect(events.filter(e => e.type === 'todos')).toHaveLength(0)
      expect(events.filter(e => e.type === 'tool_call')).toHaveLength(0)
    })

    it('Task input.name + input.model → subagent 생성 이벤트에 displayName/model 그대로 도달(종단)', async () => {
      const msgs = [
        mkAssistantToolUse([
          {
            id: 'toolu_task_spawn2',
            name: 'Task',
            input: {
              subagent_type: 'general-purpose',
              description: 'Compute 1+1',
              prompt: '1+1?',
              name: '소네트 테스트 에이전트 1',
              model: 'opus',
            },
          },
        ]),
        mkResultSuccess(),
      ]

      const events = await collectEvents(makeMockQueryFn(msgs))
      const subagentEvents = events.filter(
        (e): e is AgentEvent & { type: 'subagent' } => e.type === 'subagent'
      )
      expect(subagentEvents).toHaveLength(1)
      expect(subagentEvents[0].subagent.name).toBe('general-purpose')
      expect(subagentEvents[0].subagent.displayName).toBe('소네트 테스트 에이전트 1')
      expect(subagentEvents[0].subagent.model).toBe('opus')
    })
  })
})
