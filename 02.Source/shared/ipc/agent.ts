/**
 * ipc/agent.ts — 에이전트 실행 도메인 채널·타입 계약
 *
 * 채널: AGENT_RUN · AGENT_ABORT · AGENT_INTERRUPT · AGENT_TASK_STOP · AGENT_SET_MODE
 *       AGENT_EVENT · PERMISSION_RESPOND · QUESTION_RESPOND
 * 구현 위치: main-process 담당 (이 파일은 *정의*만 — 핸들러 로직 없음).
 */

import type { AgentEvent } from '../agent-events'
import type { BackendId } from './common'

// ── 채널명 상수 ──────────────────────────────────────────────────────────────

export const AGENT_CHANNELS = {
  /** 에이전트 대화 실행 시작 (invoke — 실행 ID 반환, 이벤트는 AGENT_EVENT로) */
  AGENT_RUN: 'agent.run',
  /** 진행 중인 에이전트 실행 중단 — 세션 종료 (invoke) */
  AGENT_ABORT: 'agent.abort',
  /** 현재 turn만 중단 — 세션 유지 (REPL 지속세션 정지, invoke) */
  AGENT_INTERRUPT: 'agent.interrupt',
  /** 백그라운드 태스크 1개 정지 — run은 유지 (P09 bg_task 정지 버튼, invoke) */
  AGENT_TASK_STOP: 'agent.taskStop',
  /** 진행 중 세션의 권한 모드 라이브 전환 (GAP1 P13, invoke) */
  AGENT_SET_MODE: 'agent.setMode',
  /**
   * main → renderer 스트리밍 이벤트 (event형 — ipcRenderer.on).
   * 구독은 preload의 onAgentEvent helper를 통해서만.
   */
  AGENT_EVENT: 'agent.event',
  /**
   * 권한 요청에 대한 사용자 응답 전송 (invoke).
   * renderer가 PermissionModal 선택 후 호출 → main이 대기 중인 에이전트에 응답을 전달.
   * 응답: { ok: boolean }.
   */
  PERMISSION_RESPOND: 'agent.permissionRespond',
  /**
   * 질문 요청에 대한 사용자 응답 전송 (invoke).
   * renderer가 QuestionModal 응답/dismiss 후 호출 → main이 대기 중인 에이전트에 응답을 전달.
   * 응답: { ok: boolean }.
   */
  QUESTION_RESPOND: 'agent.questionRespond',
} as const

// ── 공통 메시지 타입 ──────────────────────────────────────────────────────────

/** 대화 메시지 역할 */
export type MessageRole = 'user' | 'assistant'

/** 대화 메시지 단위 */
export interface ConversationMessage {
  role: MessageRole
  /** 텍스트 내용 */
  content: string
}

// ── agent.run ─────────────────────────────────────────────────────────────────

