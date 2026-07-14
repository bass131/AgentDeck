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
 *      tool_use_result?: unknown,   // GAP1 P08: top-level 구조화 도구 출력(sdk.d.ts:4297)
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
 *    GAP1 P08: tool_use_result가 Grep(GrepOutput, sdk-tools.d.ts:2862 — mode 필수는 아니나
 *    3모드 리터럴)·Glob(GlobOutput, sdk-tools.d.ts:2836 — mode 없음, durationMs+truncated+
 *    filenames 형상) 출력이면 기존 tool_result 이벤트 **뒤에** 엔진 중립 search_result를
 *    추가 방출. 판별은 보수적 — 애매하면 무방출(renderer가 raw 폴백 담당).
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
 * 5. stream_event (partial message, GAP1 P06 갱신):
 *    { type: "stream_event"; ... }
 *    실옵션(sdkOptions.ts:239 includePartialMessages:true)이므로 이 스트림은 실제로 흐른다
 *    (stale 표기였던 "false이므로 yield 없음"은 오판이었음 — 후속 작업자 주의).
 *    content_block_delta.delta.type==='text_delta' → AgentEventText(delta)
 *    content_block_delta.delta.type==='thinking_delta' → AgentEventThinkingDelta(text)
 *    그 외(content_block_start/stop·input_json_delta 등)는 무시([]).
 *
 * ── Phase 24a 추가 (GAP1 P06: 90자 oneLine 요약 → 전문 보존으로 전환) ─────────────
 *
 * thinking 블록:
 *   { type: "thinking"; thinking: string }
 *   → AgentEventThinking { type: 'thinking'; text: thinking.trim() }  (전문 보존, cap 없음)
 *   빈/공백-only thinking은 skip.
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

import type { AgentEvent, AgentEventBgTaskPatch, SearchResultMatch, TodoItem, TokenUsage } from '../../shared/agent-events'
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

/**
 * SDK system task_* 메시지 → 엔진중립 `bg_task` 생명주기 이벤트 (GAP1 P09).
 *
 * 기존 mapTaskProgress(orchestration_progress)와 **이중 방출** — 대체가 아니라 병행이다
 * (F-C orchestration-stream 회귀 대조군 보존). orchestration_progress는 Workflow 카드
 * 상관용(tool_use_id 필수), bg_task는 백그라운드 태스크 생명주기용(task_id가 정본 키).
 *
 * 매핑 표(probe④ 실측 — 99.Others/tests/fixtures/gap1-p03/probe-4-bg-bash.jsonl):
 *  - task_started      → { kind:'started', taskId, toolUseId?, taskType?, description? }
 *  - task_updated      → { kind:'updated', taskId, patch:{ status?, endTime? } }
 *                        ⚠ toolUseId 합성 금지 — SDK 선언(SDKTaskUpdatedMessage)에 없음.
 *  - task_notification → { kind:'notification', taskId, toolUseId?, status?, outputFile?, summary? }
 *  - task_progress     → [] (bg_task kind 유니온에 없음 — orchestration_progress만 담당)
 *  - kind:'output'은 SDK 메시지가 아니라 main 측 파일 폴링(bgTaskTail.ts)이 합성한다.
 *
 * CRITICAL(ADR-003): 'task_*'·snake_case 필드명(end_time/output_file)은 이 함수 내부에만.
 * CRITICAL(qa 골든 핀): taskId↔toolUseId 상관은 task_started가 운반 — user tool_result의
 *   content 문자열에서 taskId를 추출해 bg_task를 합성하지 않는다(decoy 대조군 존재).
 *
 * task_id 없으면(비정상 페이로드) [] (graceful).
 */
