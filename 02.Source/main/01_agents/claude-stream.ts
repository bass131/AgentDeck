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
 *   CP1 P07 추가: input.name 있으면 subagent.displayName(표시 전용, name=subagent_type
 *     계약 불변) / input.model 있으면 subagent.model 조기 스냅샷(별칭 가능 — 실측
 *     message.model 도착 시 eventNormalizer가 갱신).
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
import { parseOrchestrationMeta } from './orchestration-meta'

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

/**
 * SDK system task_* 메시지 → 엔진중립 orchestration_progress 이벤트 (F-C).
 *
 * 프로브로 규명한 SDK 동작:
 *  - task_started/task_progress/task_updated/task_notification 모두 tool_use_id 운반
 *    (= Workflow tool_use id = orchestration 카드 id) → 카드와 1:1 상관.
 *  - task_progress.workflow_progress: workflow_phase(index,title) + workflow_agent
 *    (label, phaseTitle, state:start|progress|done, tokens, toolCalls, resultPreview).
 *  - task_updated.patch.status / task_notification.status: completed|failed 전이.
 *
 * CRITICAL(ADR-003): 'task_*'·'workflow_*' 엔진 고유 리터럴/필드명은 이 어댑터 내부에만.
 *   emit하는 이벤트는 엔진중립(status/phases/agents).
 * CRITICAL(신뢰경계): 진행 메타만 — output_file 등 파일경로/시크릿 미포함.
 *
 * tool_use_id 없으면 카드 상관 불가 → [] (graceful).
 */
