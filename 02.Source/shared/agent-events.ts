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
  /**
   * 서브에이전트 소속 text면 부모 도구 id. reducer가 transcript로 라우팅.
   * tool_call의 parentToolId 미러.
   *
   * 미지정이면 최상위(오케스트레이터) 메시지로 취급.
   */
  parentToolId?: string
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
  /**
   * 서브에이전트 소속 thinking이면 부모 도구 id. reducer가 transcript로 라우팅.
   * tool_call의 parentToolId 미러.
   *
   * 미지정이면 최상위(오케스트레이터) 사고로 취급.
   */
  parentToolId?: string
}

/** thinking 표시 종료 — 에이전트가 본문 텍스트 출력을 시작할 때. */
export interface AgentEventThinkingClear {
  type: 'thinking_clear'
}

// ── 오케스트레이션 카드 (Phase 37 #4b) ──────────────────────────────────────

/**
 * 멀티에이전트 오케스트레이션 도구 실행 카드 (Phase 37 #4b).
 *
 * 엔진별 도구명 매핑은 어댑터 내부 — 이 이벤트는 엔진중립 표현이다 (ADR-003).
 * 예: Claude SDK 'Workflow' 도구, 미래 Codex 동등 도구 모두 이 이벤트로 정규화.
 *
 * script는 모델 출력(어댑터가 길이 cap 적용)이며 raw SDK payload가 아니다(신뢰경계).
 * backend가 최대 4096자로 cap하여 전달 — renderer는 그대로 표시만 한다.
 *
 * backend-contract 깃발: 이 이벤트 변경은 agent-backend(어댑터 매핑)·
 * renderer(소비)·qa(골든 정합) 전체에 영향 → coordinator 조율 필수.
 */
export interface AgentEventOrchestration {
  type: 'orchestration'
  /** 도구 호출 고유 ID (tool_result와 매칭) */
  id: string
  /**
   * 표시 이름 — 오케스트레이션 단계 타이틀.
   * 어댑터가 meta.name 파싱으로 채운다; 파싱 실패 시 id 기반 fallback.
   * 'Workflow' 리터럴은 SDK 내부 도구명이므로 이 필드에 사용 금지.
   */
  name: string
  /** 오케스트레이션 단계 설명 (선택) */
  description?: string
  /**
   * 단계 제목 목록 (선택).
   * 어댑터가 meta.phases 배열에서 title 필드를 추출하여 평탄화.
   */
  phases?: string[]
  /**
   * 풀스크린 표시용 capped 스크립트 (선택).
   * 모델이 생성한 텍스트 — raw SDK payload 아님(신뢰경계 한 줄).
   * backend가 길이 cap(≤4096자) 후 전달; renderer는 표시만.
   */
  script?: string
}

/**
 * 오케스트레이션 개별 작업 진행(엔진중립).
 * 어댑터가 엔진 고유 진행 배열을 이 형태로 정규화한다(ADR-003).
 */
export interface OrchestrationAgentProgress {
  /** 작업 라벨(병렬 항목 식별) */
  label: string
  /** 소속 단계 제목(선택) */
  phase?: string
  /** 진행 상태: queued(대기) · running(실행) · done(완료) */
  state: 'queued' | 'running' | 'done'
  /** 누적 토큰(선택) */
  tokens?: number
  /** 도구 호출 수(선택) */
  toolCalls?: number
  /** 결과 미리보기(선택, done 시) */
  resultPreview?: string
}

/**
 * 오케스트레이션 라이브 진행 이벤트 (F-C).
 *
 * orchestration 카드(AgentEventOrchestration)의 라이브 갱신용. id가 orchestration
 * 이벤트 id(= 도구 호출 id)와 일치해 reducer가 thread에서 카드를 in-place 갱신한다.
 *
 * CRITICAL(ADR-003): 엔진 고유 이벤트명(예: 'task_progress')·필드명(예: 'workflow_agent')은
 * 어댑터(claude-stream/ClaudeCodeBackend) 내부에만. 이 이벤트는 엔진중립 표현이다.
 * CRITICAL(신뢰경계): 모델/엔진이 낸 진행 메타만 — 파일경로·시크릿·raw payload 0.
 *
 * backend-contract 깃발: 이 이벤트 변경은 agent-backend·renderer·qa 전체 영향.
 */
