/**
 * agentEvents/sdkLifecycle.ts — SDK 생명주기·관측 이벤트 (RS1 P03 분할)
 *
 * 원본: `02_Source/shared/agentEvents.ts`의 "GAP1 P03: SDK 실측 신규 이벤트" 섹션.
 * 타입 표면(필드·discriminant 값)은 원본 그대로 — 분할은 파일 경계만 바꾼다.
 * 소비처 import 경로는 배럴 `02_Source/shared/agentEvents.ts`가 보존한다.
 *
 * 근거: 01_Phases/17_GAP1-core-parity/03-agent-event-contract.md.
 * 원칙: probe로 실측 확인된 형상만 확정 필드, 미검증 형상은 옵셔널/예약(고정 금지).
 * probe fixture: 99_Others/tests/fixtures/gap1-p03/probe-{1,2,2b,3,4}-*.jsonl
 *   (① 훅 hook_id 상관관계 · ② session_state 미도달[env 미설정] · ②b session_state
 *    확정[env 옵트인] · ③ ExitPlanMode input 실형상 · ④ run_in_background 스트림).
 *
 * **배선 현황(RS1 P03 실측 정정, 2026-07-28)**: GAP1 P03 원문에는 "이 Phase는 계약
 * 정의만이며 어댑터는 이 원시 subtype들을 여전히 드롭한다"는 서술이 남아 있었으나,
 * 후속 Phase(P04~P09)에서 매핑이 완료되어 **현재는 사실이 아니다**. 실측: 이 파일의
 * 이벤트 9종(hook_lifecycle · informational · permission_denied · api_retry · compact ·
 * session_state · thinking_delta · bg_task · search_result) 전부를 어댑터
 * `main/01_agents/claudeStream.ts`가 방출하며(bg_task의 kind='output'만
 * `main/01_agents/bgTaskTail.ts`가 합성), renderer reducer 4파일이 소비한다
 * (`store/reducer/cockpit.ts` — hook_lifecycle·informational·permission_denied /
 *  `reliability.ts` — api_retry·compact·session_state / `text.ts` — thinking_delta /
 *  `tool.ts` — bg_task·search_result).
 *
 * 변경 주의: backend-contract 깃발 — agent-backend·renderer·qa 정합 동반.
 * `any` 사용 금지.
 */

/**
 * 훅 생명주기 이벤트 (probe① 실측 — 2026-07-13, includeHookEvents:true).
 *
 * SDK는 원래 3개 별도 시스템 메시지(SDKHookStartedMessage/SDKHookProgressMessage/
 * SDKHookResponseMessage, sdk.d.ts:3654-3690)로 나눠 보내지만, 이 계약은 `phase`
 * 판별 필드로 단일 이벤트 타입에 통합한다(AgentEvent union 비대화 방지 — 정보 손실 없음).
 *
 * fixture: probe-1-hooks.jsonl · probe-3-exitplan.jsonl · probe-4-bg-bash.jsonl 등
 * (hook은 거의 모든 세션에서 SessionStart/UserPromptSubmit/PreToolUse/PostToolUse/Stop로 자연발생).
 */
export interface AgentEventHookLifecycle {
  type: 'hook_lifecycle'
  /**
   * 훅 실행 단계. 'progress'는 SDK 타입 선언(SDKHookProgressMessage)에는 존재하나
   * probe①에서 5개 fixture 전부 0건 관측 — 예약(비동기 훅의 중간 진행 알림으로 추정).
   */
  phase: 'started' | 'response' | 'progress'
  /**
   * 훅 실행 인스턴스 상관관계 키. **started↔response 페어링 키**(probe① 실측 확인 —
   * 동일 hook_id로 시작/종료가 짝을 이룬다. 예: fixture 1번째 줄 hook_started와 2번째 줄
   * hook_response가 동일 hook_id="072425c8-..."를 공유).
   */
  hookId: string
  /**
   * 훅 이름. 실측 포맷은 두 가지: "{HookEvent}:{matcher}"(예: 'SessionStart:startup',
   * 'PreToolUse:Bash', 'PostToolUse:Bash') 또는 matcher 없는 "{HookEvent}"
   * (예: 'UserPromptSubmit', 'Stop').
   */
  hookName: string
  /** 훅 이벤트 종류(예: 'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'). */
  hookEvent: string
  /** 종료 코드(phase='response'에서, 있으면). */
  exitCode?: number
  /** 실행 결과(phase='response'에서). */
  outcome?: 'success' | 'error' | 'cancelled'
  /** 훅 스크립트 표준 출력(phase='response'·'progress'에서). */
  stdout?: string
  /** 훅 스크립트 표준 에러(phase='response'·'progress'에서). */
  stderr?: string
  /** 훅 출력 본문(phase='response'·'progress'에서 — stdout과 중복될 수 있음, SDK 선언 유지). */
  output?: string
}