function mapBgTask(obj: Record<string, unknown>): AgentEvent[] {
  const taskId = obj['task_id']
  if (!isString(taskId) || taskId.length === 0) return []
  const subtype = obj['subtype']
  const toolUseId = obj['tool_use_id']

  if (subtype === 'task_started') {
    const taskType = obj['task_type']
    const description = obj['description']
    return [{
      type: 'bg_task',
      kind: 'started',
      taskId,
      ...(isString(toolUseId) ? { toolUseId } : {}),
      ...(taskType === 'local_bash' || taskType === 'local_agent' || taskType === 'local_workflow'
        ? { taskType }
        : {}),
      ...(isString(description) ? { description } : {}),
    }]
  }

  if (subtype === 'task_updated') {
    // 최소 patch만 — snake(end_time) → camel(endTime). toolUseId는 절대 합성하지 않는다.
    const rawPatch = obj['patch']
    let patch: AgentEventBgTaskPatch | undefined
    if (isObject(rawPatch)) {
      const status = rawPatch['status']
      const endTime = rawPatch['end_time']
      patch = {
        ...(isString(status) ? { status } : {}),
        ...(isNumber(endTime) ? { endTime } : {}),
      }
    }
    return [{
      type: 'bg_task',
      kind: 'updated',
      taskId,
      ...(patch !== undefined ? { patch } : {}),
    }]
  }

  if (subtype === 'task_notification') {
    const status = obj['status']
    const outputFile = obj['output_file']
    const summary = obj['summary']
    return [{
      type: 'bg_task',
      kind: 'notification',
      taskId,
      ...(isString(toolUseId) ? { toolUseId } : {}),
      ...(isString(status) ? { status } : {}),
      ...(isString(outputFile) ? { outputFile } : {}),
      ...(isString(summary) ? { summary } : {}),
    }]
  }

  // task_progress 등 그 외 subtype — bg_task 미방출(orchestration_progress 소관).
  return []
}

// ── 권한 모드 역매핑 (GAP1 P13) ────────────────────────────────────────────────

/**
 * SDK PermissionMode → picker id 역매핑 — status.permissionMode 관찰 방출 전용.
 *
 * SDK PermissionMode 도메인(sdk.d.ts:2039) 중 'dontAsk'는 의도적으로 없다 — picker 어휘
 * 밖(라이브 전환 화이트리스트 밖)이라 미방출(계약 핀: 매핑 불가 값·필드 부재 = 미방출).
 * 'bypassPermissions'→'bypass'는 방출한다 — 세션이 bypass로 *생성*됐을 수 있고(세션 생성
 * 경로는 허용 어휘), 배지 동기화엔 현재 상태 표면화가 필요하다.
 *
 * 순매핑(picker→SDK, 라이브 전환 위임)은 claudeAgentRun.ts LIVE_MODE_PICKER_TO_SDK —
 * 쌍으로 유지한다. ADR-003: SDK 모드 리터럴은 어댑터 내부(이 상수)에만.
 */
