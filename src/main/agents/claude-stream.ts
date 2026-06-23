/**
 * claude-stream.ts — 순수 정규화 함수 (Phase 24b 업데이트: subagent/parentToolId 매핑)
 *
 * mapClaudeStreamLine: 파싱된 SDK/NDJSON 객체 1개 → AgentEvent[] 변환.
 *
 * 격리 원칙: 엔진 출력 스키마 가정을 이 파일에만 모아둔다.
 * 버전 업그레이드로 스키마가 바뀌면 이 파일만 수정하면 된다.
 * raw 누수 금지 — 반환값은 공통 AgentEvent만.
 *
 * ── SDK / CLI 스키마 가정 ────────────────────────────────────────────────────
 *
 * 1. assistant 메시지 (텍스트/tool_use/thinking):
 *    {
 *      type: "assistant",
 *      parent_tool_use_id?: string | null,   // Phase 24b: 서브에이전트 메시지면 부모 Task id
 *      message: {
 *        role: "assistant",
 *        content: Array<
 *          | { type: "text"; text: string }
 *          | { type: "tool_use"; id: string; name: string; input: unknown }
 *          | { type: "thinking"; thinking: string }
 *        >
 *      }
 *    }
 *
 * 2. user 메시지 (tool_result):
 *    {
 *      type: "user",
 *      message: {
 *        role: "user",
 *        content: Array<{
 *          type: "tool_result";
 *          tool_use_id: string;
 *          is_error?: boolean;
 *          content: unknown;
 *        }>
 *      }
 *    }
 *
 * 3. 최종 result (SDK 기준):
 *    {
 *      type: "result";
 *      subtype: "success" | "error_max_turns" | "error_during_execution" | "error";
 *      is_error: boolean;           // SDK 기준: false=성공, true=실패
 *      usage?: { input_tokens, output_tokens, cache_creation_input_tokens?, cache_read_input_tokens? }
 *      modelUsage?: Record<string, { contextWindow?: number; ... }>  // SDK result
 *      errors?: string[];           // SDK error 배열
 *      error?: string;              // CLI 구 포맷 단일 오류
 *    }
 *
 * 4. system (초기화, 무시):
 *    { type: "system"; subtype: "init"; ... }
 *
 * 5. stream_event (partial message, Phase 21b 무시):
 *    { type: "stream_event"; ... }
 *    includePartialMessages=false이므로 이 phase에선 yield 없음.
 *
 * ── Phase 24a 추가 ──────────────────────────────────────────────────────────
 *
 * thinking 블록:
 *   { type: "thinking"; thinking: string }
 *   → AgentEventThinking { type: 'thinking'; text: oneLine(thinking, 90) }
 *   빈 thinking은 skip.
 *
 * thinking_clear (메시지 내 best-effort):
 *   같은 content 배열에서 thinking을 emit한 뒤 첫 text 블록 직전에
 *   AgentEventThinkingClear { type: 'thinking_clear' } 1회 삽입.
 *   크로스-메시지 정리는 렌더러가 text/done 이벤트에서 보강.
 *
 * TodoWrite tool_use:
 *   { type: "tool_use"; name: "TodoWrite"; input: { todos: [...] } }
 *   → AgentEventTodos { type: 'todos'; todos: TodoItem[] }
 *   TodoWrite는 tool_call로 emit하지 않음 (원본 engine.ts 동작 미러).
 *   단, 이후 오는 TodoWrite id의 tool_result는 미매칭 상태가 됨.
 *   렌더러가 미매칭 result를 드롭하는 전제로 백엔드는 result를 그대로 emit.
 *
 * ── Phase 24b 추가 ──────────────────────────────────────────────────────────
 *
 * Task / Agent tool_use (최상위, parent_tool_use_id 없음):
 *   → AgentEventSubagent { type: 'subagent', subagent: { id, name, role, status:'running', tools:[] } }
 *   tool_call은 미emit (원본 engine.ts 동작 미러).
 *   서브에이전트 종료(done)는 tool_result id 매칭으로 렌더러가 처리 — 백엔드는 무상태.
 *
 * parent_tool_use_id (메시지 레벨):
 *   서브에이전트가 낸 메시지면 부모 Task의 tool_use id가 들어옴.
 *   해당 메시지의 모든 tool_use/text가 그 서브에이전트 소속.
 *   tool_use → tool_call emit 시 parentToolId 필드 세팅.
 *   parent_tool_use_id가 있는 메시지에서 Task/Agent 도구는 최상위 subagent가 아님
 *     → 일반 tool_call + parentToolId 세팅 처리.
 *
 * ── 알 수 없는 줄 → [] (forward-compatible: 미래 타입 추가 시 조용히 무시)
 */