/**
 * 일반 정보성 배너 (SDK `SDKInformationalMessage`, sdk.d.ts:3695 기반).
 * 훅 피드백(UserPromptSubmit 훅 차단 사유 등)·슬래시커맨드 상태줄 등 비-에러 상태 라인.
 *
 * probe 미관측 — 4종 probe 시나리오가 이 메시지를 트리거하는 훅/커맨드를 쓰지 않았다.
 * SDK 타입 선언 기반 계약(P05에서 fixture 검증 예정, 이 Phase는 정의만).
 */
export interface AgentEventInformational {
  type: 'informational'
  /** 배너 본문 텍스트. */
  content: string
  /**
   * 렌더 레벨. 'info'=트랜스크립트 모드에서만 표시 · 'notice'=비활성 회색 ·
   * 'suggestion'·'warning'=더 두드러지게(SDK 선언 그대로 미러).
   */
  level: 'info' | 'notice' | 'suggestion' | 'warning'
  /** 동일 도구 호출에 대한 진행 메시지 중복 제거 키(있으면). */
  toolUseId?: string
  /** true면 이 메시지 이후 실행이 중단된다(예: Stop 훅이 continuation을 거부). */
  preventContinuation?: boolean
}

/**
 * 대화형 프롬프트 없이 자동 거부된 도구 호출 통지 (SDK `SDKPermissionDeniedMessage`,
 * sdk.d.ts:3902 기반 — auto-mode classifier·dontAsk 모드·headless-agent 자동거부·
 * deny 규칙 등). 'ask' 경로는 기존 `permission_request` 이벤트가 담당 — 이 이벤트는
 * canUseTool의 'deny' 단락(short-circuit) 전용이라 is_error tool_result만으로는
 * 안 보이던 거부 사유를 렌더러가 표시할 수 있게 한다.
 *
 * probe 미관측 — SDK 타입 선언 기반 계약(P05에서 fixture 검증 예정).
 */
export interface AgentEventPermissionDenied {
  type: 'permission_denied'
  /** 거부된 도구 이름. */
  toolName: string
  /**
   * 거부 판단 주체 discriminator. SDK는 이 정확한 메시지(SDKPermissionDeniedMessage)에서
   * 이 필드를 열린 string으로 선언한다 — 관련된 canUseTool 컨트롤 요청 쪽
   * (SDKControlPermissionRequest.decision_reason_type, sdk.d.ts:3412)은 10-way 닫힌
   * 리터럴('rule'|'mode'|'subcommandResults'|'permissionPromptTool'|'hook'|'asyncAgent'|
   * 'sandboxOverride'|'workingDir'|'safetyCheck'|'classifier'|'other')이라 대표값 4종
   * (classifier/asyncAgent/mode/rule)이 이 계약의 1차 관심사이지만, probe 미관측 상태에서
   * 리터럴로 좁히면 실측 안 된 값이 런타임에 들어왔을 때 타입 계약과 어긋날 위험이 있어
   * string으로 유지한다(P05 fixture 검증 후 리터럴화 재검토).
   */
  decisionReasonType?: string
  /** 사람이 읽을 수 있는 거부 사유(있으면, 결정 주체가 제공한 경우). */
  decisionReason?: string
}

/**
 * API 요청 재시도 알림 (SDK `SDKAPIRetryMessage`, sdk.d.ts:2750 기반).
 * 재시도 가능한 오류(레이트리밋·서버 과부하 등)로 요청이 지연 후 재시도될 때 방출.
 *
 * probe 미관측 — SDK 타입 선언 기반 계약(P04에서 fixture 검증 예정).
 */