const SDK_MODE_TO_PICKER: Record<string, string> = {
  default: 'normal',
  plan: 'plan',
  acceptEdits: 'acceptEdits',
  auto: 'auto',
  bypassPermissions: 'bypass',
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
 * Phase 24a 확장(GAP1 P06 갱신, GAP1 P06 경계교정):
 * - thinking 블록 → AgentEventThinking (빈/공백-only thinking skip)
 *   - parentToolId 없음(메인 스트림) → 전문 보존(cap 없음, renderer 접이식 전문 블록)
 *   - parentToolId 있음(서브에이전트) → oneLine 90cap 요약(SubAgentFullscreen 요약 라인)
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
      // Phase 24a(GAP1 P06 갱신, GAP1 P06 경계교정): extended thinking 블록 처리
      // - parentToolId 없음(메인 스트림) → 전문 보존(cap 없음, renderer 접이식 전문 블록)
      // - parentToolId 있음(서브에이전트) → oneLine 90cap 요약(SubAgentFullscreen 요약 라인, P06 이전 동작 복원)
      const thinking = block['thinking']
      if (isString(thinking) && thinking.trim().length > 0) {
        const text = parentToolId ? oneLine(thinking, 90) : thinking.trim()
        // Phase 37 #3: parentToolId 있으면 thinking에도 부여(서브에이전트 transcript 라우팅)
        events.push({
          type: 'thinking',
          text,
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
          // GAP1 P09: 백그라운드 실행 플래그 → 엔진중립 background:true 미러.
          //   엔진 고유 필드명 'run_in_background'(Claude Bash 도구 입력)은 이 줄에만
          //   격리(ADR-003) — 소비자(renderer 배지)는 background 필드만 본다.
          //   플래그 부재/false → 키 자체 미지정(포그라운드 기존 렌더 회귀 0).
          const isBackground = isObject(input) && input['run_in_background'] === true
          const toolCallEvent: AgentEvent = {
            type: 'tool_call',
            id,
            name,
            input: input !== undefined ? input : {},
            ...(parentToolId ? { parentToolId } : {}),
            ...(isBackground ? { background: true } : {})
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
 * Grep content 모드의 원문 텍스트 블록을 매치 리스트로 파싱 (GAP1 P08).
 *
 * 줄 형식: `경로:라인번호:텍스트` (1-based line).
 * - 라인번호 그룹(`:\d+:`)을 기준으로 분리 — lazy `.+?`가 **첫 번째** `:숫자:` 경계에서
 *   멈추므로 Windows 드라이브 콜론(`C:\Dev\x.ts` — 콜론 뒤가 `\`라 숫자 아님)은 path에
 *   보존되고, 텍스트 내 콜론(`http://localhost:3000` — 숫자 뒤가 `:`가 아님)은 text에
 *   그대로 남는다.
 * - 컨텍스트 구분줄 `--`·빈 줄·형식 불일치 줄은 skip (파싱 실패 = 조용히 건너뜀,
 *   렌더 오염 방지 — 폴백은 renderer raw 담당).
 */
function parseGrepContentMatches(content: string): SearchResultMatch[] {
  const matches: SearchResultMatch[] = []
  for (const rawLine of content.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed === '--') continue
    const m = /^(.+?):(\d+):(.*)$/.exec(line)
    if (!m) continue
    matches.push({ path: m[1], line: Number.parseInt(m[2], 10), text: m[3] })
  }
  return matches
}

/**
 * top-level tool_use_result(unknown) → 엔진 중립 search_result 이벤트 (GAP1 P08, CORE-02).
 *
 * 형상 판별(보수적 — 애매하면 [] 무방출, renderer raw 폴백):
 * - Grep(GrepOutput, sdk-tools.d.ts:2862): mode ∈ {content, files_with_matches, count}
 *   + filenames 배열 + numFiles 숫자.
 *   - content            : content 문자열 파싱 → matches + files(매치 경로 unique·등장순)
 *                          + total(numMatches 우선, 없으면 파싱 매치 수).
 *                          파싱 path가 filenames(실제 매치 파일 목록 정본)에 없으면 오파싱
 *                          (라인번호 없는 출력의 `:숫자:` 우연 매치)으로 간주해 드롭(P15 S6b).
 *                          **유효 매치 0이면 무방출**(빈 search_result로 렌더 오염 금지).
 *   - files_with_matches : files=filenames · total=numFiles.
 *   - count              : files=filenames · total=numMatches 우선(없으면 numFiles).
 *                          content(`경로:건수` 형식)는 매치 라인이 아니므로 **미파싱**.
 * - Glob(GlobOutput, sdk-tools.d.ts:2836): mode 필드 없음 — durationMs 숫자 + truncated
 *   불리언 + filenames 배열 + numFiles 숫자 형상으로 판별. total=totalMatches 우선(없으면
 *   numFiles) · truncated는 false여도 passthrough.
 * - 그 외(파일편집 {filename,patch}·문자열 등) → [] 무방출.
 *
 * @param raw       obj['tool_use_result'] (sdk.d.ts:4297 unknown)
 * @param toolUseId 같은 메시지 content의 tool_result 블록 tool_use_id (카드 상관용)
 */
function mapToolUseSearchResult(raw: unknown, toolUseId: string | undefined): AgentEvent[] {
  if (!isObject(raw)) return []
  const filenamesRaw = raw['filenames']
  const numFiles = raw['numFiles']
  if (!isArray(filenamesRaw) || !isNumber(numFiles)) return []
  const filenames = filenamesRaw.filter(isString)
  const mode = raw['mode']
  const numMatches = raw['numMatches']

  if (mode === 'content') {
    const content = raw['content']
    const parsed = isString(content) ? parseGrepContentMatches(content) : []
    // GAP1 P15 S6b: `-n:false`(라인번호 없는) 출력은 `경로:텍스트` 형식이라 텍스트 내
    // `:숫자:` 우연 매치(포트번호·시각 등)가 존재하지 않는 경로의 매치를 합성할 수 있다.
    // filenames가 실제 매치 파일 목록 정본이므로 대조해 미포함 path 매치는 드롭한다.
    const filenameSet = new Set(filenames)
    const matches = parsed.filter((m) => filenameSet.has(m.path))
    if (matches.length === 0) return []
    const files: string[] = []
    for (const m of matches) {
      if (!files.includes(m.path)) files.push(m.path)
    }
    return [{
      type: 'search_result',
      ...(toolUseId ? { toolUseId } : {}),
      mode: 'content',
      matches,
      files,
      total: isNumber(numMatches) ? numMatches : matches.length
    }]
  }

  if (mode === 'files_with_matches' || mode === 'count') {
    return [{
      type: 'search_result',
      ...(toolUseId ? { toolUseId } : {}),
      mode,
      files: filenames,
      total: mode === 'count' && isNumber(numMatches) ? numMatches : numFiles
    }]
  }

  // Glob: mode 필드 자체가 없어야 함(미지의 mode 값은 미래 Grep 확장일 수 있어 무방출)
  const truncated = raw['truncated']
  if (mode === undefined && isNumber(raw['durationMs']) && typeof truncated === 'boolean') {
    const totalMatches = raw['totalMatches']
    return [{
      type: 'search_result',
      ...(toolUseId ? { toolUseId } : {}),
      mode: 'glob',
      files: filenames,
      total: isNumber(totalMatches) ? totalMatches : numFiles,
      truncated
    }]
  }

  return []
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
      // GAP1 P04 (S-13): resume replay 가드 — SDKUserMessageReplay(sdk.d.ts:4334)는
      // top-level isReplay:true로 표식된다. resume이 과거 tool_result를 다시 흘릴 때
      // 가드 없이 mapUserContent로 흘려보내면 이미 트랜스크립트에 있는 tool_result가
      // 중복 재방출된다 → 재방출 억제([]). isReplay 없는(또는 true가 아닌) 일반 user는
      // 기존대로 tool_result를 emit(대조군 불변).
      if (obj['isReplay'] === true) {
        return []
      }
      // user 메시지: tool_result (에이전트가 도구 실행 후 결과 전달)
      const message = obj['message']
      if (!isObject(message)) return []
      const content = message['content']
      if (!isArray(content)) return []
      const events = mapUserContent(content)
      // GAP1 P08: top-level tool_use_result(sdk.d.ts:4297)가 Grep/Glob 형상이면
      // 기존 tool_result 이벤트 **뒤에** search_result 추가 방출(순서 고정).
      // toolUseId = 같은 메시지 content의 tool_result 블록 tool_use_id(첫 블록).
      let toolUseId: string | undefined
      for (const e of events) {
        if (e.type === 'tool_result') {
          toolUseId = e.id
          break
        }
      }
      return [...events, ...mapToolUseSearchResult(obj['tool_use_result'], toolUseId)]
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
      // task_updated는 orchestration_progress에서 제외: 실페이로드에 tool_use_id가 없어
      //   (task_id만) 카드 상관 불가 + 완료는 tool_use_id를 가진 task_notification이
      //   담당(중복). (프로브 확인, T4 계약)
      // GAP1 P09: started/notification은 bg_task 생명주기 이벤트를 **추가로** 이중 방출
      //   (기존 orchestration_progress 유지 — F-C 회귀 대조군 보존). task_updated는
      //   orchestration_progress 없이 bg_task만(taskId가 상관 키).
      const subtype = obj['subtype']
      if (
        subtype === 'task_started' ||
        subtype === 'task_progress' ||
        subtype === 'task_notification'
      ) {
        return [...mapTaskProgress(obj), ...mapBgTask(obj)]
      }
      if (subtype === 'task_updated') {
        return mapBgTask(obj)
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
      // GAP1 P04 (S-05): SDK 실행 상태 변화 — SDKSessionStateChangedMessage(sdk.d.ts:4102).
      // env 옵트인(CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1, sdkOptions.ts) 시에만 방출된다
      // (probe②b 실측). state는 SDK 선언 도메인 그대로 표면화 — 리터럴 외 값은 조용히 드롭.
      if (subtype === 'session_state_changed') {
        const state = obj['state']
        if (state === 'idle' || state === 'running' || state === 'requires_action') {
          return [{ type: 'session_state', state }]
        }
        return []
      }
      // GAP1 P04 (S-02): API 요청 재시도 인디케이터 — SDKAPIRetryMessage(sdk.d.ts:2750).
      // snake_case(SDK 원시) → camelCase(계약) 매핑. error_status는 계약에 없어 드롭,
      // error(사유 문자열)만 있으면 전달.
      if (subtype === 'api_retry') {
        const attempt = obj['attempt']
        const maxRetries = obj['max_retries']
        const retryDelayMs = obj['retry_delay_ms']
        const error = obj['error']
        if (isNumber(attempt) && isNumber(maxRetries) && isNumber(retryDelayMs)) {
          const event: AgentEvent = {
            type: 'api_retry',
            attempt,
            maxRetries,
            retryDelayMs,
            ...(isString(error) ? { error } : {})
          }
          return [event]
        }
        return []
      }
      // GAP1 P04 (S-01): 컴팩션 경계 — SDKCompactBoundaryMessage(sdk.d.ts:2822).
      // post_tokens는 SDK 선언상 optional — 없으면 postTokens 키 자체를 만들지 않는다.
      if (subtype === 'compact_boundary') {
        const meta = obj['compact_metadata']
        if (isObject(meta)) {
          const trigger = meta['trigger']
          const preTokens = meta['pre_tokens']
          const postTokens = meta['post_tokens']
          if ((trigger === 'auto' || trigger === 'manual') && isNumber(preTokens)) {
            const event: AgentEvent = {
              type: 'compact',
              kind: 'boundary',
              trigger,
              preTokens,
              ...(isNumber(postTokens) ? { postTokens } : {})
            }
            return [event]
          }
        }
        return []
      }
      // GAP1 P04 (S-01): API 요청/압축 진행 상태 — SDKStatusMessage(sdk.d.ts:4130,
      // SDKStatus:4128). 'requesting'은 API 왕복 진행(압축과 무관)이라 'compacting'과
      // 붕괴시키지 않고 별개 값으로 그대로 전달. status===null(진행 해제)도 그대로
      // 전달해 소비측이 clear할 수 있게 한다.
      // GAP1 P13: 같은 status 메시지의 optional `permissionMode` 필드(sdk.d.ts:4133)를
      // 관찰하면 엔진중립 permission_mode 이벤트를 **병행 방출**한다(기존 compact
      // (kind:'status') 정규화의 대체가 아님 — qa 대조군 핀). SDK→picker 역매핑 불가
      // 값('dontAsk' 등)·필드 부재는 미방출.
      if (subtype === 'status') {
        const events: AgentEvent[] = []
        const status = obj['status']
        if (status === 'compacting' || status === 'requesting' || status === null) {
          events.push({ type: 'compact', kind: 'status', status })
        }
        const permissionMode = obj['permissionMode']
        const pickerId = isString(permissionMode) ? SDK_MODE_TO_PICKER[permissionMode] : undefined
        if (pickerId !== undefined) {
          events.push({ type: 'permission_mode', mode: pickerId })
        }
        return events
      }
      // GAP1 P05 (S-04): 훅 생명주기 — SDKHookStartedMessage(sdk.d.ts:3682). ADR-003 엔진중립:
      // SDK가 별도 메시지로 쪼개 보내는 started를 공통 hook_lifecycle의 phase 판별값으로 흡수.
      if (subtype === 'hook_started') {
        const hookId = obj['hook_id']
        const hookName = obj['hook_name']
        const hookEvent = obj['hook_event']
        if (isString(hookId) && isString(hookName) && isString(hookEvent)) {
          return [{ type: 'hook_lifecycle', phase: 'started', hookId, hookName, hookEvent }]
        }
        return []
      }
      // GAP1 P05 (S-04): 훅 생명주기 응답 — SDKHookResponseMessage(sdk.d.ts:3667). ADR-003
      // 엔진중립: exitCode/outcome/stdout/stderr/output은 isNumber/isString 가드로만 판정 —
      // 빈 문자열('')·0도 유효값이라 truthiness가 아닌 존재-타입 가드로 충실 매핑한다.
      if (subtype === 'hook_response') {
        const hookId = obj['hook_id']
        const hookName = obj['hook_name']
        const hookEvent = obj['hook_event']
        if (isString(hookId) && isString(hookName) && isString(hookEvent)) {
          const exitCode = obj['exit_code']
          const outcome = obj['outcome']
          const stdout = obj['stdout']
          const stderr = obj['stderr']
          const output = obj['output']
          const event: AgentEvent = {
            type: 'hook_lifecycle',
            phase: 'response',
            hookId,
            hookName,
            hookEvent,
            ...(isNumber(exitCode) ? { exitCode } : {}),
            ...(outcome === 'success' || outcome === 'error' || outcome === 'cancelled' ? { outcome } : {}),
            ...(isString(stdout) ? { stdout } : {}),
            ...(isString(stderr) ? { stderr } : {}),
            ...(isString(output) ? { output } : {})
          }
          return [event]
        }
        return []
      }
      // GAP1 P05 (S-04): 훅 생명주기 진행 — SDKHookProgressMessage(sdk.d.ts:3654, 예약 —
      // probe①에서 0건 관측됐으나 SDK 타입 선언은 존재). ADR-003 엔진중립: response와 동일
      // 필드셋 가드(hookId/hookName/hookEvent 필수, stdout/stderr/output은 isString 가드).
      if (subtype === 'hook_progress') {
        const hookId = obj['hook_id']
        const hookName = obj['hook_name']
        const hookEvent = obj['hook_event']
        if (isString(hookId) && isString(hookName) && isString(hookEvent)) {
          const stdout = obj['stdout']
          const stderr = obj['stderr']
          const output = obj['output']
          const event: AgentEvent = {
            type: 'hook_lifecycle',
            phase: 'progress',
            hookId,
            hookName,
            hookEvent,
            ...(isString(stdout) ? { stdout } : {}),
            ...(isString(stderr) ? { stderr } : {}),
            ...(isString(output) ? { output } : {})
          }
          return [event]
        }
        return []
      }
      // GAP1 P05 (S-03): 일반 정보성 배너 — SDKInformationalMessage(sdk.d.ts:3695). ADR-003
      // 엔진중립: level은 계약 리터럴 화이트리스트 밖 값('bogus' 등)이면 조용히 드롭
      // (forward-compatible — 미래 SDK level 확장 시 앱이 죽지 않게).
      if (subtype === 'informational') {
        const content = obj['content']
        const level = obj['level']
        if (
          isString(content) &&
          (level === 'info' || level === 'notice' || level === 'suggestion' || level === 'warning')
        ) {
          const toolUseId = obj['tool_use_id']
          const preventContinuation = obj['prevent_continuation']
          const event: AgentEvent = {
            type: 'informational',
            content,
            level,
            ...(isString(toolUseId) ? { toolUseId } : {}),
            ...(preventContinuation === true ? { preventContinuation: true } : {})
          }
          return [event]
        }
        return []
      }
      // GAP1 P05 (S-07): 자동 거부된 도구 호출 통지 — SDKPermissionDeniedMessage(sdk.d.ts:3902).
      // ADR-003 엔진중립: message/tool_use_id/agent_id는 계약(agent-events.ts)에 없는 필드라
      // 의도적으로 미매핑 — decisionReasonType/decisionReason만 isString 가드로 충실 전달.
      if (subtype === 'permission_denied') {
        const toolName = obj['tool_name']
        if (isString(toolName)) {
          const decisionReasonType = obj['decision_reason_type']
          const decisionReason = obj['decision_reason']
          const event: AgentEvent = {
            type: 'permission_denied',
            toolName,
            ...(isString(decisionReasonType) ? { decisionReasonType } : {}),
            ...(isString(decisionReason) ? { decisionReason } : {})
          }
          return [event]
        }
        return []
      }
      // GAP1 P06 (S-09): redacted-thinking 구간의 라이브 토큰 진행률 —
      // SDKThinkingTokensMessage(claude-agent-sdk sdk.d.ts:4263). estimated_tokens=
      // 러닝토탈(스피너용 근사, 정산된 output_tokens 아님) 사용 — 계약은 러닝토탈만 쓴다
      // (estimated_tokens_delta는 agent-events.ts 계약에 없어 의도적으로 미매핑).
      if (subtype === 'thinking_tokens') {
        const estimatedTokens = obj['estimated_tokens']
        if (isNumber(estimatedTokens)) {
          return [{ type: 'thinking_delta', estimatedTokens }]
        }
        return []
      }
      // 그 외 system — 무시 (소비자에게 노출할 정보 없음)
      return []
    }

    case 'stream_event': {
      // Phase 33 M5 + GAP1 P06(S-09): content_block_delta → text_delta/thinking_delta 정규화
      // (text_delta는 원본 engine.ts L417-420 미러, thinking_delta는 P06 신설)
      // 그 외 서브타입(content_block_start/stop·input_json_delta) → [] (무시)
      // 무상태 순수: 상태 없음 — 같은 입력 같은 출력.
      const ev = obj['event']
      if (
        isObject(ev) &&
        ev['type'] === 'content_block_delta'
      ) {
        const delta = ev['delta']
        if (isObject(delta)) {
          if (
            delta['type'] === 'text_delta' &&
            isString(delta['text']) &&
            delta['text'].length > 0
          ) {
            // text_delta: 텍스트 증분 → text 이벤트 (messageId는 펌프 후처리로 부여)
            return [{ type: 'text', delta: delta['text'] }]
          }
          if (
            delta['type'] === 'thinking_delta' &&
            isString(delta['thinking']) &&
            delta['thinking'].length > 0
          ) {
            // GAP1 P06 (S-09): 사고 전문 라이브 증분 → thinking_delta 이벤트(text 필드)
            // @anthropic-ai/sdk messages.d.ts:1178 ThinkingDelta{thinking,type} — 필드는
            // delta.thinking(text 아님). 빈 증분은 skip(text_delta 빈 문자열 skip과 동일 관례).
            return [{ type: 'thinking_delta', text: delta['thinking'] }]
          }
        }
      }
      // content_block_start/stop, input_json_delta, 빈 delta → []
      return []
    }

    default:
      // 알 수 없는 타입 → 빈 배열 (forward-compatible)
      return []
  }
}