/** `agent.run` 요청 — 에이전트 대화 실행 시작 */
export interface AgentRunRequest {
  /**
   * 대화 히스토리.
   * 마지막 메시지가 현재 user 입력이어야 한다.
   */
  messages: ConversationMessage[]
  /**
   * 사용할 백엔드 엔진 ID.
   * undefined면 registry가 자동 선택.
   */
  backendId?: BackendId
  /** 워크스페이스 루트 절대 경로 (에이전트 CWD 설정용) */
  workspaceRoot?: string
  /**
   * 모델 picker id (pickerOptions MODELS: 'opus'|'sonnet'|'haiku'|'fable').
   * CRITICAL(신뢰경계): renderer untrusted — main(run-args)이 allowlist 검증 후에만
   * `--model` 인자화. 미전달/미지 id → CLI 기본값(플래그 생략). (M4-1)
   */
  model?: string
  /**
   * effort picker id ('max'|'xhigh'|'high'|'medium'|'low'|'minimal').
   * 모델 의존(haiku 미지원·sonnet xhigh→high 클램프·minimal 생략) — run-args가 처리. untrusted. (M4-1)
   */
  effort?: string
  /**
   * 권한 모드 picker id ('normal'|'plan'|'acceptEdits'|'auto'|'bypass') → `--permission-mode`.
   * untrusted — run-args allowlist 검증. (M4-1)
   */
  mode?: string
  /**
   * 패널/채팅별 커스텀 시스템 프롬프트 (Phase 30 M2 — 원본 AgentCodeGUI sysPrompt 미러).
   *
   * CRITICAL(신뢰경계): renderer untrusted 입력.
   *   - IPC 계약에서는 **string만 운반** — SDK 고유 형상(preset/append)은 backend 내부에만.
   *   - main 핸들러가 trim → 빈 체크 → 길이 cap(16000자) 정규화 수행.
   *   - 로그·DB·응답에 내용을 평문으로 출력하지 않는다.
   *   - 모델 컨텍스트(SDK systemPrompt.append)로만 주입 — CLI 인자/파일경로/셸 누수 금지.
   *
   * 미전달 또는 빈문자열/공백만 → backend가 기존 preset({type:'preset',preset:'claude_code'}) 그대로.
   * 유효 string → backend가 append 필드로 추가: {type:'preset',preset:'claude_code',append:value}.
   */
  systemPrompt?: string
  /**
   * 멀티에이전트 오케스트레이션 모드 토글 (Phase 37 #4a).
   * 사용자가 채팅 입력창 토글을 켜면 그 run에서만 오케스트레이션 도구 사용을 허용한다.
   *
   * 엔진별 매핑(어떤 SDK 옵션·플래그로 변환되는지)은 backend 내부에서만 결정한다.
   *
   * CRITICAL(신뢰경계): renderer untrusted boolean 입력.
   *   main 핸들러가 `=== true` 로 정규화 후 backend에 전달한다.
   */
  orchestration?: boolean
  /**
   * 턴 간 맥락 복구용 세션 ID (Phase 1, REPL_TRANSITION).
   *
   * 같은 대화의 직전 턴이 emit한 `session` 이벤트(AgentEvent type:'session')의 sessionId를
   * renderer가 대화/패널별로 저장했다가 다음 agentRun에 되돌려 보낸다. backend가 이 값으로
   * 엔진 세션을 resume해 직전 대화 맥락을 복원한다.
   *
   * CRITICAL(신뢰경계·ADR-003): renderer untrusted 불투명 토큰(string)만 운반. `resume`
   *   옵션으로의 매핑은 backend(ClaudeCodeBackend) 내부에만. 미전달/빈 → resume 없이 새 세션.
   */
  resumeSessionId?: string
  /**
   * 지속세션(REPL, ADR-024) 옵트인 — 대화별 held-open 세션 모드. (Phase 2)
   *
   * true → backend가 held-open 세션을 열고 메시지를 입력 스트림에 push(매 턴 새 query 아님).
   *   내장 `/loop`·크론 자기제어 가능. false/미전달 → 기존 단발 query()-per-message(회귀 0).
   *
   * CRITICAL(신뢰경계): renderer untrusted boolean. main 핸들러가 `=== true` 정규화.
   *   엔진별 매핑(streamInput 등)은 backend 내부에만(ADR-003).
   */
  persistent?: boolean
  /**
   * 지속세션 식별 키(persistent와 함께, 보통 conversationId). (Phase 2)
   *
   * 같은 sessionKey의 후속 agentRun은 기존 held-open 세션에 push된다(새 세션 아님).
   * CRITICAL(신뢰경계): renderer untrusted string. 미전달 시 persistent여도 단발 degrade(회귀 0).
   */
  sessionKey?: string
}

/**
 * 모델 picker id → 컨텍스트 윈도우(토큰). 토큰 게이지(M4-1)의 분모.
 *
 * 키 = pickerOptions MODELS id (run-args KNOWN_MODELS와 동일 집합 — 드리프트 금지).
 * 권위 확인(claude-code-guide, 2026-06-23): Opus4.8/Sonnet5/Fable5=1M · Haiku4.5=200K.
 * picker의 display `ctx`는 별개 표시값 — 게이지는 이 권위 window를 사용.
 */
export const MODEL_CONTEXT_WINDOW: Record<string, number> = {
  opus: 1_000_000,
  sonnet: 1_000_000,
  fable: 1_000_000,
  haiku: 200_000
}

/** 토큰 게이지 fallback — model 미전달/미지 모델 시 사용(게이지 미파손). */
export const DEFAULT_CONTEXT_WINDOW = 1_000_000

/** `agent.run` 응답 — 실행 핸들 ID (abort·이벤트 매칭용) */
export interface AgentRunResponse {
  /** 실행 고유 ID. AGENT_EVENT 이벤트의 runId와 대응. */
  runId: string
}

// ── agent.abort ───────────────────────────────────────────────────────────────

/** `agent.abort` 요청 */
export interface AgentAbortRequest {
  /** 중단할 실행 ID */
  runId: string
}

/** `agent.abort` 응답 */
export interface AgentAbortResponse {
  /** 중단 요청 수락 여부 (이미 완료된 runId면 false) */
  accepted: boolean
}

// ── agent.interrupt ───────────────────────────────────────────────────────────

/** `agent.interrupt` 요청 — 현재 turn만 중단(세션 유지, REPL ADR-024) */
export interface AgentInterruptRequest {
  /** turn을 중단할 실행 ID */
  runId: string
}

/** `agent.interrupt` 응답 */
export interface AgentInterruptResponse {
  /** 중단 요청 수락 여부 (미존재/완료 runId면 false) */
  accepted: boolean
}

// ── agent.taskStop ────────────────────────────────────────────────────────────

/**
 * `agent.taskStop` 요청 — 백그라운드 태스크 1개 정지 (P09, AgentInterrupt 미러).
 *
 * 경로: renderer 정지 버튼 → preload agentTaskStop → main 핸들러 →
 *       AgentRun.stopTask?.(taskId) → 엔진 어댑터(Claude: Query.stopTask).
 * 정지 *결과*는 별도 응답 이벤트가 아니라 기존 bg_task kind='notification'
 * (status 'stopped')으로 흐른다 — P03 계약 포함분.
 *
 * CRITICAL(신뢰경계): runId·taskId 는 renderer untrusted string 2개 —
 * main 핸들러가 존재 검증(미존재 runId/taskId → accepted:false, 임의 통과 0).
 */
