/**
 * ipc/conversation.ts — 대화 영속 도메인 채널·타입 계약
 *
 * 채널: CONVERSATION_LOAD · CONVERSATION_SAVE · CONVERSATION_DELETE · CONVERSATION_RENAME
 * 구현 위치: main-process 담당 (이 파일은 *정의*만 — 핸들러 로직 없음).
 */

import type { TokenUsage, SubAgentInfo } from '../agent-events'
import type { BackendId } from './common'
import type { ConversationMessage } from './agent'

// ── 채널명 상수 ──────────────────────────────────────────────────────────────

export const CONVERSATION_CHANNELS = {
  /** 대화 히스토리 로드 (invoke) */
  CONVERSATION_LOAD: 'conversation.load',
  /** 대화 히스토리 저장 (invoke) */
  CONVERSATION_SAVE: 'conversation.save',
  /** 대화 삭제 (invoke — id로 영구 삭제). 세션 CRUD(M4-3) */
  CONVERSATION_DELETE: 'conversation.delete',
  /**
   * 대화 제목 변경 (invoke). 사용자 지정 제목은 이후 자동 재제목이 덮지 않는다
   * (store가 custom-title로 보존). 세션 CRUD(M4-3)
   */
  CONVERSATION_RENAME: 'conversation.rename',
} as const

// ── 서브에이전트 영속 (CP1 — 단일챗 전용) ─────────────────────────────────────

/**
 * 영속화된 서브에이전트 스냅샷 — `ConversationRecord.subagents` 항목.
 * `SubAgentInfo`(agent-events.ts canonical)를 그대로 상속(displayName·model·transcript·tools
 * 재나열 금지 — extends로 자동 상속) + 위치 앵커 `afterMessageIndex`만 추가.
 *
 * `messages` 배열과 분리된 사이드카로 저장한다(모델 컨텍스트 무개입 = ADR-024 정합 —
 * 표시용 복원이지 SDK로 재주입되는 대화 맥락이 아니다).
 */
export interface PersistedSubAgent extends SubAgentInfo {
  /**
   * 이 서브에이전트 마커보다 앞에 위치한 `kind === 'msg'` 항목의 개수(0-based).
   * thread 렌더링 시 이 인덱스 뒤에 서브에이전트 카드를 삽입해 원래 위치를 복원한다.
   */
  afterMessageIndex: number
}

/**
 * 서브에이전트 영속 상한 — untrusted 입력(renderer→main) sanitize 시 이 값으로 절삭한다.
 * main의 `sanitizeSubagents`가 실제 검증/절삭을 수행(이 계약은 상한 *정의*만).
 */
export const SUBAGENT_PERSIST_LIMITS = {
  /** 대화당 최대 서브에이전트 개수 */
  maxSubagents: 30,
  /** 서브에이전트당 최대 transcript 항목 수 */
  maxTranscriptItems: 100,
  /** transcript 항목/activity 텍스트 최대 문자 수 (기존 orchestration script cap 관례 재사용) */
  maxTextChars: 4096,
  /** 서브에이전트당 최대 tools 항목 수 */
  maxTools: 200,
} as const

// ── 대화 레코드 ───────────────────────────────────────────────────────────────