import type { AgentEvent, TodoItem, TokenUsage } from '../../shared/agent-events'

// ── 헬퍼 함수 ─────────────────────────────────────────────────────────────────

/**
 * 여러 줄 텍스트를 1줄로 정규화하고 max자 cap(원본 engine.ts oneLine 미러).
 * - 연속 공백/줄바꿈 → 단일 스페이스
 * - trim
 * - max 초과 시 (max-1)자 + '…'
 */
function oneLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

/**
 * SDK Todo 상태 → AgentEvent TodoItem 상태 변환.
 * pending   → 'planned'
 * in_progress → 'running'
 * completed / done → 'done'
 */
function todoStatus(s: string): TodoItem['status'] {
  if (s === 'completed' || s === 'done') return 'done'
  if (s === 'in_progress' || s === 'running') return 'running'
  return 'planned'
}

// ── 내부 타입 가드 헬퍼 ────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number'
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v)
}

// ── content 블록 처리 ─────────────────────────────────────────────────────────

/**
 * assistant 메시지의 content 배열을 AgentEvent[]로 변환.
 *
 * Phase 24a 확장:
 * - thinking 블록 → AgentEventThinking (oneLine 90자 cap, 빈 thinking skip)
 * - thinking_clear: thinking emit 후 첫 text 블록 직전에 1회 삽입(메시지 내 로컬 플래그)
 * - TodoWrite tool_use → AgentEventTodos (tool_call 미emit)
 * - 그 외 tool_use → AgentEventToolCall (기존 동작 불변)
 * - text 블록 → AgentEventText (기존 동작 불변, 빈 텍스트 필터링)
 *
 * Phase 24b 확장:
 * - parentToolId?: string — 메시지 레벨 parent_tool_use_id (서브에이전트 소속 메시지면 부모 id)
 * - Task/Agent tool_use + parentToolId 없음(최상위) → AgentEventSubagent (tool_call 미emit)
 * - Task/Agent tool_use + parentToolId 있음(중첩) → 일반 tool_call + parentToolId 세팅
 * - 그 외 tool_use + parentToolId 있음 → tool_call에 parentToolId 세팅
 */