export interface TaskStopRequest {
  /** 대상 에이전트 실행 ID */
  runId: string
  /** 정지할 백그라운드 태스크 ID (bg_task 이벤트의 taskId) */
  taskId: string
}

/** `agent.taskStop` 응답 */
export interface TaskStopResponse {
  /** 정지 요청 수락 여부 (미존재/완료 runId·taskId면 false) */
  accepted: boolean
}

// ── agent.setMode ─────────────────────────────────────────────────────────────

/**
 * `agent.setMode` 요청 — REPL 진행 중 세션의 권한 모드 라이브 전환 (GAP1 P13).
 *
 * 경로: renderer 모드 피커 → preload agentSetMode → main 핸들러 →
 *       AgentRun 모드 전환 위임 → 엔진 어댑터(Claude: Query.setPermissionMode).
 * 전환 *결과* 정본은 이 응답이 아니라 `permission_mode` 이벤트
 * (AgentEventPermissionMode — 엔진 측 상태 관찰 신호)로 흐른다 — taskStop 관례 미러.
 *
 * CRITICAL(신뢰경계): runId·mode 는 renderer untrusted string 2개 —
 * main 핸들러가 화이트리스트 4종('normal'|'plan'|'acceptEdits'|'auto') + runId 존재
 * 검증을 강제한다(CORE-01). 'bypass'·'dontAsk'는 라이브 전환 거부 — 세션 생성
 * 시에만 선택 가능(영호 박제 2026-07-14). 임의 문자열 무검증 통과 0.
 *
 * CRITICAL(ADR-003): mode 는 picker id 어휘('normal'|'plan'|'acceptEdits'|'auto'|...)
 * — SDK 모드('default' 등)로의 매핑은 어댑터 내부에만. 이 계약은 picker id 원문만 운반.
 */
export interface SetModeRequest {
  /** 대상 에이전트 실행 ID */
  runId: string
  /** 전환할 권한 모드 picker id — untrusted, main이 화이트리스트 검증(CORE-01) */
  mode: string
}

/** `agent.setMode` 응답 */
export interface SetModeResponse {
  /**
   * 전환 요청 수락 여부 — main의 검증(화이트리스트 4종·runId 존재) + 라우팅 수락.
   * 미존재/완료 runId·화이트리스트 밖 mode → false. 단, *활성 비지속(단발)* run은
   * 수락(true)되나 어댑터가 no-op으로 무시 — 라이브 전환은 persistent(REPL)
   * held-open 세션에서만 실동작(renderer replMode 게이트가 실경로에서 단발 호출을
   * 차단). 전환 *결과* 정본은 `permission_mode` 이벤트.
   */
  accepted: boolean
}

// ── agent.permissionRespond ───────────────────────────────────────────────────

/**
 * `agent.permissionRespond` 요청 — 권한 요청에 대한 사용자 선택 전송.
 *
 * runId: 대상 에이전트 실행 ID.
 * requestId: 대응하는 AgentEventPermissionRequest.requestId.
 * behavior: 'allow'=이번만 허용 · 'allow_always'=항상 허용 · 'deny'=거부.
 */
export interface PermissionResponse {
  /** 대상 에이전트 실행 ID */
  runId: string
  /** 대응하는 permission_request 의 requestId */
  requestId: string
  /** 사용자 선택: 이번만 허용 · 항상 허용 · 거부 */
  behavior: 'allow' | 'allow_always' | 'deny'
}

// ── agent.questionRespond ─────────────────────────────────────────────────────

/**
 * `agent.questionRespond` 요청 — 질문 요청에 대한 사용자 답변 전송.
 *
 * runId: 대상 에이전트 실행 ID.
 * requestId: 대응하는 AgentEventQuestionRequest.requestId.
 * answers: 각 질문에 대한 선택 라벨 배열의 배열(질문 순서 대응).
 *          null=사용자가 건너뜀(dismiss).
 *
 * answers 구조: answers[i] = i번째 질문에 대해 선택된 옵션 라벨 목록.
 * 단일 선택 시 길이 1, 복수 선택(multiSelect) 시 길이 ≥ 0.
 */
export interface QuestionResponse {
  /** 대상 에이전트 실행 ID */
  runId: string
  /** 대응하는 question_request 의 requestId */
  requestId: string
  /**
   * 각 질문에 대한 선택 라벨 배열의 배열 (질문 순서 대응).
   * null = 사용자가 건너뜀(dismiss).
   */
  answers: string[][] | null
}

// ── agent.event (event형 — main → renderer push) ──────────────────────────────

/**
 * `agent.event` IPC 이벤트 페이로드.
 * main이 ipcRenderer.on('agent.event', handler)를 통해 push.
 * preload의 onAgentEvent helper가 이를 래핑하여 노출.
 */
export interface AgentEventPayload {
  /** 이벤트를 발생시킨 실행 ID */
  runId: string
  /** 에이전트 이벤트 본문 */
  event: AgentEvent
}