export interface AgentEventApiRetry {
  type: 'api_retry'
  /** 현재 재시도 시도 횟수(1-based). */
  attempt: number
  /** 최대 재시도 횟수. */
  maxRetries: number
  /** 다음 재시도까지 대기 시간(ms). */
  retryDelayMs: number
  /**
   * 실패 사유(있으면). SDK 선언(SDKAssistantMessageError)은 닫힌 리터럴
   * ('authentication_failed'|'oauth_org_not_allowed'|'billing_error'|'rate_limit'|
   * 'overloaded'|'invalid_request'|'model_not_found'|'server_error'|'unknown'|
   * 'max_output_tokens')이나, probe 미관측이라 permission_denied.decisionReasonType과
   * 동일 이유로 string 유지(P04 fixture 검증 후 리터럴화 재검토).
   */
  error?: string
}

/**
 * 컨텍스트 컴팩션(compaction) 진행 신호 (SDK `SDKCompactBoundaryMessage`(sdk.d.ts:2822)
 * + `SDKStatusMessage`(sdk.d.ts:4130) 두 원시 메시지를 kind로 통합).
 *
 * probe 미관측 — 4종 probe 시나리오가 컴팩션을 트리거할 만큼 컨텍스트를 채우지 않았다.
 * SDK 타입 선언 기반 계약(P04에서 fixture 검증 예정).
 */
export interface AgentEventCompact {
  type: 'compact'
  /** 'boundary'=컴팩션 경계 발생(SDKCompactBoundaryMessage) · 'status'=API 요청/압축 진행 상태(SDKStatusMessage). */
  kind: 'boundary' | 'status'
  /** 컴팩션 트리거(kind='boundary'에서만). */
  trigger?: 'manual' | 'auto'
  /** 컴팩션 전 토큰 수(kind='boundary'에서만). */
  preTokens?: number
  /** 컴팩션 후 토큰 수(kind='boundary'에서만, 있으면 — SDK 선언도 optional). */
  postTokens?: number
  /**
   * API 진행 상태(kind='status'에서만). 'compacting'=컨텍스트 압축이 실제 진행 중 ·
   * 'requesting'=**API 요청**이 진행 중(압축과 별개 상태 — 이름이 비슷해 혼동하기 쉽다.
   * requesting은 컴팩션 여부와 무관하게 API 왕복 중이면 나타날 수 있다) ·
   * null=진행 상태 해제(idle로 복귀).
   */
  status?: 'compacting' | 'requesting' | null
}

/**
 * SDK 실행 상태 변화 (SDK `SDKSessionStateChangedMessage`, sdk.d.ts:4102 기반).
 *
 * probe②(2026-07-13, cwd 기본 옵션): 미도달 — 트리거 조건 미충족으로 방출 0건.
 * probe②b(2026-07-13, 코디네이터 후속 재조사): **확정** — env
 * `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1` 옵트인 시에만 방출(기본 미방출).
 * 'running'→(작업)→'idle' 페어를 라이브 재현으로 실측 확인
 * (fixture: probe-2b-session-state-env.jsonl). 'requires_action'은 이 재현에서도
 * 미관측 — SDK 코멘트("bg-agent do-while 종료 시점" 등 특수 경로) 근거로만 존재.
 *
 * 어댑터가 이 env를 주입해 옵트인하는 배선은 P04 몫(이 Phase는 계약 정의만).
 * 소비자는 이 이벤트 없이도 완전해야 한다(옵트인 미설정 세션에서는 영영 안 옴 — 보강 전용).
 */
export interface AgentEventSessionState {
  type: 'session_state'
  /** 'idle'=유휴 · 'running'=실행 중(둘 다 실측 확인) · 'requires_action'=미재현(예약). */
  state: 'idle' | 'running' | 'requires_action'
}

/**
 * 라이브 사고(thinking) 진행 신호 — 원문 텍스트 증분과 redacted 구간의 토큰 추정치
 * 두 출처를 하나의 이벤트로 묶는다.
 */