export interface AgentEventOrchestrationProgress {
  type: 'orchestration_progress'
  /** 대상 orchestration 카드 id (orchestration 이벤트 id와 동일) */
  id: string
  /** 전체 상태: running(진행) · completed(완료) · failed(실패) */
  status: 'running' | 'completed' | 'failed'
  /** 진행 요약(선택) */
  summary?: string
  /** 단계 제목 목록(선택) — 라이브 단계 진행 */
  phases?: string[]
  /** 개별 작업 진행(선택) */
  agents?: OrchestrationAgentProgress[]
}

/**
 * `orchestration_denied` 이벤트의 거부 사유 — 리터럴 유니온(자유 string 금지).
 *
 * 'orchestration-off': UltraCode 토글 OFF 턴에 모델이 Workflow(오케스트레이션 도구)를
 * 자발 호출 → canUseTool이 즉시 거부(G4, ADR-032 v2 ②). 키워드로도 우회 불가.
 *
 * 향후 사유가 늘면 이 유니온에 멤버만 additive로 추가한다 — renderer는 사유별
 * 한국어 카피를 매핑(표시 문구는 이 계약에 넣지 않는다).
 */
export type OrchestrationDeniedReason = 'orchestration-off'

/**
 * G4 즉시 deny(OFF 턴 Workflow 자발 호출 차단) 통지 (ADR-032 v2 ④, additive 신설).
 *
 * 토글이 꺼진 턴에 모델이 Workflow를 스스로 호출하면 canUseTool이 즉시 거부한다.
 * 사용자가 "영문 모를 일" 없이 알 수 있도록 renderer가 대화창에 시스템 라인으로
 * 표시하기 위한 통지 — 표시 문구(한국어 카피)는 이 계약에 넣지 않는다(renderer 몫).
 *
 * CRITICAL(ADR-003, 엔진중립): 'Workflow'는 Claude SDK 내부 도구명이므로 이 이벤트의
 * 어떤 필드에도 리터럴로 노출하지 않는다 — AgentEventOrchestration과 동일 원칙.
 * CRITICAL(신뢰경계): 모델 raw payload 0 — id(도구 호출 id)와 reason(고정 리터럴)만 전달.
 *
 * backend-contract 깃발: 이 이벤트 신설은 agent-backend(어댑터가 canUseTool deny 시 emit —
 * P09 몫)·renderer(시스템 라인 소비 — P10 몫)·qa(골든 정합) 전체에 영향 →
 * coordinator 조율 필수. 이 Phase(08)는 계약 *정의만* — 방출·표시는 각각 P09/P10.
 */
export interface AgentEventOrchestrationDenied {
  type: 'orchestration_denied'
  /** 거부된 도구 호출 고유 ID (tool_call/tool_result 매칭 관례와 동일) */
  id: string
  /** 거부 사유 (리터럴 유니온) */
  reason: OrchestrationDeniedReason
}

// ── 서브에이전트(Task 도구 검사 카드) ────────────────────────────────────────

/**
 * 서브에이전트 transcript 단일 항목(통합 타임라인).
 * 모델 출력만 — raw SDK 필드 0(신뢰경계).
 *
 * kind: 항목 종류('text'=텍스트 출력 · 'thinking'=사고 요약 · 'tool'=도구 호출).
 * text: 텍스트 또는 사고 내용(kind='text'·'thinking'에서 사용).
 * verb: 도구 동사형 이름(kind='tool'에서 사용. 예: 'read', 'write', 'bash').
 * target: 도구 대상 경로 또는 설명(kind='tool'에서 사용).
 * status: 도구 실행 상태(kind='tool'에서 사용).
 * id: 항목 고유 ID(도구 호출 id 또는 임시 식별자).
 */
