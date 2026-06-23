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
  | AgentEventDone
  | AgentEventError