export interface AgentEventThinkingDelta {
  type: 'thinking_delta'
  /**
   * 원문 사고 텍스트 증분(SDK stream_event의 content_block_delta.delta.type==='thinking_delta'
   * 유래, delta.thinking 필드). 현재 어댑터 설정(`includePartialMessages:false`)에서는
   * stream_event 자체가 text_delta 외에는 모두 드롭된다(claudeStream.ts:558-580) —
   * 5개 probe 전부 stream_event 0건 관측. includePartialMessages 활성화 전까지는
   * 항상 미부여일 수 있다(예약 필드).
   */
  text?: string
  /**
   * redacted-thinking 구간의 라이브 토큰 추정치(시스템 'thinking_tokens' 서브타입 유래,
   * sdk.d.ts:4265 — "API가 ping만 스트리밍하는 구간의 근사 진행률"). probe①~④·②b
   * 전부에서 자연발생 대량 관측(100건 이상) — 현재 사고 블록의 러닝 토탈이며 정산된
   * output_tokens가 아니라 스피너용 근사치.
   */
  estimatedTokens?: number
}

/** `bg_task` 이벤트의 kind='updated' 전용 최소 패치(SDK task_updated.patch 축약). */
export interface AgentEventBgTaskPatch {
  /** 상태 변화(SDK 선언 도메인: 'pending'|'running'|'completed'|'failed'|'killed'|'paused'). */
  status?: string
  /** 종료 시각(ms epoch, 있으면). */
  endTime?: number
}

/**
 * 백그라운드 태스크(run_in_background Bash·서브에이전트·워크플로) 생명주기 이벤트
 * (probe④ 실측 — 2026-07-13, run_in_background Bash + Task 서브에이전트 관찰).
 *
 * SDK는 3개 별도 시스템 메시지(SDKTaskStartedMessage/SDKTaskUpdatedMessage/
 * SDKTaskNotificationMessage, sdk.d.ts:4177-4258)로 나눠 보낸다 — 이 계약은 `kind`
 * 판별 필드로 단일 이벤트 타입에 통합한다(hook_lifecycle과 동일 패턴).
 *
 * fixture: probe-4-bg-bash.jsonl(run_in_background Bash — task_started/task_updated/
 * task_notification 전부 관측 + q.stopTask() 중도 종료) · probe-2-session-state.jsonl
 * (서브에이전트 Task 도구 — task_started(task_type='local_agent')/task_notification).
 *
 * **증분 tail 모델(P09 확정 — 하이브리드)**: probe④ 실측상 SDK 스트림은
 * task_started/task_updated/task_notification 생명주기 + output 파일 *경로*만 운반하고
 * 증분 출력 *내용*은 세션 tasks/{taskId}.output 파일에만 쌓인다. SDK Query는
 * stopTask(taskId)/backgroundTasks(toolUseId)/close()만 노출(sdk.d.ts 2494·2507행) —
 * 호스트측 출력 폴링 메서드 없음. 따라서 tail = 스트림 소비(생명주기·경로) +
 * main 측 output 파일 증분 폴링 하이브리드로 확정, kind='output' variant를
 * additive 확장한다(P03 선정의분 재-bump 없음).
 */
