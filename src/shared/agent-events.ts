/**
 * agent-events.ts — 공통 AgentEvent discriminated union (단일 진실 공급원)
 *
 * ARCHITECTURE.md "백엔드 추상화" 섹션 정의대로 타입화.
 * 모든 엔진 어댑터(ClaudeCodeBackend / CodexBackend)는 고유 출력을
 * 이 AgentEvent로 정규화하여 내보낸다.
 *
 * 변경 주의: backend-contract 깃발 — agent-backend·renderer·qa 정합 동반.
 * `any` 사용 금지.
 */

import type { DiffLine } from './diff-types'
// DiffLine 소비처(renderer 등)가 agent-events에서 직접 import할 수 있도록 re-export.
export type { DiffLine }

// ── 토큰 사용량 ──────────────────────────────────────────────────────────────

/** 엔진이 보고하는 토큰 소비 정보 (done 이벤트에 포함, optional). */
export interface TokenUsage {
  /** 입력(프롬프트) 토큰 수 */
  inputTokens: number
  /** 출력(생성) 토큰 수 */
  outputTokens: number
  /** 캐시 생성 토큰(지원 엔진만, optional) */
  cacheCreationTokens?: number
  /** 캐시 읽기 토큰(지원 엔진만, optional) */
  cacheReadTokens?: number
}

// ── AgentEvent discriminated union ───────────────────────────────────────────

/** 에이전트가 텍스트 조각을 스트리밍 출력 */
export interface AgentEventText {
  type: 'text'
  /** 스트리밍 텍스트 증분 */
  delta: string
  /**
   * 텍스트 블록 경계 식별자 (Phase A — 턴별 인터리브).
   *
   * 같은 messageId의 연속 text는 한 assistant 메시지 버블로 누적,
   * 다른 messageId(또는 사이에 tool_call 발생 → 새 블록)는 새 버블로 분리된다.
   * 이게 text→toolgroup→text 시간순 인터리브의 분리 키.
   *
   * 부여 주체: backend 펌프(ClaudeAgentRun) — `mapClaudeStreamLine`은 순수 유지하고
   * 펌프가 후처리로 채운다(원본 engine.ts:153 nextBlockId + LAUNCH_TAG 미러).
   * optional인 이유: 펌프가 항상 채우지만, 미부여 시 renderer가 단일 버블로 degrade
   * (회귀 아님). EchoBackend 등 단순 백엔드는 생략 가능.
   *
   * 우리는 includePartialMessages=false라 delta는 토큰 증분이 아니라 완전 블록 →
   * messageId는 "누적 키"보다 "블록 경계 분리 키" 역할이 핵심.
   */
  messageId?: string
}

/** 에이전트가 도구(tool)를 호출 */
export interface AgentEventToolCall {
  type: 'tool_call'
  /** 도구 호출 고유 ID (tool_result와 매칭) */
  id: string
  /** 도구 이름 (예: 'bash', 'read_file') */
  name: string
  /**
   * 도구 입력 인자.
   * 엔진마다 스키마가 다르므로 unknown — 소비자는 name으로 narrowing.
   */
  input: unknown
  /**
   * 부모 도구 ID (서브에이전트 카드 귀속용).
   * 지정 시 해당 SubAgentInfo 카드 아래에 표시.
   * 미지정이면 최상위 도구 목록에 배치.
   */
  parentToolId?: string
}

/** 도구 실행 결과 */
export interface AgentEventToolResult {
  type: 'tool_result'
  /** 대응하는 tool_call id */
  id: string
  /** 성공 여부 */
  ok: boolean
  /**
   * 도구 실행 결과.
   * 도구별 형태가 다르므로 unknown — 소비자는 ok + id로 narrowing.
   */
  output: unknown
}

