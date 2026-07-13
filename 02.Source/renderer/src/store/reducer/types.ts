/**
 * reducer/types.ts — 리듀서 도메인 타입 (P12 분해).
 *
 * AppState·ToolCard·FileDiffEntry·PendingPermission·PendingQuestion·BeginCommandAction.
 * reducer.ts(조립 루트)가 이 파일에서 re-export → 외부 import 경로(`./reducer`) 불변.
 *
 * CRITICAL: 순수 타입 정의만 — window.api/Node/fs 0.
 */
import type { TokenUsage, TodoItem, SubAgentInfo, DiffLine, LoopInfo } from '../../../../shared/agent-events'
import type { ThreadItem } from '../threadTypes'

// ── FileDiff 엔트리 ───────────────────────────────────────────────────────────

/**
 * 파일 하나의 diff 요약 + 라인 목록.
 * file_changed 이벤트의 add/del/diff 필드에서 채워짐.
 * Phase B 단순화: 같은 path는 최신 diff로 교체(누적 아님).
 */
export interface FileDiffEntry {
  /** 추가된 라인 수 */
  add: number
  /** 삭제된 라인 수 */
  del: number
  /** 라인별 diff 목록 (DiffViewer에 전달) */
  lines: DiffLine[]
}

// ── 권한 요청 보류 상태 ─────────────────────────────────────────────────────────

/**
 * 사용자 응답 대기 중인 권한 요청 스냅샷.
 * AgentEventPermissionRequest 페이로드 + envelope의 runId.
 */
export interface PendingPermission {
  /** 이벤트 envelope의 runId — 응답 invoke에 사용 */
  runId: string
  /** 동일 runId 내 요청 유일 식별자 */
  requestId: string
  /** 권한 요청 대상 도구 이름 */
  toolName: string
  /** 사용자에게 보여줄 동작 요약 */
  summary: string
}

// ── 질문 요청 보류 상태 (Phase 24d) ────────────────────────────────────────────

/**
 * 사용자 응답 대기 중인 질문 요청 스냅샷.
 * AgentEventQuestionRequest 페이로드 + envelope의 runId.
 */
export interface PendingQuestion {
  /** 이벤트 envelope의 runId — 응답 invoke에 사용 */
  runId: string
  /** 동일 runId 내 요청 유일 식별자 */
  requestId: string
  /** 동시에 제시하는 질문 목록 (순서 유지) */
  questions: import('../../../../shared/agent-events').AgentQuestion[]
}

// ── 도구 카드 상태 ─────────────────────────────────────────────────────────────

export type ToolCardStatus = 'running' | 'done' | 'error'

export interface ToolCard {
  /** tool_call id (tool_result 매칭용) */
  id: string
  /** 도구 이름 (예: 'bash') */
  name: string
  /** 도구 입력 인자 */
  input: unknown
  /** 실행 상태 */
  status: ToolCardStatus
  /** 실행 결과 (tool_result 수신 후 채워짐) */
  result?: unknown
}

// ── AppState ───────────────────────────────────────────────────────────────────

export interface AppState {
  /** 현재 실행 중인 runId (null이면 미실행) */
  currentRunId: string | null

  // ── Phase A-2: thread 단일 스트림 인터리브 ──────────────────────────────────
  /**
   * 시간순 단일 스트림 thread.
   * user msg → assistant 텍스트 버블 → 도구그룹 → assistant 텍스트 버블 순 인터리브.
   * 원본 AgentCodeGUI session.ts 'messages' 역할(ThreadItem union 기반).
   */
  thread: ThreadItem[]
  /**
   * 현재 열려 있는 toolgroup id.
   * tool_call 이벤트에서 새 그룹 생성 또는 기존 그룹 append 판단에 사용.
   * text 이벤트에서 null(그룹 닫기) → 다음 tool_call이 새 그룹 시작.
   * done/error에서도 null.
   */
  openGroupId: string | null
  /**
   * 현재 열려 있는 assistant msg id.
   * text 이벤트에서 동일 id msg에 append.
   * tool_call 이벤트에서 null(텍스트 버블 닫기) → 다음 text가 새 버블 시작.
   * done/error에서도 null.
   */
  openMsgId: string | null
  /**
   * 단조 증가 시퀀스 카운터. 합성 id 생성에 사용.
   * makeInitialState: 0.
   */
  seq: number