/** 영속화된 대화 레코드 (JSON 파일 — ADR-006 sqlite superseded) */
export interface ConversationRecord {
  /** 대화 고유 ID */
  id: string
  /** 대화 제목 (자동 생성 또는 사용자 지정) */
  title: string
  /** 메시지 목록 */
  messages: ConversationMessage[]
  /** 사용된 백엔드 ID */
  backendId: BackendId
  /** 생성 시각 (ISO 8601) */
  createdAt: string
  /** 마지막 수정 시각 (ISO 8601) */
  updatedAt: string
  /**
   * 이 대화가 앵커된 작업 폴더(워크스페이스 절대경로). (ADR-020)
   * 대화 전환 시 이 폴더로 워크스페이스 복원(main이 재검증·실패 시 전역 유지 graceful).
   * 미설정(기존 대화/마이그레이션 전)이면 undefined → 전역 workspaceRoot 폴백.
   *
   * CRITICAL(신뢰경계): 경로 문자열(시크릿 아님). 자동복원은 workspace.open 핸들러
   *   재사용으로 isAbsolute+existsSync+isDirectory 재검증(임의 경로 무확인 open 금지).
   *   main이 검증 실패 시 전역 workspaceRoot를 유지하며 graceful하게 처리한다.
   *   renderer는 이 값을 표시 목적(현재 대화 작업폴더 안내)으로만 사용해야 한다.
   */
  cwd?: string
  /**
   * 엔진 세션 ID — 턴 간 맥락 복구용 (Phase 1.5, REPL_TRANSITION).
   * 대화의 마지막 session 이벤트(system/init의 session_id). 대화 로드 시 state.sessionId로
   * 복원 → 다음 메시지가 resumeSessionId로 되돌려 보내 **앱 재시작 후에도 맥락 resume**.
   *
   * CRITICAL(신뢰경계·ADR-003): 불투명 세션 토큰(string)만. 시크릿 아님(식별자) — 평문 영속 가능.
   *   `resume` 옵션 매핑은 backend 내부. 미설정(기존 대화) → undefined → 새 세션(회귀 0).
   */
  sessionId?: string
  /**
   * 마지막 턴의 컨텍스트 창 사용 토큰(게이지 표시용). result.modelUsage.contextWindow 유래.
   * 대화 로드 시 state.lastContextWindow로 복원 → **재시작 후에도 컨텍스트 게이지 즉시 표시**
   * (resume은 맥락만 복원하고 게이지는 다음 턴 result 전까지 비므로 별도 영속 필요).
   * 표시 전용 메타(시크릿 아님). 미설정/유효하지 않으면 undefined(회귀 0). 멀티 패널 PanelThreadSnapshot 미러.
   */
  lastContextWindow?: number
  /** 마지막 턴 토큰 사용량(표시 전용). lastContextWindow와 함께 영속·복원. */
  lastUsage?: TokenUsage
  /**
   * 서브에이전트 스냅샷 목록 (CP1, additive). **단일챗 전용** — 멀티패널
   * `PanelThreadSnapshot`은 이 필드의 범위 밖(후속 마일스톤에서 별도 이관).
   *
   * CRITICAL(신뢰경계): renderer→main 저장 요청 시 이 배열은 untrusted 입력이다.
   *   main이 `sanitizeSubagents`로 shape·상한(`SUBAGENT_PERSIST_LIMITS`)을 검증·절삭할
   *   책임을 진다 — 이 계약은 타입만 정의하고 검증은 하지 않는다.
   *
   * 복원은 **표시용**이다(ADR-024): 대화 로드 시 UI에 서브에이전트 카드를 되살리는
   * 용도일 뿐, SDK 세션에 서브에이전트 실행 컨텍스트를 재주입하지 않는다(재주입은
   * `sessionId`의 `resume` 경로가 담당하는 별개 관심사).
   *
   * 미설정(기존 대화/마이그레이션 전) → undefined → 서브에이전트 없이 로드(회귀 0).
   * `cwd?`·`sessionId?` 선례를 따라 버전 필드 신설 없이 graceful optional로 확장한다.
   */
  subagents?: PersistedSubAgent[]
  /**
   * 대화별 REPL 지속세션(ADR-024) 토글 — 전역 단일 필드에서 이관(LR4 P07).
   * true = held-open persistent 세션(AgentRunRequest.persistent로 매핑). false = 단발 query.
   *
   * 미설정(기존 대화/마이그레이션 전) → undefined → 로드 시 renderer가 전역 pref
   * 마이그값→기본 true로 폴백한다(회귀 0). `sessionId?`·`subagents?` 선례를 따라
   * 버전 필드 신설 없이 graceful optional로 확장한다. 시크릿 아님(단순 boolean).
   */
  replMode?: boolean
  /**
   * 대화별 선택 모델 id (composer picker `MODELS` id: 'opus'|'sonnet'|'fable'|'haiku' 등).
   * 대화 로드 시 컴포저 모델 picker 복원용. 미설정(옛 대화/마이그레이션 전) → undefined →
   * 로드 시 renderer가 DEFAULT_MODEL로 폴백(회귀 0). `sessionId?`·`replMode?` 선례를 따라
   * 버전 필드 신설 없이 graceful optional로 확장한다. 시크릿 아님(모델 식별 문자열).
   */
  model?: string
}

// ── conversation.load ─────────────────────────────────────────────────────────

/** `conversation.load` 요청 */
export interface ConversationLoadRequest {
  /**
   * 불러올 대화 ID.
   * undefined면 최근 대화 목록을 반환 (limit 적용).
   */
  id?: string
  /** id 미지정 시 반환할 최대 개수 (default: 20) */
  limit?: number
}

/** `conversation.load` 응답 */
export interface ConversationLoadResponse {
  /**
   * 불러온 대화 목록.
   * id 지정 시 길이 0 또는 1.
   */
  conversations: ConversationRecord[]
}

// ── conversation.save ─────────────────────────────────────────────────────────

/** `conversation.save` 요청 */
export interface ConversationSaveRequest {
  /**
   * 저장할 대화.
   * id가 있으면 upsert(update or insert), 없으면 신규 생성.
   */
  conversation: Omit<ConversationRecord, 'createdAt' | 'updatedAt'> & {
    id?: string
  }
}

/** `conversation.save` 응답 */
export interface ConversationSaveResponse {
  /** 저장된 대화의 ID (신규 생성 시 생성된 ID) */
  id: string
}

// ── conversation.delete (세션 CRUD — M4-3) ───────────────────────────────────

/** `conversation.delete` 요청 */
export interface ConversationDeleteRequest {
  /** 삭제할 대화 ID (untrusted — main이 타입·존재 검증) */
  id: string
}

/** `conversation.delete` 응답 */
export interface ConversationDeleteResponse {
  /** 삭제 성공 여부 (없는 id면 false) */
  ok: boolean
}

// ── conversation.rename (세션 CRUD — M4-3) ───────────────────────────────────

/** `conversation.rename` 요청 */
export interface ConversationRenameRequest {
  /** 이름 변경할 대화 ID (untrusted) */
  id: string
  /** 새 제목 (untrusted — main이 타입 검증·trim). 사용자 지정으로 보존된다. */
  title: string
}

/** `conversation.rename` 응답 */
export interface ConversationRenameResponse {
  /** 변경 성공 여부 (없는 id면 false) */
  ok: boolean
}
