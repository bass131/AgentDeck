/**
 * agentEvents/interaction.ts — 양방향 요청 이벤트 (에이전트→UI, 사용자 응답 대기) (RS1 P03 분할)
 *
 * 원본: `02_Source/shared/agentEvents.ts` "양방향 요청 이벤트" 섹션.
 * 권한 요청·질문 요청처럼 **에이전트가 멈추고 사용자 응답을 기다리는** 이벤트와,
 * 그 언저리의 모델/모드 상태 통지(model-fallback · permission_mode)를 소유한다.
 * 타입 표면(필드·discriminant 값)은 원본 그대로 — 분할은 파일 경계만 바꾼다.
 * 소비처 import 경로는 배럴 `02_Source/shared/agentEvents.ts`가 보존한다.
 *
 * canonical 방향: 이 파일이 정의 정본이고, 렌더러
 * `02_Source/renderer/src/lib/f14SampleData.ts`는 여기서 import해 re-export만 한다(G2).
 *
 * 변경 주의: backend-contract 깃발 — agent-backend·renderer·qa 정합 동반.
 * `any` 사용 금지.
 */

/**
 * ExitPlanMode 도구 호출의 프롬프트 기반 허용 힌트 1건.
 * SDK `ExitPlanModeInput.allowedPrompts[]` 미러(sdk-tools.d.ts:498) — "계획을 실행하려면
 * 이 카테고리의 동작에 권한이 필요하다"는 사전 힌트. tool은 현재 SDK 선언상 'Bash'만 존재.
 */
export interface PlanReviewAllowedPrompt {
  /** 이 힌트가 적용되는 도구 — 현재 SDK 선언은 'Bash'만 (인덱스 시그니처로 향후 확장 가능) */
  tool: 'Bash'
  /** 허용이 필요한 동작의 의미 요약 (예: "run tests", "install dependencies") */
  prompt: string
}

/**
 * ExitPlanMode 권한 요청 확장 payload (GAP1 P03 — probe③ 실측 기반, additive).
 *
 * probe③(2026-07-13, permissionMode:'plan' 실측 query): canUseTool에 전달되는
 * ExitPlanMode `input`은 `{ plan, planFilePath }`가 실재했고 `allowedPrompts`는 이
 * 캡처 케이스에서는 부재(케이스 따라 존재 가능 — SDK 타입 선언에는 실재, sdk-tools.d.ts:494).
 * fixture = `99_Others/tests/fixtures/gap1-p03/probe-3-exitplan-input.json`.
 *
 * CRITICAL(신뢰경계 참고): 이 필드가 신규 노출 카테고리를 여는 것은 아니다 — ExitPlanMode
 * 도구 호출은 이미 `tool_call` 이벤트(`AgentEventToolCall.input: unknown`)로 렌더러에
 * 먼저 도달해 있어 plan/planFilePath 원문이 이미 노출된 상태다. 이 필드는 Plan Review UI
 * 전용 소비를 위한 *구조화 재노출*일 뿐 새로운 신뢰경계 확장이 아니다.
 */
export interface PlanReviewPayload {
  /** 계획 본문(마크다운). probe③ 실측: input.plan. */
  plan?: string
  /** 계획이 저장된 로컬 파일의 절대경로. probe③ 실측: input.planFilePath. */
  planFilePath?: string
  /** 계획 실행에 필요한 프롬프트 기반 권한 힌트 목록. probe③에서는 미관측(부재) — 옵셔널. */
  allowedPrompts?: PlanReviewAllowedPrompt[]
}

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
  /**
   * ExitPlanMode 전용 구조화 확장 (GAP1 P03, additive optional).
   * toolName === 'ExitPlanMode'일 때만 어댑터가 채운다(P07 배선) — 그 외 도구는 미부여.
   * 미부여여도 기존 소비자(PermissionModal)는 summary만으로 완전(회귀 0).
   */
  planReview?: PlanReviewPayload
}

/**
 * QuestionModal 단일 옵션 항목.
 *
 * **이 정의가 canonical**이다 — 렌더러 `02_Source/renderer/src/lib/f14SampleData.ts`는
 * 이 타입을 import해 re-export만 한다(G2, 직접 정의 제거 완료).
 */
export interface QuestionOption {
  /** 옵션 표시 라벨 */
  label: string
  /** 추가 설명 (선택) */
  description?: string
}

/**
 * QuestionModal 단일 질문.
 *
 * **이 정의가 canonical**이다 — 렌더러 `02_Source/renderer/src/lib/f14SampleData.ts`는
 * 이 타입을 re-export만 하고 직접 정의를 갖지 않는다(G2).
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

/**
 * 엔진 측 권한 모드 상태 변경 관찰 신호 (GAP1 P13, additive 신설).
 *
 * 어댑터가 SDK status의 permissionMode 관찰 시 방출 — 라이브 모드 전환
 * (agent.setMode)의 *결과* 정본이자 피커/배지 동기화 보조(plan 승인 착지
 * acceptEdits 반영 포함). SetModeResponse.accepted 는 요청 수락 여부일 뿐,
 * 실제 전환 반영은 이 이벤트로 확인한다(taskStop → bg_task notification 관례 미러).
 *
 * CRITICAL(ADR-003, 엔진중립): mode 는 picker id 어휘('normal'|'plan'|'acceptEdits'|
 * 'auto'|...) — SDK 모드('default' 등)→picker id 역매핑은 어댑터 내부에만,
 * 매핑 불가 값은 미방출. 엔진 고유 리터럴이 어댑터 밖으로 새지 않는다.
 * CRITICAL(신뢰경계): 모델 raw payload 0 — mode 문자열만 전달.
 *
 * backend-contract 깃발: 이 이벤트 신설은 agent-backend(어댑터 방출)·
 * renderer(피커/배지 소비)·qa(골든 정합) 전체에 영향 → coordinator 조율 필수.
 * 이 정의는 계약만 — 방출·소비는 각각 agent-backend/renderer 몫.
 */
export interface AgentEventPermissionMode {
  type: 'permission_mode'
  /** 현재 권한 모드 picker id (예: 'normal', 'plan', 'acceptEdits', 'auto') */
  mode: string
}
