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
   */
  pendingCommand?: { name: string; cardId: string; beforeMsgs: number; turns?: number } | null
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
}