  /** AI가 변경한 파일 경로 set */
  changedFiles: Set<string>
  /**
   * 파일별 diff 요약 + 라인 목록 (Phase B).
   * 키 = toolId(도구 tool_use id). path는 워크스페이스 상대 POSIX라
   * 절대경로 도구 입력과 키가 어긋남 → toolId로 카드별 정확 매칭.
   * toolId 없으면 path 폴백.
   */
  fileDiffs: Record<string, FileDiffEntry>
  /** 에이전트 실행 중 여부 */
  isRunning: boolean
  /** 마지막 토큰 사용량 (done 이벤트 수신 시 업데이트) */
  lastUsage?: TokenUsage
  /**
   * SDK가 보고한 실 컨텍스트 윈도우 크기(토큰). Phase 21c.
   */
  lastContextWindow?: number
  /**
   * 엔진 세션 ID — 턴 간 맥락 복구용 (Phase 1, REPL_TRANSITION).
   * session 이벤트(system/init의 session_id)에서 설정. 다음 agentRun에 resumeSessionId로 전달.
   * 휘발(영속 X — snapshotForPersist 미포함). clearConversation/makeInitialState에서 리셋.
   */
  sessionId?: string
  /**
   * 활성 루프(내장 /loop·/schedule 크론) 전체 — REPL 진행 표시(5c).
   * loops 이벤트(어댑터 Cron 추적)로 갱신. 빈 배열=활성 루프 없음(표시 제거).
   * 휘발(영속 X). makeInitialState/clearConversation에서 리셋.
   */
  activeLoops: LoopInfo[]
  /**
   * 루프 정지 확인 표시(LR3-06 정지 신뢰 피드백 — 영호 육안 피드백 2026-07-03).
   * abort로 활성 루프를 끊은 직후 true — "예약된 반복이 세션과 함께 정리됨" 확인 배너.
   * 해제: ✕ 닫기 / 새 전송 / loops(비어있지 않음) 수신. 휘발(영속 X).
   */
  loopsStoppedNotice: boolean
  /** 에러 메시지 (error 이벤트 수신 시 설정) */
  errorMessage?: string
  /**
   * 에이전트 사고 과정(extended thinking) 텍스트 (Phase 24a).
   */
  thinkingText: string | null
  /**
   * 에이전트 작업목록(TodoWrite) 전체 스냅샷 (Phase 24a).
   */
  todos: TodoItem[]
  /**
   * 서브에이전트 목록 (Phase 24b).
   */
  subagents: SubAgentInfo[]
  /**
   * 사용자 응답 대기 중인 권한 요청 (Phase 24c).
   */
  pendingPermission: PendingPermission | null
  /**
   * 사용자 응답 대기 중인 질문 요청 (Phase 24d).
   */
  pendingQuestion: PendingQuestion | null

  /**
   * 진행 중인 슬래시 커맨드 카드 추적 (M6 Phase 34).
   * begin-command 시 설정, done/error 시 클리어.
   * CRITICAL: makeInitialState에 미포함(undefined) — 영속/복원 제외.
   * beforeMsgs: begin 시점의 msg kind 항목 수(compact sub 동적 생성용).
   * turns(LR2-03): goal 카드 턴 카운트 — 새 assistant msg 생성마다 증가
   *   (실측: /goal은 턴마다 messageId 증가 — goal-event-probe). goal 외 커맨드는 미사용.
   * detail(FB2 P08): begin 시점의 커맨드 인자(goal 목표 텍스트) — cmdresult 카드의 sub와
   *   같은 값을 pendingCommand에도 실어, LoopStatusBanner(컴포저 위 상시 카드)가 thread를
   *   뒤지지 않고도 "작업 주제"(3단 위계 2번째)를 바로 읽을 수 있게 한다. goal 외 커맨드는 미사용.
   */
  pendingCommand?: { name: string; cardId: string; beforeMsgs: number; turns?: number; detail?: string | null } | null