function mapTaskProgress(obj: Record<string, unknown>): AgentEvent[] {
  const id = isString(obj['tool_use_id']) ? obj['tool_use_id'] : ''
  if (!id) return []

  const subtype = isString(obj['subtype']) ? obj['subtype'] : ''

  // 전체 상태 판정 (started/progress=running, notification=status 기반)
  let status: 'running' | 'completed' | 'failed' = 'running'
  if (subtype === 'task_notification') {
    const s = isString(obj['status']) ? obj['status'] : ''
    status = s === 'completed' ? 'completed' : s === 'failed' ? 'failed' : 'running'
  }

  // workflow_progress → phases(단계 제목, index 순) + agents(라벨별 최신 상태)
  const wp = isArray(obj['workflow_progress']) ? obj['workflow_progress'] : []
  const phaseEntries: { index: number; title: string }[] = []
  // label → 최신 진행(배열 후순=최신이므로 overwrite로 dedup)
  const agentMap = new Map<string, {
    label: string; phase?: string; state: 'queued' | 'running' | 'done'
    tokens?: number; toolCalls?: number; resultPreview?: string
  }>()
  for (const entry of wp) {
    if (!isObject(entry)) continue
    const etype = entry['type']
    if (etype === 'workflow_phase') {
      const title = isString(entry['title']) ? entry['title'] : ''
      const index = typeof entry['index'] === 'number' ? entry['index'] : 0
      if (title) phaseEntries.push({ index, title })
    } else if (etype === 'workflow_agent') {
      const label = isString(entry['label']) ? entry['label'] : ''
      if (!label) continue
      const rawState = isString(entry['state']) ? entry['state'] : ''
      const state: 'queued' | 'running' | 'done' =
        rawState === 'done' ? 'done' : rawState === 'queued' ? 'queued' : 'running'
      const agent: { label: string; phase?: string; state: 'queued' | 'running' | 'done'; tokens?: number; toolCalls?: number; resultPreview?: string } = { label, state }
      if (isString(entry['phaseTitle'])) agent.phase = entry['phaseTitle']
      if (typeof entry['tokens'] === 'number') agent.tokens = entry['tokens']
      if (typeof entry['toolCalls'] === 'number') agent.toolCalls = entry['toolCalls']
      if (isString(entry['resultPreview'])) agent.resultPreview = entry['resultPreview']
      agentMap.set(label, agent)   // 같은 label 후순 entry가 최신 → overwrite
    }
  }
  const phases = phaseEntries.sort((a, b) => a.index - b.index).map(p => p.title)
  const agents = [...agentMap.values()]

  const summary = isString(obj['summary']) ? obj['summary'] : ''

  const event: AgentEvent = {
    type: 'orchestration_progress',
    id,
    status,
    ...(summary ? { summary } : {}),
    ...(phases.length ? { phases } : {}),
    ...(agents.length ? { agents } : {}),
  }
  return [event]
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
        // Phase 37 #3: parentToolId 있으면 thinking에도 부여(서브에이전트 transcript 라우팅)
        events.push({
          type: 'thinking',
          text: oneLine(thinking, 90),
          ...(parentToolId ? { parentToolId } : {})
        })
        thinkingEmitted = true
      }
      // 빈/공백만 thinking은 skip
    } else if (blockType === 'text') {
      const text = block['text']
      if (isString(text) && text.trim().length > 0) {
        // Phase 24a: thinking emit 후 첫 text 직전에 thinking_clear 1회 삽입
        if (thinkingEmitted && !thinkingCleared) {
          events.push({ type: 'thinking_clear' })
          thinkingCleared = true
        }
        // Phase 37 #3: parentToolId 있으면 text에도 부여(서브에이전트 transcript 라우팅)
        events.push({ type: 'text', delta: text, ...(parentToolId ? { parentToolId } : {}) })
      }
      // 빈/공백-only 텍스트 필터링 (원본 engine.ts L463 block.text.trim() 미러)
    } else if (blockType === 'tool_use') {
      const id = block['id']
      const name = block['name']
      const input = block['input']
      if (isString(id) && isString(name)) {
        // Phase 24d: AskUserQuestion → tool_call 미emit.
        // 질문은 canUseTool → question_request로만 표면화(원본 engine.ts 동작 미러).
        // TodoWrite · Task/Agent 억제와 동일 패턴 — 순수·무상태 유지.
        if (name === 'AskUserQuestion') {
          // 억제: events에 노출하지 않는다.
          // question_request는 ClaudeCodeBackend._handleAskQuestion()이 push.
        } else if (name === 'Workflow') {
          // Phase 37 #4b: Workflow → 엔진중립 orchestration 이벤트 정규화 (tool_call 억제, Task 패턴 미러)
          // CRITICAL(ADR-003): 'Workflow' 리터럴은 이 분기 조건에만. emit하는 name은 meta.name(중립).
          // P-3: script 내용 미로그 — console/logger 미출력.
          const inp = isObject(input) ? input : {}
          const rawScript = isString(inp['script']) ? inp['script'] : ''
          const meta = parseOrchestrationMeta(rawScript)
          const cappedScript = rawScript.slice(0, 4096)   // S2 cap
          events.push({
            type: 'orchestration',
            id,
            name: meta.name,
            ...(meta.description ? { description: meta.description } : {}),
            ...(meta.phases ? { phases: meta.phases } : {}),
            ...(cappedScript ? { script: cappedScript } : {})
          })
        } else if (name === 'TodoWrite') {
          // Phase 24a: TodoWrite → todos 이벤트 (tool_call 미emit, parentToolId와 무관)
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
          // CP1 P07 ①: SDK AgentInput.name(addressable 이름, sdk-tools.d.ts:434) → displayName.
          // name=subagent_type 계약은 불변(NG-1 결정 유지) — displayName은 표시 전용 additive.
          const inputName = isString(inp['name']) ? inp['name'] : undefined
          // CP1 P07 ②: AgentInput.model(별칭 'sonnet'|'opus'|'haiku'|'fable', sdk-tools.d.ts:426)
          // → 생성 시점 조기 스냅샷(있는 그대로 — 원시 ID 변환/검증 없음). 서브에이전트 자신의
          // 첫 assistant 메시지(message.model, 실측 원시 ID)가 도착하면 eventNormalizer가
          // dedup 로직으로 이 값을 갱신한다(별칭≠원시ID이므로 항상 새 update로 처리됨).
          const inputModel = isString(inp['model']) ? inp['model'] : undefined
          events.push({
            type: 'subagent',
            subagent: {
              id,
              name: subagentType ?? 'subagent',
              role: oneLine(description, 40),
              status: 'running',
              tools: [],
              ...(inputName ? { displayName: inputName } : {}),
              ...(inputModel ? { model: inputModel } : {})
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
      // F-C: task_* 진행 이벤트 → 엔진중립 orchestration_progress 정규화.
      // ADR-003: 'task_' 리터럴은 이 분기 조건에만(어댑터 내부). emit은 중립 이벤트.
      // task_updated는 제외: 실페이로드에 tool_use_id가 없어(task_id만) 카드 상관 불가
      //   + 완료는 tool_use_id를 가진 task_notification이 담당(중복). (프로브 확인)
      const subtype = obj['subtype']
      if (
        subtype === 'task_started' ||
        subtype === 'task_progress' ||
        subtype === 'task_notification'
      ) {
        return mapTaskProgress(obj)
      }
      // 초기화(init) — session_id를 중립 session 이벤트로 표면화 (Phase 1 맥락 복구).
      // 다음 턴이 resumeSessionId로 되돌려 보내면 backend가 resume 옵션으로 매핑(어댑터 내부).
      // ADR-003: sessionId는 불투명 토큰(엔진 고유 형상 아님) — 중립 표면화 정합.
      if (subtype === 'init') {
        const sid = obj['session_id']
        if (typeof sid === 'string' && sid.length > 0) {
          return [{ type: 'session', sessionId: sid }]
        }
        return []
      }
      // 그 외 system — 무시 (소비자에게 노출할 정보 없음)
      return []
    }

    case 'stream_event': {
      // Phase 33 M5: content_block_delta text_delta → text 이벤트 (원본 engine.ts L417-420 미러)
      // 그 외 서브타입(content_block_start/stop·thinking_delta·input_json_delta) → [] (무시)
      // 무상태 순수: 상태 없음 — 같은 입력 같은 출력.
      const ev = obj['event']
      if (
        isObject(ev) &&
        ev['type'] === 'content_block_delta'
      ) {
        const delta = ev['delta']
        if (
          isObject(delta) &&
          delta['type'] === 'text_delta' &&
          isString(delta['text']) &&
          delta['text'].length > 0
        ) {
          // text_delta: 텍스트 증분 → text 이벤트 (messageId는 펌프 후처리로 부여)
          return [{ type: 'text', delta: delta['text'] }]
        }
      }
      // content_block_start/stop, thinking_delta, input_json_delta → []
      return []
    }

    default:
      // 알 수 없는 타입 → 빈 배열 (forward-compatible)
      return []
  }
}