export interface SubAgentTranscriptItem {
  /** 항목 종류 */
  kind: 'text' | 'thinking' | 'tool'
  /** 텍스트 또는 사고 내용(kind='text'·'thinking') */
  text?: string
  /** 도구 동사형 이름(kind='tool'. 예: 'read', 'write', 'bash') */
  verb?: string
  /** 도구 대상 경로 또는 설명(kind='tool') */
  target?: string
  /** 도구 실행 상태(kind='tool') */
  status?: 'running' | 'done' | 'queued'
  /** 항목 고유 ID */
  id?: string
}

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
  /**
   * 서브에이전트 내부 메시지 타임라인(B2 격리 슬라이스, 휘발).
   * parentToolId 라우팅으로 채워짐. 풀스크린 표시용.
   *
   * 미지정이면 빈 타임라인으로 취급(기존 SubAgentInfo와 하위호환).
   */
  transcript?: SubAgentTranscriptItem[]
  /**
   * 서브에이전트가 실행 중(예정)인 모델. FB2 P07 — additive 확장. optional: 미지정이어도
   * 기존 소비자 비파괴.
   *
   * 두 출처(CP1 P07에서 조기 스냅샷 추가):
   *  1) **조기 스냅샷**(생성 시점) — Task/Agent tool_use `input.model`(SDK `AgentInput.model`,
   *     sdk-tools.d.ts). 이 필드는 원시 모델 ID가 아니라 **짧은 별칭**
   *     ('sonnet'|'opus'|'haiku'|'fable') 또는 아예 없을 수 있다(생략 시 상속).
   *  2) **실측 갱신**(도착 시) — 서브에이전트의 첫 assistant 메시지(SDK
   *     `SDKAssistantMessage.message.model`, 항상 존재하는 실측 원시 모델 ID, 예:
   *     'claude-opus-4-8') 도착 시 어댑터가 이 필드를 채운 `subagent` update 이벤트로
   *     병합해 조기 스냅샷을 덮어쓴다.
   *
   * 즉 이 필드는 **원시 ID든 별칭이든 있는 그대로** 담길 수 있다 — 소비 측이 미지 입력(별칭)을
   * 만나도 안전하게 표시하려면 원문 fallback을 갖춰야 한다(표시 변환은 이 계약의 책임이
   * 아니다 — main `01_agents/modelFallback.ts`의 `modelDisplay` 헬퍼, renderer
   * `lib/modelLabel.ts` 참조).
   */
  model?: string
  /**
   * 서브에이전트의 사람이 붙인 addressable 표시명(예: '소네트 테스트 에이전트 1').
   * CP1 P07 — additive 신설. optional: 미지정이어도 기존 소비자 비파괴.
   *
   * 출처: Task/Agent tool_use `input.name`(SDK `AgentInput.name`, sdk-tools.d.ts —
   * "Makes it addressable via SendMessage({to: name})"). 사용자/모델이 임의로 붙인
   * 자유 문자열이다.
   *
   * CRITICAL(NG-1 결정 유지): `name` 필드는 여전히 `subagent_type`(예: 'general-purpose')
   * 계약을 담는다 — 이 필드를 표시용으로 재활용하지 않는다(식별 vs 표시 분리). displayName은
   * 순수 표시 전용 additive이며, `name`을 대체하지 않는다.
   *
   * 표시 우선순위(예: displayName 있으면 우선, 없으면 name 폴백)는 이 계약의 책임이
   * 아니다 — 소비 측(renderer)이 결정한다.
   */
  displayName?: string
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

/**
 * 안전정책 거부(refusal) → 폴백 모델 전환 경고.
 *
 * Fable 5 안전정책 거부(stop_reason:'refusal') 시 SDK 폴백 모델(Opus)로 자동 전환 후
 * 채팅 경고 배너로 표시된다.
 *
 * retractMessageId: dialog 경로에서 거부 직전 스트리밍 중이던 부분 버블 id.
 *   있으면 reducer가 해당 msg를 thread에서 제거(재시도 답변이 새 버블로 시작).
 *   null이면 제거 없이 notice만 push(system 경로 또는 text 없이 거부된 경우).
 *
 * fromModel/toModel: 표시용 raw 모델 ID string(modelDisplay는 어댑터 내부).
 * text: 사용자에게 표시할 한국어 경고 문자열(어댑터가 fallbackNotice로 생성).
 *
 * CRITICAL(ADR-003): dialog/system raw payload 미노출 — 모델명·카테고리 string만.
 * 추가 필드 확장 시 backend-contract 깃발 → coordinator 통해 협의.
 */