  /**
   * 백엔드 지속 펌프가 방출하는 자율(cron-origin) 연속 턴 실상태(LR4 P05,
   * agent-events.ts AgentEventAutonomyStatus). goal 배너 가시성의 게이트 — 종전
   * 낙관 플래그(pendingCommand.name==='goal')는 조기발동(요청 즉시 켜짐)·미해제
   * (조용한 사멸 후 안 꺼짐) 두 결함이 있었다(handleAutonomyStatus 참조).
   * true='active' 신호 수신 후, false=기본값 또는 'ended' 신호 수신 후·터미널 정리.
   * 휘발(영속 X — snapshotForPersist/디스크 영속 미포함, activeLoops/loopsStoppedNotice와
   * 동일 관례). makeInitialState/clearConversation에서 리셋.
   */
  autonomyActive: boolean

  /**
   * BL1 P03(stale-watchdog, LR4-DONE:76 잔여 4번) — 마지막 "활동" AgentEvent 수신 시각
   * (epoch ms). applyAgentEvent가 store/staleWatchdog.ts의 isActivityEvent 목록에 해당하는
   * 이벤트를 nowMs와 함께 수신할 때만 갱신(순수성 유지 — reducer는 Date.now() 직접 호출 0,
   * 구독 레이어가 stamp해 넘긴다). null=활동 신호 아직 없음(런 시작 전).
   * 컴포넌트 로컬이 아니라 상태 자체에 보관해 화면 전환·언마운트에도 값이 유지된다.
   * 휘발(영속 X) — activeLoops/autonomyActive와 동일 관례.
   */
  lastActivityAt: number | null
  /**
   * stale-watchdog가 임계(GOAL_BANNER_STALE_THRESHOLD_MS) 초과를 판정하면 true — goal 배너를
   * "신호 없음" 변형(goal-stale)으로 전환한다(lib/loopStatus.ts resolveLoopStatus). 새 활동
   * 신호 도착 시(reducer가) 자동 false로 복귀. autonomyActive는 건드리지 않는다 — 자동 강제
   * 해제 금지(오탐 시 진행 중 배너 자체가 사라지는 것을 막는 보수적 설계).
   */
  bannerStale: boolean
  /**
   * 사용자가 stale 배너를 수동으로 닫았는지 — 이 플래그로만 표시를 숨긴다(자동 강제 해제
   * 금지). 새 활동 신호 도착 시 자동 false로 복귀(정상 goal 배너로 돌아옴).
   */
  staleDismissed: boolean

  /**
   * goal 표시 수명 일원화(BL1 후속, 2026-07-13): `/goal` 자율 반복의 지속 진행 컨텍스트.
   * pendingCommand와 달리 handleDone(턴 경계)에서 절대 소멸·리셋되지 않는다 — begin-command
   * 시점(점등, 낙관적)에 생성되고, 종료 신호(autonomy_status status:'ended' · error ·
   * abort/dead-run 터미널 리셋)에서만 소멸(소등)한다.
   *
   * 배경: `autonomy_status active`는 claudeAgentRun.ts `_runPersistentPump`의 유예-흡수
   * 경로(idle-close grace 중 continuation 도착)에서만 방출되고, 단발(비-REPL) 세션의
   * `_runPump`에는 그 방출 지점 자체가 없다(F-B 중간 done 보류가 여러 turn을 하나로
   * 뭉갠다) — 그 결과 `/goal`이 실제로 진행 중인데도 이 신호가 한 번도 오지 않는
   * 경로가 실측됐다(2026-07-13 10:18 goal, 카드 턴수는 5턴까지 증가했지만 배너/gloss
   * 미표시). resolveLoopStatus(lib/loopStatus.ts)의 가시성·내용 게이트를 autonomyActive
   * (LR4 P05)에서 이 필드로 교체해 신호 유무와 무관하게 정상 표시되도록 한다.
   *
   * turns: pendingCommand.turns와 동일 트리거(신규 assistant msg 경계, reducer/text.ts
   *   handleText)로 병렬 증가하되, pendingCommand가 handleDone에 의해 null이 된 뒤에도
   *   계속 증가한다(카드-배너 단일 진실원 관계는 pendingCommand/cmdresult 카드 쪽에서
   *   불변 — 이 필드는 배너 전용 병렬 소스).
   * detail: begin 시점의 목표 텍스트(펜딩커맨드 detail과 동일 소스) — 종료까지 불변.
   * startedAt: begin 시점 epoch ms(구독 레이어가 stamp — reducer 순수성 유지, BeginCommandAction
   *   nowMs 경유). 표시용 소스(현재 어떤 소비처도 직접 렌더하지 않음 — 향후 확장 여지).
   *
   * autonomyActive 필드 자체는 폐기하지 않는다(핸들러·터미널 리셋 로직 보존) — 가시성
   * 게이트에서만 제외된다(다른 소비처: lib/stopAction.ts는 pendingCommand를 직접 참조해
   * 이 변경과 무관).
   *
   * 휘발(영속 X) — activeLoops/autonomyActive와 동일 관례. makeInitialState/clearConversation
   * 에서 리셋.
   */
  goalRun: { detail: string | null; turns: number; startedAt: number } | null

