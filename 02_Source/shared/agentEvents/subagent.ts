/**
 * agentEvents/subagent.ts — 서브에이전트(Task 도구 검사 카드) + 작업목록 이벤트 (RS1 P03 분할)
 *
 * 원본: `02_Source/shared/agentEvents.ts` "서브에이전트(Task 도구 검사 카드)" 섹션.
 * 타입 표면(필드·discriminant 값)은 원본 그대로 — 분할은 파일 경계만 바꾼다.
 * 소비처 import 경로는 배럴 `02_Source/shared/agentEvents.ts`가 보존한다.
 *
 * canonical 방향: 이 파일이 정의 정본이고, 렌더러
 * `02_Source/renderer/src/lib/agentSampleData.ts`는 여기서 import해 re-export만 한다
 * (Phase 24a: TodoItem · Phase 24b: SubAgentTool/SubAgentInfo/SubAgentTranscriptItem).
 *
 * 변경 주의: backend-contract 깃발 — agent-backend·renderer·qa 정합 동반.
 * `any` 사용 금지.
 */

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
 *
 * **이 정의가 canonical**이다 — 렌더러 `02_Source/renderer/src/lib/agentSampleData.ts`는
 * 이 타입을 import해 `export type { SubAgentTool }`로 re-export만 한다(Phase 24b,
 * 직접 정의 제거 완료). 렌더러 쪽에 별도 정의를 되살리지 말 것.
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
 *
 * **이 정의가 canonical**이다 — 렌더러 `02_Source/renderer/src/lib/agentSampleData.ts`는
 * 이 타입을 import해 re-export만 한다(Phase 24b, 직접 정의 제거 완료).
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
 *
 * **이 정의가 canonical**이다 — 렌더러 `02_Source/renderer/src/lib/agentSampleData.ts`는
 * 이 타입을 import해 re-export하고 `Todo`를 이 타입의 alias로 둔다(Phase 24a).
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