function mapAssistantContent(content: unknown[], parentToolId?: string): AgentEvent[] {
  const events: AgentEvent[] = []
  // 메시지 내 thinking_clear 삽입을 위한 로컬 상태 플래그
  let thinkingEmitted = false  // 이 메시지에서 thinking을 emit했는가
  let thinkingCleared = false  // 이 메시지에서 thinking_clear를 emit했는가

  for (const block of content) {
    if (!isObject(block)) continue
    const blockType = block['type']

    if (blockType === 'thinking') {
      // Phase 24a: extended thinking 블록 처리
      const thinking = block['thinking']
      if (isString(thinking) && thinking.trim().length > 0) {
        events.push({ type: 'thinking', text: oneLine(thinking, 90) })
        thinkingEmitted = true
      }
      // 빈/공백만 thinking은 skip
    } else if (blockType === 'text') {
      const text = block['text']
      if (isString(text) && text.length > 0) {
        // Phase 24a: thinking emit 후 첫 text 직전에 thinking_clear 1회 삽입
        if (thinkingEmitted && !thinkingCleared) {
          events.push({ type: 'thinking_clear' })
          thinkingCleared = true
        }
        events.push({ type: 'text', delta: text })
      }
      // 빈 텍스트 필터링 (스트리밍 중 빈 청크 무시)
    } else if (blockType === 'tool_use') {
      const id = block['id']
      const name = block['name']
      const input = block['input']
      if (isString(id) && isString(name)) {
        // Phase 24a: TodoWrite → todos 이벤트 (tool_call 미emit, parentToolId와 무관)
        if (name === 'TodoWrite') {
          const rawTodos = isObject(input) ? input['todos'] : undefined
          const todosArr = isArray(rawTodos) ? rawTodos : []
          const todos: TodoItem[] = todosArr.map((t, i) => {
            if (!isObject(t)) return { id: String(i + 1), label: '', status: 'planned' as const }
            const rawId = t['id']
            const todoId = isString(rawId) ? rawId : String(i + 1)
            const todoContent = isString(t['content']) ? t['content'] : ''
            const activeForm = isString(t['activeForm']) ? t['activeForm'] : undefined
            const statusRaw = isString(t['status']) ? t['status'] : 'pending'
            const status = todoStatus(statusRaw)
            // in_progress + activeForm 있으면 activeForm 우선
            const label = status === 'running' && activeForm ? activeForm : todoContent
            return { id: todoId, label, status }
          })
          events.push({ type: 'todos', todos })
        } else if ((name === 'Task' || name === 'Agent') && !parentToolId) {
          // Phase 24b: Task/Agent 도구이고 최상위(parentToolId 없음) → subagent 이벤트 emit
          // tool_call 미emit (원본 engine.ts 동작 미러)
          const inp = isObject(input) ? input : {}
          const subagentType = isString(inp['subagent_type']) ? inp['subagent_type'] : undefined
          const description = isString(inp['description']) ? inp['description'] : ''
          events.push({
            type: 'subagent',
            subagent: {
              id,
              name: subagentType ?? 'subagent',
              role: oneLine(description, 40),
              status: 'running',
              tools: []
            }
          })
        } else {
          // 일반 tool_use → tool_call emit
          // Phase 24b: parentToolId가 있으면 세팅(서브에이전트 소속 도구 귀속)
          const toolCallEvent: AgentEvent = {
            type: 'tool_call',
            id,
            name,
            input: input !== undefined ? input : {},
            ...(parentToolId ? { parentToolId } : {})
          }
          events.push(toolCallEvent)
        }
      }
    }
    // 미지원 블록 타입 → 조용히 무시 (forward-compatible)
  }
  return events
}

/**
 * user 메시지의 content 배열을 AgentEvent[]로 변환.
 * tool_result 블록 → AgentEventToolResult.
 */
function mapUserContent(content: unknown[]): AgentEvent[] {
  const events: AgentEvent[] = []
  for (const block of content) {
    if (!isObject(block)) continue
    const blockType = block['type']

    if (blockType === 'tool_result') {
      const id = block['tool_use_id']
      const isError = block['is_error']
      const blockContent = block['content']
      if (isString(id)) {
        events.push({
          type: 'tool_result',
          id,
          // is_error가 true이면 실패, 없거나 false이면 성공
          ok: isError !== true,
          output: blockContent !== undefined ? blockContent : null
        })
      }
    }
    // 미지원 블록 타입 → 조용히 무시
  }
  return events
}

/**
 * usage 객체를 TokenUsage로 변환.
 * 필드명: snake_case → AgentEvent의 camelCase.
 */
function mapUsage(usageRaw: unknown): TokenUsage | undefined {
  if (!isObject(usageRaw)) return undefined
  const inputTokens = usageRaw['input_tokens']
  const outputTokens = usageRaw['output_tokens']
  if (!isNumber(inputTokens) || !isNumber(outputTokens)) return undefined

  const usage: TokenUsage = { inputTokens, outputTokens }

  const cacheCreation = usageRaw['cache_creation_input_tokens']
  if (isNumber(cacheCreation)) usage.cacheCreationTokens = cacheCreation

  const cacheRead = usageRaw['cache_read_input_tokens']
  if (isNumber(cacheRead)) usage.cacheReadTokens = cacheRead

  return usage
}

/**
 * result.modelUsage から最大 contextWindow を取得する.
 * 원본 engine.ts windowFromModelUsage 미러.
 *
 * @param modelUsage Record<string, { contextWindow?: number; ... }>
 * @returns max contextWindow 또는 undefined
 */
function windowFromModelUsage(modelUsage: unknown): number | undefined {
  if (!isObject(modelUsage)) return undefined
  let maxWindow: number | undefined
  for (const key of Object.keys(modelUsage)) {
    const entry = modelUsage[key]
    if (!isObject(entry)) continue
    const cw = entry['contextWindow']
    if (isNumber(cw)) {
      if (maxWindow === undefined || cw > maxWindow) {
        maxWindow = cw
      }
    }
  }
  return maxWindow
}

