/**
 * agentEvents/orchestration.ts — 멀티에이전트 오케스트레이션 카드 이벤트 (RS1 P03 분할)
 *
 * 원본: `02_Source/shared/agentEvents.ts` "오케스트레이션 카드 (Phase 37 #4b)" 섹션.
 * 타입 표면(필드·discriminant 값)은 원본 그대로 — 분할은 파일 경계만 바꾼다.
 * 소비처 import 경로는 배럴 `02_Source/shared/agentEvents.ts`가 보존한다.
 *
 * 변경 주의: backend-contract 깃발 — agent-backend·renderer·qa 정합 동반.
 * `any` 사용 금지.
 */

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
 * 어댑터(claudeStream/ClaudeCodeBackend) 내부에만. 이 이벤트는 엔진중립 표현이다.
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