/** 에이전트가 파일을 변경 (파일 watch와 교차 검증용) */
export interface AgentEventFileChanged {
  type: 'file_changed'
  /** 변경된 파일의 워크스페이스 상대 경로 (또는 절대 경로) */
  path: string
  /** 변경 종류 */
  change: 'add' | 'modify' | 'delete'
  /**
   * 이 변경을 일으킨 도구의 tool_use id (= renderer ToolCard id).
   * 카드별 diff 연결용 — path는 정규화돼 도구 입력 경로와 키가 어긋날 수 있어 toolId로 매칭.
   * backend가 도구 변경에서 emit한 경우 포함.
   */
  toolId?: string
  /**
   * 변경 라인 수 요약 (표시용 "+add −del").
   * backend가 계산한 경우에만 포함 — 미계산 시 생략.
   */
  add?: number
  /**
   * 삭제 라인 수 요약.
   * backend가 계산한 경우에만 포함 — 미계산 시 생략.
   */
  del?: number
  /**
   * edit/write 전후 whole-file diff 라인 (뷰어 마킹용).
   * backend가 계산한 경우에만 포함.
   * 미계산·바이너리·대형 파일(backend 가드)인 경우 생략.
   */
  diff?: DiffLine[]
}

/** 에이전트 사고 과정(extended thinking) 1줄 요약 — 단방향(에이전트→UI). */
export interface AgentEventThinking {
  type: 'thinking'
  /** 사고 과정 1줄 요약 텍스트 */
  text: string
}

/** thinking 표시 종료 — 에이전트가 본문 텍스트 출력을 시작할 때. */
export interface AgentEventThinkingClear {
  type: 'thinking_clear'
}

// ── 서브에이전트(Task 도구 검사 카드) ────────────────────────────────────────

/**
 * 서브에이전트가 실행 중인 단일 도구 항목.
 * 렌더러 `src/renderer/src/lib/agentSampleData.ts`의 `SubAgentTool`과 동형(canonical).
 */
export interface SubAgentTool {
  /** 도구 호출 고유 ID */
  id: string
  /** 동사형 이름 (예: 'read', 'write', 'bash') */
  verb: string
  /** 대상 경로 또는 설명 문자열 */
  target: string
  /** 도구 실행 상태 */
  status: 'running' | 'done' | 'queued'
}

/**
 * 서브에이전트 한 인스턴스의 스냅샷.
 * 렌더러 `src/renderer/src/lib/agentSampleData.ts`의 `SubAgentInfo`와 동형(canonical).
 * 렌더러는 id를 키로 upsert/병합(부분 스냅샷 의미).
 */
export interface SubAgentInfo {
  /** 서브에이전트 고유 ID (upsert 키) */
  id: string
  /** 표시 이름 */
  name: string
  /** 역할 설명 (예: 'explorer', 'builder') */
  role: string
  /** 실행 상태 */
  status: 'queued' | 'running' | 'done'
  /** 현재 활동 요약 텍스트 (선택; 마크다운 허용) */
  activity?: string
  /** 해당 서브에이전트가 호출한 도구 목록 */
  tools: SubAgentTool[]
}

/**
 * 서브에이전트 상태 단방향 이벤트 — 에이전트→UI.
 * 부분 스냅샷: 렌더러는 subagent.id로 기존 항목을 upsert/병합(전체 교체 아님).
 */
export interface AgentEventSubagent {
  type: 'subagent'
  /** 갱신할 서브에이전트 스냅샷 */
  subagent: SubAgentInfo
}

/**
 * 작업목록 항목 (TodoWrite 전체 리스트의 한 줄).
 * 렌더러 `src/renderer/src/lib/agentSampleData.ts`의 `Todo`와 동형(canonical).
 */
export interface TodoItem {
  /** 항목 고유 ID */
  id: string
  /** 표시 라벨 */
  label: string
  /** 진행 상태 */
  status: 'done' | 'running' | 'planned'
}

/** 에이전트 작업목록 진행(TodoWrite) — 전체 리스트 스냅샷(덮어쓰기 의미). */
export interface AgentEventTodos {
  type: 'todos'
  /** 작업목록 전체 */
  todos: TodoItem[]
}