  /**
   * GAP1 P04(턴 신뢰성 신호, S-02): API 재시도 진행 신호 — `api_retry` 이벤트
   * (SDKAPIRetryMessage) 수신 시 그대로 세팅(누적/병합 없음 — 최신 통지가 진실).
   * 재시도 대기 동안은 다른 AgentEvent가 전혀 오지 않아 UI가 "멈춘 것처럼" 보이는 문제를
   * 인디케이터(LoopStatusBanner 재사용 변형)로 봉합하는 소스. null=재시도 신호 없음(기본).
   * clear: 다음 실제 산출물(text) 또는 턴 종료(done/error)에서 null로 되돌린다(reducer/
   * text.ts handleText, reducer/lifecycle.ts handleDone/handleError) — 재시도가 성공해
   * 정상 진행이 재개됐거나 턴 자체가 끝났다는 뜻이라, 낡은 인디케이터가 남으면 오정보가 된다.
   * 휘발(영속 X) — activeLoops/autonomyActive와 동일 관례.
   * 필수(`:`) — GAP1 P04b(reviewer 🟡① 봉합): autonomyActive/goalRun 등 형제 필드와 동일하게
   * required로 조인다(계약 견고성 — makeInitialState가 이미 null을 채우므로 정합 유지).
   * 기존 AppState mock 콜레터럴(m3-persist-multiworkspace.test.tsx 등 tests 영역 — renderer
   * 워커 편집 범위 밖)은 qa Worker가 병렬로 3필드를 추가해 봉합한다(GAP1 P04b Wave2).
   */
  apiRetry: { attempt: number; maxRetries: number; retryDelayMs: number } | null

  /**
   * GAP1 P04(S-01): 컨텍스트 컴팩션/API 요청 진행 상태 — `compact`(kind:'status') 이벤트
   * (SDKStatusMessage) 반영. 'compacting'=컨텍스트 압축이 실제 진행 중(표시 대상) ·
   * 'requesting'=API 요청이 왕복 중(컴팩션 여부와 무관하게 나타날 수 있어 소음이 크다 —
   * 필드 자체는 두 상태 모두 보존하되 표시는 소비측이 'compacting'만 선택, sdk.d.ts:4128
   * 계약 주석 근거) · null=진행 상태 해제. status===null 수신 시 반드시 null로 clear한다
   * (진행 중 고착 방지 — 이 계약이 store-shape 필수 조건).
   * 휘발(영속 X). 안전망: handleDone/handleError(턴 종료)에서도 null로 되돌려, status:null
   * 통지가 유실돼도 다음 턴에 '압축 중' 배너가 잘못 이어지지 않게 한다.
   * 필수(`:`) 전환 사유는 apiRetry와 동일(GAP1 P04b — qa Worker가 tests mock 병렬 봉합).
   */
  compacting: 'compacting' | 'requesting' | null