/**
 * result is_error 기준으로 성공/실패 판정.
 * SDK: is_error=false → 성공, is_error=true → 실패.
 * CLI 구 포맷: subtype='success' → 성공, subtype='error' → 실패.
 */
function isSuccess(obj: Record<string, unknown>): boolean {
  // SDK 기준: is_error 필드가 있으면 우선 사용
  const isError = obj['is_error']
  if (typeof isError === 'boolean') {
    return !isError
  }
  // CLI 구 포맷: subtype으로 판정
  const subtype = obj['subtype']
  return subtype === 'success'
}

/**
 * result 실패 시 에러 메시지 추출.
 */
function extractErrorMessage(obj: Record<string, unknown>): string {
  // SDK: errors 배열
  const errors = obj['errors']
  if (isArray(errors) && errors.length > 0) {
    const msgs = errors.filter(isString)
    if (msgs.length > 0) return msgs.join('; ')
  }
  // CLI 구 포맷: error 단일 문자열
  const error = obj['error']
  if (isString(error) && error.length > 0) return error
  // subtype으로 기본 메시지
  const subtype = obj['subtype']
  if (isString(subtype)) {
    return `Agent execution failed: ${subtype}`
  }
  return 'Unknown error from agent'
}

// ── 공개 API ──────────────────────────────────────────────────────────────────

/**
 * SDK/NDJSON 한 줄(파싱된 객체)을 받아 0개 이상의 AgentEvent로 변환.
 *
 * 이 함수가 엔진 출력 스키마의 단일 진실 공급원이다.
 * 엔진 출력 드리프트 시 이 함수만 수정한다.
 *
 * @param obj JSON.parse() 또는 SDK yield 결과 (unknown 타입으로 받아 내부에서 narrowing)
 * @returns AgentEvent 배열 (0개 이상)
 */
export function mapClaudeStreamLine(obj: unknown): AgentEvent[] {
  if (!isObject(obj)) return []

  const type = obj['type']
  if (!isString(type)) return []

  switch (type) {
    case 'assistant': {
      // assistant 메시지: 텍스트 스트리밍 + tool_use
      const message = obj['message']
      if (!isObject(message)) return []
      const content = message['content']
      if (!isArray(content)) return []
      // Phase 24b: 메시지 레벨 parent_tool_use_id 추출
      // 서브에이전트가 낸 메시지면 부모 Task의 tool_use id가 들어옴.
      // null 또는 미존재면 undefined로 정규화 (최상위 메시지)
      const rawParentId = obj['parent_tool_use_id']
      const parentToolId = isString(rawParentId) ? rawParentId : undefined
      return mapAssistantContent(content, parentToolId)
    }

    case 'user': {
      // user 메시지: tool_result (에이전트가 도구 실행 후 결과 전달)
      const message = obj['message']
      if (!isObject(message)) return []
      const content = message['content']
      if (!isArray(content)) return []
      return mapUserContent(content)
    }

    case 'result': {
      // 최종 완료 이벤트
      // Phase 21b: is_error 기반 판정 (SDK) + subtype 폴백 (CLI 구 포맷)
      if (isSuccess(obj)) {
        const usage = mapUsage(obj['usage'])
        const contextWindow = windowFromModelUsage(obj['modelUsage'])
        const done: AgentEvent = {
          type: 'done',
          ...(usage ? { usage } : {}),
          ...(contextWindow !== undefined ? { contextWindow } : {})
        }
        return [done]
      } else {
        const message = extractErrorMessage(obj)
        return [
          { type: 'error', message },
          { type: 'done' }
        ]
      }
    }

    case 'system': {
      // 초기화 이벤트 — 무시 (소비자에게 노출할 정보 없음)
      // session_id는 ClaudeCodeBackend가 내부적으로 캡처 (이 phase에서는 무시)
      return []
    }

    case 'stream_event': {
      // 부분 메시지 이벤트 — Phase 21b에서 무시 (includePartialMessages=false)
      // 실시간 토큰 스트리밍은 M4-2에서 구현
      return []
    }

    default:
      // 알 수 없는 타입 → 빈 배열 (forward-compatible)
      return []
  }
}