// ── 양방향 요청 이벤트 (에이전트→UI, 사용자 응답 대기) ───────────────────────

/**
 * 에이전트가 도구 실행 권한을 사용자에게 요청 — 에이전트가 멈추고 응답을 기다린다.
 *
 * main이 push → renderer가 PermissionModal을 띄운다.
 * 사용자 선택 후 renderer는 `agent.permissionRespond` 채널로 응답(invoke).
 *
 * requestId: 동일 runId 내에서 요청을 유일하게 식별 (응답 매칭용).
 * toolName: 권한 요청 대상 도구 이름 (예: 'Bash', 'Write').
 * summary: 사용자에게 보여줄 동작 요약 문자열.
 */
export interface AgentEventPermissionRequest {
  type: 'permission_request'
  /** 동일 runId 내 요청 유일 식별자 (응답 매칭) */
  requestId: string
  /** 권한 요청 대상 도구 이름 (예: 'Bash', 'Write') */
  toolName: string
  /** 사용자에게 보여줄 동작 요약 */
  summary: string
}

/**
 * QuestionModal 단일 옵션 항목.
 * 렌더러 `src/renderer/src/lib/f14SampleData.ts` 의 QuestionOption 과 동형 (canonical).
 */
export interface QuestionOption {
  /** 옵션 표시 라벨 */
  label: string
  /** 추가 설명 (선택) */
  description?: string
}

/**
 * QuestionModal 단일 질문.
 * 렌더러 `src/renderer/src/lib/f14SampleData.ts` 의 AgentQuestion 과 동형 (canonical).
 * 렌더러 lib 은 이 타입을 re-export 하고 직접 정의를 제거한다.
 *
 * header: 섹션 헤더(선택). question: 질문 본문. options: 선택지 목록.
 * multiSelect: true면 복수 선택 허용.
 */
export interface AgentQuestion {
  /** 섹션 헤더 (선택) */
  header?: string
  /** 질문 본문 */
  question: string
  /** 선택지 목록 */
  options: QuestionOption[]
  /** true면 복수 선택 허용 */
  multiSelect?: boolean
}

/**
 * 에이전트가 사용자에게 질문을 요청 — 에이전트가 멈추고 응답을 기다린다.
 *
 * main이 push → renderer가 QuestionModal을 띄운다.
 * 사용자 응답 후 renderer는 `agent.questionRespond` 채널로 응답(invoke).
 * 사용자가 건너뛰기(dismiss)하면 answers=null.
 *
 * requestId: 동일 runId 내에서 요청을 유일하게 식별 (응답 매칭용).
 * questions: 동시에 제시하는 질문 목록(순서 유지).
 */
export interface AgentEventQuestionRequest {
  type: 'question_request'
  /** 동일 runId 내 요청 유일 식별자 (응답 매칭) */
  requestId: string
  /** 동시에 제시하는 질문 목록 (순서 유지) */
  questions: AgentQuestion[]
}

/** 에이전트 실행 완료 */
export interface AgentEventDone {
  type: 'done'
  /** 토큰 사용량 (지원 엔진만 포함) */
  usage?: TokenUsage
  /**
   * 실 컨텍스트 창 크기(토큰). Agent SDK result의 modelUsage.contextWindow 유래.
   * 미전달 시 소비자는 MODEL_CONTEXT_WINDOW 상수로 fallback (하위호환).
   * SDK 전환(ADR-016, Phase 21)에서 추가 — backend-contract 깃발.
   */
  contextWindow?: number
}

/** 에이전트 실행 중 오류 */
export interface AgentEventError {
  type: 'error'
  /** 사람이 읽을 수 있는 오류 메시지 */
  message: string
}

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
  | AgentEventPermissionRequest
  | AgentEventQuestionRequest
  | AgentEventDone
  | AgentEventError
