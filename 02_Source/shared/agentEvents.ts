/**
 * agentEvents.ts — 공통 AgentEvent discriminated union (단일 진실 공급원, 배럴)
 *
 * ARCHITECTURE.md "백엔드 추상화" 섹션 정의대로 타입화.
 * 모든 엔진 어댑터(ClaudeCodeBackend / CodexBackend)는 고유 출력을
 * 이 AgentEvent로 정규화하여 내보낸다.
 *
 * 구조 (RS1 P03 분할 — `ipcContract.ts`가 `ipc/<도메인>.ts`에 대해 세운 선례와 동일):
 *   - 주제별 정의는 `02_Source/shared/agentEvents/<주제>.ts` 에 둔다
 *       core.ts         — 코어 스트리밍(text/tool_call/tool_result/file_changed/
 *                          thinking/thinking_clear/done/error) + TokenUsage · DiffLine
 *       orchestration.ts— 오케스트레이션 카드(orchestration/_progress/_denied)
 *       subagent.ts     — 서브에이전트 카드 + 작업목록(subagent/todos)
 *       interaction.ts  — 양방향 요청(permission_request/question_request) +
 *                          model-fallback · permission_mode
 *       repl.ts         — REPL 지속세션·자율반복(session/loops/autonomy_status)
 *       sdkLifecycle.ts — SDK 생명주기·관측(hook_lifecycle/informational/
 *                          permission_denied/api_retry/compact/session_state/
 *                          thinking_delta/bg_task/search_result)
 *   - 이 파일(배럴)이 전부 re-export → 소비처 import 경로 변경 0
 *   - AgentEvent union 은 여기서 합성 → 단일 union 보존
 *     (`ipcContract.ts`의 IPC_CHANNELS spread 합성과 같은 역할)
 *
 * ⚠️ `agentEvents/` 디렉토리에 `index.ts`를 두지 않는다 — 두면 `./agentEvents`
 *    해석이 파일(이 배럴)과 디렉토리 사이에서 모호해진다. 진입점은 이 파일 하나뿐.
 *
 * 변경 주의: backend-contract 깃발 — agent-backend·renderer·qa 정합 동반.
 * `any` 사용 금지.
 */

// ── 주제별 타입 re-export (하위 호환 — 소비처가 이 경로로 import) ──────────────
export type { DiffLine, TokenUsage } from './agentEvents/core'
export type {
  AgentEventText,
  AgentEventToolCall,
  AgentEventToolResult,
  AgentEventFileChanged,
  AgentEventThinking,
  AgentEventThinkingClear,
  AgentEventDone,
  AgentEventError,
} from './agentEvents/core'

export type {
  AgentEventOrchestration,
  OrchestrationAgentProgress,
  AgentEventOrchestrationProgress,
  OrchestrationDeniedReason,
  AgentEventOrchestrationDenied,
} from './agentEvents/orchestration'

export type {
  SubAgentTranscriptItem,
  SubAgentTool,
  SubAgentInfo,
  AgentEventSubagent,
  TodoItem,
  AgentEventTodos,
} from './agentEvents/subagent'

export type {
  PlanReviewAllowedPrompt,
  PlanReviewPayload,
  AgentEventPermissionRequest,
  QuestionOption,
  AgentQuestion,
  AgentEventQuestionRequest,
  AgentEventModelFallback,
  AgentEventPermissionMode,
} from './agentEvents/interaction'

export type {
  AgentEventSession,
  LoopInfo,
  AgentEventLoops,
  AutonomyEndedReason,
  AgentEventAutonomyStatus,
} from './agentEvents/repl'

export type {
  AgentEventHookLifecycle,
  AgentEventInformational,
  AgentEventPermissionDenied,
  AgentEventApiRetry,
  AgentEventCompact,
  AgentEventSessionState,
  AgentEventThinkingDelta,
  AgentEventBgTaskPatch,
  AgentEventBgTask,
  SearchResultMatch,
  AgentEventSearchResult,
} from './agentEvents/sdkLifecycle'

// ── AgentEvent union 합성 (단일 union 보존) ───────────────────────────────────

import type {
  AgentEventText,
  AgentEventToolCall,
  AgentEventToolResult,
  AgentEventFileChanged,
  AgentEventThinking,
  AgentEventThinkingClear,
  AgentEventDone,
  AgentEventError,
} from './agentEvents/core'
import type {
  AgentEventOrchestration,
  AgentEventOrchestrationProgress,
  AgentEventOrchestrationDenied,
} from './agentEvents/orchestration'
import type { AgentEventSubagent, AgentEventTodos } from './agentEvents/subagent'
import type {
  AgentEventPermissionRequest,
  AgentEventPermissionMode,
  AgentEventQuestionRequest,
  AgentEventModelFallback,
} from './agentEvents/interaction'
import type {
  AgentEventSession,
  AgentEventLoops,
  AgentEventAutonomyStatus,
} from './agentEvents/repl'
import type {
  AgentEventHookLifecycle,
  AgentEventInformational,
  AgentEventPermissionDenied,
  AgentEventApiRetry,
  AgentEventCompact,
  AgentEventSessionState,
  AgentEventThinkingDelta,
  AgentEventBgTask,
  AgentEventSearchResult,
} from './agentEvents/sdkLifecycle'

/**
 * 공통 AgentEvent — 모든 엔진 어댑터의 출력 정규화 단위.
 *
 * discriminated union (`type` 필드로 narrowing).
 * UI·영속화·IPC 핸들러는 이 타입만 참조하며 구체 엔진을 모른다.
 */
export type AgentEvent =
  | AgentEventText
  | AgentEventToolCall
  | AgentEventToolResult
  | AgentEventFileChanged
  | AgentEventThinking
  | AgentEventThinkingClear
  | AgentEventTodos
  | AgentEventSubagent
  | AgentEventOrchestration
  | AgentEventOrchestrationProgress
  | AgentEventOrchestrationDenied
  | AgentEventPermissionRequest
  | AgentEventPermissionMode
  | AgentEventQuestionRequest
  | AgentEventModelFallback
  | AgentEventSession
  | AgentEventLoops
  | AgentEventDone
  | AgentEventAutonomyStatus
  | AgentEventHookLifecycle
  | AgentEventInformational
  | AgentEventPermissionDenied
  | AgentEventApiRetry
  | AgentEventCompact
  | AgentEventSessionState
  | AgentEventThinkingDelta
  | AgentEventBgTask
  | AgentEventSearchResult
  | AgentEventError