export interface AgentEventBgTask {
  type: 'bg_task'
  /**
   * 생명주기 단계 — 'started'(SDKTaskStartedMessage) · 'updated'(SDKTaskUpdatedMessage,
   * 최소 patch만) · 'notification'(SDKTaskNotificationMessage, 종료/중지 통지) ·
   * 'output'(P09 additive — SDK 메시지 아님, main 측 output 파일 증분 폴링이 합성).
   */
  kind: 'started' | 'updated' | 'notification' | 'output'
  /**
   * 태스크 고유 ID. **정본 상관관계 키**: 이 태스크를 백그라운드로 보낸 Bash tool_call의
   * tool_result 최상위 `tool_use_result.backgroundTaskId`(probe④ 실측 —
   * `{"backgroundTaskId":"b7hqf83vz"}`)와 동일 값이다. `AgentEventToolResult.output`은
   * unknown이라 이 상관은 어댑터 내부에서 tool_result emit *이전*에 원시 SDK
   * tool_result 메시지를 직접 대조해야 한다 — **content 문자열 파싱으로 taskId를
   * 추출하지 말 것**(원시 payload 구조가 정본, 문자열 grep은 깨지기 쉽다).
   */
  taskId: string
  /** 대응 도구 호출 id(있으면 — started/notification에 존재, updated는 SDK 선언에 없음). */
  toolUseId?: string
  /**
   * 태스크 종류. kind='started'에만 존재(SDK task_started.task_type, optional).
   * 'local_bash'(probe④ 실측)·'local_agent'(probe-2-session-state.jsonl 서브에이전트
   * 실측) 확인 완료. 'local_workflow'는 SDK 타입 선언 주석 근거(workflow_name 필드가
   * 이 값일 때만 세팅, sdk.d.ts:4229) — probe 미관측.
   */
  taskType?: 'local_bash' | 'local_agent' | 'local_workflow'
  /** 태스크 설명(kind='started'에서 — SDK는 필수 필드지만 이 계약에서는 optional 유지). */
  description?: string
  /**
   * 상태 문자열. kind='notification'에서는 SDK 선언 도메인('completed'|'failed'|'stopped'),
   * kind='updated'에서는 아래 patch.status와 동일 도메인 — kind별로 다른 값 집합이라
   * 좁은 리터럴 유니온 대신 string 유지.
   */
  status?: string
  /** kind='updated' 전용 최소 패치. */
  patch?: AgentEventBgTaskPatch
  /** 태스크 산출물 파일 경로(kind='notification', SDK output_file 미러). */
  outputFile?: string
  /** 완료 요약(kind='notification', SDK summary 미러). */
  summary?: string
  /**
   * 증분 출력 텍스트 조각 — kind='output' 전용 (P09 additive).
   *
   * SDK 스트림은 output 파일 *경로*만 운반한다(probe④ 실측) — 이 조각은 main 측이
   * 세션 tasks/{taskId}.output 파일을 증분 폴링해 읽어낸 *새로 늘어난* 텍스트다.
   * renderer는 taskId별로 이 조각을 이어붙여 라이브 tail을 구성한다.
   */
  outputChunk?: string
  /**
   * 출력 절단 표시 — 버퍼 상한으로 조각/누적이 잘려나간 경우 true (P09 additive, 선택 운반).
   * 장시간 dev 서버 로그의 메모리·렌더 성능 보호(버퍼 상한)가 발동했음을 소비자에 알린다.
   */
  outputTruncated?: boolean
}

/** `search_result` 이벤트의 매치 1건(파일 내 위치 — content 모드에서만 라인 정보 유효). */
export interface SearchResultMatch {
  /** 매치 파일 경로(어댑터가 워크스페이스 상대 또는 절대 경로 중 결정 — 이 계약은 강제하지 않음). */
  path: string
  /** 매치 라인 번호(1-based, content 모드에서만). */
  line?: number
  /** 매치 라인 텍스트(content 모드에서만). */
  text?: string
}

/**
 * 구조화 검색 결과 (Grep/Glob 도구 결과 정규화용 최소 골격, P08 소비).
 *
 * probe 미포함(4종 probe 범위 밖) — SDK 타입 선언(`GrepOutput`/`GlobOutput`,
 * sdk-tools.d.ts:2836-2871) 기반 스켈레톤. SDK `GrepOutput`은 content 모드에서도
 * 파일별 매치 배열이 아니라 **원문 텍스트 블록**(content: string)만 제공해 어댑터가
 * 직접 파싱해야 한다(Grep 3모드 실측·파싱은 P08 몫). 이 계약은 전 필드 optional로
 * 최소 표면만 고정하고, 세부 확장은 P08 실측 후 additive로 진행한다.
 */
export interface AgentEventSearchResult {
  type: 'search_result'
  /** 대응 도구 호출 id(있으면 — tool_call/tool_result 매칭 관례와 동일). */
  toolUseId?: string
  /** 검색 모드(Grep 3모드 중 하나, 또는 'glob' — SDK GrepOutput.mode/GlobOutput 구분 반영). */
  mode?: 'content' | 'files_with_matches' | 'count' | 'glob'
  /** 매치된 파일 경로 목록(files_with_matches/count/glob 모드 — 매치 상세 없이 파일만). */
  files?: string[]
  /** 매치 상세(content 모드 — 파일별 그룹은 소비 측이 path로 재구성 가능한 flat 배열). */
  matches?: SearchResultMatch[]
  /** 총 매치/파일 수(SDK numMatches/numFiles/totalMatches 유래). */
  total?: number
  /** 결과 잘림 여부(SDK truncated/appliedLimit 유래). */
  truncated?: boolean
}
