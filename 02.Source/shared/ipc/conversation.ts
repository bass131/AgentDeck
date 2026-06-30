/**
 * ipc/conversation.ts — 대화 영속 도메인 채널·타입 계약
 *
 * 채널: CONVERSATION_LOAD · CONVERSATION_SAVE · CONVERSATION_DELETE · CONVERSATION_RENAME
 * 구현 위치: main-process 담당 (이 파일은 *정의*만 — 핸들러 로직 없음).
 */

import type { TokenUsage } from '../agent-events'
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

// ── 대화 레코드 ───────────────────────────────────────────────────────────────

/** DB에 저장된 대화 레코드 */
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