export interface AgentEventModelFallback {
  type: 'model-fallback'
  /** 런 ID (이벤트 envelope에도 있지만 payload 자체에도 포함) */
  runId?: string
  /** 원래 거부된 모델 ID (raw string, 예: 'claude-fable-5') */
  fromModel: string
  /** 폴백 대상 모델 ID (raw string, 예: 'claude-opus-4-8') */
  toModel: string
  /** 사용자에게 표시할 한국어 경고 문구 (fallbackNotice 생성값) */
  text: string
  /**
   * 거부 직전 스트리밍 중이던 assistant msg id.
   * null이면 제거 없이 notice만 push.
   * undefined이면 null과 동일하게 처리(optional 방어).
   */
  retractMessageId?: string | null
}

/** 에이전트 실행 완료 (지속세션에서는 **turn 경계** — 세션은 살아있을 수 있음) */
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
  /**
   * turn 발원 — 'user'(사용자 입력으로 시작된 턴) · 'cron'(지속세션에서 입력 없이
   * 자율 발동된 cron-turn). 지속세션(REPL, ADR-024) 옵트인에서만 부여된다.
   *
   * 단발/비-persistent 경로는 미부여(undefined) → 기존 done과 하위호환(회귀 0).
   * 부여 주체: 백엔드 펌프(어댑터 내부, 호스트측 직렬화 큐 + pending-send 카운터로 판정 —
   *   origin-probe 실측: SDK는 origin 신호 미제공, 턴은 직렬). renderer는 cron-turn을
   *   새 assistant 턴으로 렌더하되 currentRunId 필터에 버려지지 않게 (5)에서 라우팅.
   * ADR-003: 'cron'은 우리 앱 개념(엔진 리터럴 아님) — 중립.
   */
  origin?: 'user' | 'cron'
}

/** 에이전트 실행 중 오류 */
export interface AgentEventError {
  type: 'error'
  /** 사람이 읽을 수 있는 오류 메시지 */
  message: string
}

/**
 * 세션 식별자 — 턴 간 맥락 복구용 (Phase 1, REPL_TRANSITION).
 * 엔진의 system/init에서 캡처한 불투명 세션 토큰. 다음 턴의 resume에 사용한다.
 * ADR-003: sessionId는 엔진 고유 *형상*이 아닌 불투명 문자열 — 중립 표면화 가능.
 *   `resume` 옵션으로의 *매핑*만 ClaudeCodeBackend 어댑터 내부에 둔다.
 */
export interface AgentEventSession {
  type: 'session'
  /** 엔진 세션 ID(불투명). 같은 대화의 다음 agentRun이 resumeSessionId로 되돌려 보낸다. */
  sessionId: string
}

/**
 * 활성 루프 1개 — 내장 `/loop`·`/schedule` 크론의 진행 표시용(5c, REPL 지속세션).
 * 엔진의 cron 상태를 어댑터가 중립 형태로 정규화한다.
 * ADR-003: 'CronCreate'/cron 표현식 등 엔진 리터럴은 어댑터(ClaudeCodeBackend) 내부에만.
 * 신뢰경계: summary는 모델 prompt를 sanitize·cap한 값 — 시크릿/경로/raw payload 0.
 */
export interface LoopInfo {
  /** 불투명 식별자(루프 구분·제거 매칭) */
  id: string
  /** 작업내용 — 루프가 반복 실행하는 작업 요약(sanitize·cap) */
  summary: string
  /** 사람표기 주기(선택, 예: 'Every minute') */
  interval?: string
}

/**
 * 활성 루프 전체 스냅샷 — REPL 지속세션의 "loop 진행중" 표시 데이터원(5c).
 * 어댑터가 Cron 도구(Create/Delete) 추적으로 누적해 변경마다 전체 스냅샷을 emit.
 * **빈 배열 = 활성 루프 없음**(표시 제거). 덮어쓰기 의미(부분 갱신 아님).
 */