  /**
   * GAP1 P04(S-05): SDK 실행 상태 권위 신호 — `session_state` 이벤트
   * (SDKSessionStateChangedMessage) 반영. 'idle'|'running'|'requires_action' 그대로 저장.
   * 이 신호는 옵트인 환경변수(CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1)에서만 방출되므로
   * (agent-events.ts AgentEventSessionState 계약 주석) 미수신 세션이 존재할 수 있다 —
   * 소비측(표시)은 이 필드 없이도(null 고정) 완전해야 한다(보강 전용, 필수 아님).
   * 휘발(영속 X). 필수(`:`) 전환 사유는 apiRetry와 동일(GAP1 P04b — qa Worker가 tests mock
   * 병렬 봉합). handleDone/handleError에서도 null로 clear한다(GAP1 P04b 🟡③ 봉합 — 턴 종료
   * 후 stale 'running' 잔상 방지, apiRetry/compacting과 동일 안전망).
   */
  sdkSessionState: 'idle' | 'running' | 'requires_action' | null

  /**
   * GAP1 P05(훅 콕핏): 훅 생명주기 타임라인 — `hook_lifecycle` 이벤트(SDKHookStartedMessage/
   * SDKHookResponseMessage/SDKHookProgressMessage, agent-events.ts:680) 반영. phase='started'
   * 수신 시 hookId로 엔트리 1건 추가('running'), 동일 hookId phase='response' 수신 시 그
   * 엔트리를 in-place 갱신(엔트리 개수 불변 — 페어링 upsert, reducer/cockpit.ts
   * handleHookLifecycle 참조). cap 200 — 초과분은 오래된 것부터 드롭(소음/메모리 바운드,
   * pin-injector 매입력 발화가 세션 내내 누적될 수 있어 무한 성장 방지).
   * 휘발(영속 X) — apiRetry/compacting과 동일 관례. makeInitialState/clearConversation에서
   * []로 리셋. 소비: HookTimeline(components/07_notice/) 접힘 요약 + 펼침 상세.
   */
  hookRuns: HookRun[]
}

/**
 * HookRun — 훅 실행 1건의 타임라인 엔트리 (GAP1 P05 store-shape 계약, coordinator 고정).
 * hookId가 started↔response 페어링 키(hook_lifecycle 이벤트와 동일 상관관계 키).
 */
export interface HookRun {
  hookId: string
  hookName: string
  hookEvent: string
  status: 'running' | 'success' | 'error' | 'cancelled'
  exitCode?: number
  stdout?: string
  stderr?: string
  output?: string
  time?: string
}

// ── 로컬 액션 (M6: begin-command) ─────────────────────────────────────────────

/**
 * BeginCommandAction — 슬래시 커맨드 begin 로컬 액션 타입 (M6).
 *
 * time은 액션 생성 시점에 주입(nowTime() 호출은 컴포넌트/훅에서) — reducer 순수성 유지.
 * begin-command → thread에 cmdresult running 카드 push + pendingCommand 기록.
 *
 * CRITICAL:
 *   - nowTime() 직접 호출 0 (time은 액션 경유).
 *   - openMsgId=null, openGroupId=null (인터리브 포인터 정합).
 *   - seq 불변 (합성 id 카운터 불변 — cardId는 호출자가 제공).
 */
export interface BeginCommandAction {
  type: 'begin-command'
  name: string
  cardId: string
  time: string
  /**
   * 커맨드 인자 표시 텍스트 (LR2-03 — goal 카드의 목표 텍스트).
   * 전달 시 카드 초기 sub로 사용(미전달 → CMD_CARDS[name].sub 기존 거동).
   * renderer 로컬 액션 확장 — IPC/shared 계약 무관.
   */
  detail?: string | null
  /**
   * goal 표시 수명 일원화(BL1 후속): begin 시점 epoch ms — name==='goal'일 때
   * goalRun.startedAt에 그대로 실린다. W7 time/BL1 P03 nowMs와 동일 관례(구독/액션
   * 레이어가 stamp, reducer는 받은 값만 사용 — 순수성 유지). 미전달 시 0(테스트
   * 하위호환 폴백 — startedAt을 검증하지 않는 기존 호출부 무영향).
   */
  nowMs?: number
}