export interface AgentEventLoops {
  type: 'loops'
  /** 활성 루프 전체 (빈 배열이면 표시 제거) */
  loops: LoopInfo[]
}

// ── 자율반복 생존신호(LR4 P03) ────────────────────────────────────────────────

/**
 * `autonomy_status` 이벤트의 종료 사유 — 리터럴 유니온(자유 string 금지).
 *
 * 'grace-expired': idle-close 유예(짧은 대기) 만료 후 추가 continuation 없이 자연종료.
 * 'cap-reached': 연속 자율(cron-origin) 턴 수가 상한을 초과해 펌프가 강제종료.
 *
 * 향후 사유가 늘면 이 유니온에 멤버만 additive로 추가한다 — renderer는 사유별
 * 한국어 카피를 매핑(표시 문구는 이 계약에 넣지 않는다).
 */
export type AutonomyEndedReason = 'grace-expired' | 'cap-reached'

/**
 * 자율반복(goal 자기지속·cron continuation) 생존신호 (LR4 P03, additive 신설).
 *
 * 지속세션(REPL, ADR-024) 펌프가 done 직후 즉시 idle-close하던 판정을 "짧은 유예 후
 * 판정 + 무한루프 상한"으로 바꾸면서, 그 유예/반복 진행 상태를 렌더러가 실시간으로
 * 알 수 있도록 방출하는 이벤트.
 *
 * (a) 방출 주체: 백엔드 지속 펌프(claudeAgentRun) — idle-close 유예 로직과 같은 소스.
 *   'active'는 자율(cron-origin) 연속 턴이 확인될 때마다(유예 중 continuation 흡수),
 *   'ended'는 유예가 만료되거나 상한을 초과해 자율반복이 실제로 멈출 때 emit한다.
 * (b) 소비 주체: P05(renderer) — 배너가 이 이벤트를 실상태로 소비해 기존 낙관적
 *   플래그(`pendingCommand`)를 대체한다. `pendingCommand`는 조기발동(실제 종료 전
 *   배너가 꺼짐)·미해제(실제 종료 후에도 배너가 안 꺼짐) 두 결함을 모두 가졌었다 —
 *   이 이벤트는 백엔드 실측 신호이므로 두 결함을 봉합한다.
 * (c) ADR-003(엔진중립): 'goal'·'cron'은 우리 앱 개념(REPL 지속세션·내장 크론)이며
 *   엔진 SDK의 리터럴이 아니다 — 어댑터 밖으로 새는 엔진 고유 표현은 없다.
 * (d) 신뢰경계: 모델 raw payload 0 — status·reason 리터럴만 전달. 프롬프트·경로·
 *   시크릿 등 어떤 모델 생성 텍스트도 이 이벤트에 담지 않는다.
 * (e) backend-contract 깃발: 이 이벤트 신설은 agent-backend(펌프가 유예/상한 로직에서
 *   emit — 별도 Phase 몫)·renderer(배너 소비 — P05 몫)·qa(골든 정합) 전체에 영향 →
 *   coordinator 조율 필수. 이 Phase(LR4 P03)는 계약 *정의만* — 방출·소비는 각각
 *   agent-backend/P05.
 */
export interface AgentEventAutonomyStatus {
  type: 'autonomy_status'
  /** 'active'=자율(cron-origin) 연속 턴 확인(유예 중 continuation 흡수) · 'ended'=자율반복 종료 */
  status: 'active' | 'ended'
  /**
   * ended일 때만 부여. 'grace-expired'=유예 만료 자연종료 · 'cap-reached'=연속 자율 턴
   * 상한 초과 강제종료. active면 미부여.
   */
  reason?: AutonomyEndedReason
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
  | AgentEventOrchestration
  | AgentEventOrchestrationProgress
  | AgentEventOrchestrationDenied
  | AgentEventPermissionRequest
  | AgentEventQuestionRequest
  | AgentEventModelFallback
  | AgentEventSession
  | AgentEventLoops
  | AgentEventDone
  | AgentEventAutonomyStatus
  | AgentEventError
