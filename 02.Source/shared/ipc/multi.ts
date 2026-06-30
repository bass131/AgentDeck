/**
 * ipc/multi.ts — 멀티 에이전트 세션 영속 도메인 채널·타입 계약 (M3 — maStore.ts 미러)
 *
 * 채널: MULTI_SESSION_SAVE · MULTI_SESSION_LOAD
 * 구현 위치: main-process 담당 (이 파일은 *정의*만 — 핸들러 로직 없음).
 */

import type { TokenUsage } from '../agent-events'

// ── 채널명 상수 ──────────────────────────────────────────────────────────────

export const MULTI_CHANNELS = {
  /**
   * 멀티 에이전트 세션 상태 저장 (invoke).
   * 요청 PersistedMultiState. 응답 { ok: boolean }.
   *
   * CRITICAL(신뢰경계): state는 untrusted(renderer 입력) — main이 blob을 best-effort 저장.
   * 저장 시 검증 최소 — 읽기(LOAD) 시 cwd 재검증으로 보호(B2).
   * 구현: main-process multiStore.ts (userData/multi-agent.json 쓰기 + IPC 핸들러).
   * 소비: renderer MultiWorkspace 디바운스 저장.
   */
  MULTI_SESSION_SAVE: 'multi.save',
  /**
   * 멀티 에이전트 세션 상태 로드 (invoke).
   * 인자 없음. 응답 PersistedMultiState | null.
   *
   * CRITICAL(신뢰경계): 반환 전 각 panel.cwd를 isAbsolute+existsSync+isDirectory로
   * 재검증 — 실패 시 undefined drop(임의 경로 무확인 통과 0). 손상/version 불일치 → null.
   * 구현: main-process multiStore.ts (userData/multi-agent.json 읽기 + cwd 재검증).
   * 소비: renderer MultiWorkspace 마운트 복원.
   */
  MULTI_SESSION_LOAD: 'multi.load',
} as const

// ── 멀티 세션 타입 ────────────────────────────────────────────────────────────

/**
 * 영속용 메시지 레코드 — shared 자족 타입.
 *
 * CRITICAL(의존방향 B1): ThreadItem(renderer 타입) 대신 shared 자족 최소 타입.
 * 패널은 msg 버블만 렌더(MultiWorkspace L504 참조) — toolgroup/thinking은 영속/복원 불필요.
 * images: 첨부 이미지 data URL 또는 절대경로 배열(선택).
 */
export interface PersistedMsg {
  /** 메시지 고유 ID */
  id: string
  /** 메시지 역할 */
  role: 'user' | 'assistant'
  /** 메시지 텍스트 내용 */
  text: string
  /** 오류 메시지 여부 (선택) */
  error?: boolean
  /** 첨부 이미지 data URL 또는 절대경로 배열 (선택) */
  images?: string[]
}

/**
 * 영속용 Picker 상태 — shared 자족 타입.
 *
 * CRITICAL(의존방향 B1): PickerState(renderer 타입) 대신 shared 자족 직렬화용 타입.
 * model/effort/mode 세 필드만 — 렌더러 내부 파생값(컨텍스트 윈도우 등) 제외.
 */
export interface PersistedPicker {
  /** 모델 picker id (예: 'opus' | 'sonnet' | 'haiku' | 'fable') */
  model: string
  /** effort picker id (예: 'max' | 'high' | 'medium' | 'low') */
  effort: string
  /** 권한 모드 picker id (예: 'normal' | 'plan' | 'acceptEdits') */
  mode: string
}

/**
 * 패널 thread 스냅샷 — 영속 단위.
 *
 * messages: PersistedMsg[] — msg kind만 포함(toolgroup/thinking 제외).
 * seq: reducer seq 카운터 — 복원 시 id 충돌 방지를 위한 시드값.
 * lastUsage: 마지막 턴 토큰 사용량 (선택 — 표시용).
 * lastContextWindow: 마지막 컨텍스트 창 크기 (선택 — 게이지 표시용).
 *
 * TokenUsage는 src/shared/agent-events.ts에 이미 정의됨 — 재정의 금지.
 */
export interface PanelThreadSnapshot {
  /** 영속 메시지 목록 (msg kind만) */
  messages: PersistedMsg[]
  /** reducer seq 카운터 (복원 시 id 충돌 방지 시드) */
  seq: number
  /** 마지막 턴 토큰 사용량 (선택) */
  lastUsage?: TokenUsage
  /** 마지막 컨텍스트 창 크기 토큰 (선택) */
  lastContextWindow?: number
  /**
   * 엔진 세션 ID — 턴 간 맥락 복구용 (Phase 1.5 멀티 패널, REPL_TRANSITION).
   * 복원 시 send가 resumeSessionId로 되돌려 보내 **재시작 후에도 패널 맥락 resume**.
   * CRITICAL(신뢰경계·ADR-003): 불투명 세션 토큰(string)만. 시크릿 아님(식별자) — 평문 영속 가능.
   */
  sessionId?: string
}

/**
 * 단일 패널 영속 레코드.
 *
 * title: 패널 표시 제목.
 * cwd: 패널 작업 폴더 절대경로 (선택 — 재검증 필수).
 *   CRITICAL(신뢰경계): 복원 시 main이 isAbsolute+existsSync+isDirectory 재검증.
 *   실패 시 undefined drop → renderer가 전역 workspaceRoot 폴백.
 * picker: 모델/effort/모드 설정.
 * sysPrompt: 패널별 커스텀 시스템 프롬프트 (선택).
 * snapshot: 패널 thread 스냅샷 (선택 — 없으면 빈 초기상태).
 */
export interface PersistedPanel {
  /** 패널 표시 제목 */
  title: string
  /**
   * 패널 작업 폴더 절대경로 (선택).
   * CRITICAL(신뢰경계): main LOAD 핸들러가 isAbsolute+existsSync+isDirectory로 재검증.
   * 검증 실패 시 undefined → renderer 전역 workspaceRoot 폴백.
   */
  cwd?: string
  /** 모델/effort/모드 설정 */
  picker: PersistedPicker
  /** 패널별 커스텀 시스템 프롬프트 (선택) */
  sysPrompt?: string
  /** 패널 thread 스냅샷 (선택 — 없으면 빈 초기상태) */
  snapshot?: PanelThreadSnapshot
}

/**
 * 멀티 에이전트 세션 레코드 — sessions[] 봉투 항목.
 *
 * M3은 단일 활성 세션만 채움(sessions 길이 = 1).
 * sessions[] 봉투는 forward-compat — 후속 증분에서 여러 세션 지원 예정.
 */
export interface PersistedMultiSession {
  /** 세션 고유 ID */
  id: string
  /** 세션 표시 제목 (선택) */
  title?: string
  /** 패널 수 (2~6) */
  count: number
  /** 패널 레코드 목록 (count와 대응) */
  panels: PersistedPanel[]
}

/**
 * 멀티 에이전트 워크스페이스 전체 영속 상태.
 *
 * version: MULTI_VERSION = 2 고정 (S1 — 원본 maStore.ts MULTI_VERSION=2 미러).
 *   version≠2 blob → readMulti()가 null 반환 (graceful 무시).
 * activeSessionId: 현재 활성 세션 ID.
 * sessions: 세션 목록 (M3은 단일 활성 세션만 채움).
 *
 * CRITICAL(신뢰경계): 이 blob은 renderer가 보내는 untrusted 입력.
 *   - SAVE: main이 best-effort 기록 (검증 최소).
 *   - LOAD: main이 반환 전 각 panel.cwd를 isAbsolute+existsSync+isDirectory 재검증.
 *           실패 panel.cwd → undefined drop (임의 경로 무확인 통과 0).
 */
export interface PersistedMultiState {
  /** blob 버전 — MULTI_VERSION = 2 고정 */
  version: number
  /** 현재 활성 세션 ID */
  activeSessionId: string
  /** 세션 목록 (M3은 길이 1) */
  sessions: PersistedMultiSession[]
}

// ── multiSession.save ─────────────────────────────────────────────────────────

/**
 * `multiSession.save` 요청 — 멀티 에이전트 세션 상태 저장.
 *
 * CRITICAL(신뢰경계): state는 renderer untrusted 입력 — main이 best-effort 기록.
 * 저장 시 검증 최소. 읽기(LOAD) 시 cwd 재검증으로 보호.
 */
export interface MultiSessionSaveRequest {
  /** 저장할 멀티 세션 상태 */
  state: PersistedMultiState
}

/** `multiSession.save` 응답 */
export interface MultiSessionSaveResponse {
  /** 저장 성공 여부 (best-effort — 실패해도 크래시 0) */
  ok: boolean
}

// ── multiSession.load ─────────────────────────────────────────────────────────

/**
 * `multiSession.load` 요청 — 인자 없음.
 *
 * CRITICAL(신뢰경계): 요청 인자 없음 — renderer가 경로를 주입할 수 없다.
 * main이 고정 경로(userData/multi-agent.json)에서 읽어 cwd 재검증 후 반환.
 */
export type MultiSessionLoadRequest = Record<string, never>

/**
 * `multiSession.load` 응답 — PersistedMultiState 또는 null.
 *
 * CRITICAL(신뢰경계):
 *   - 반환 전 각 panel.cwd를 isAbsolute+existsSync+isDirectory 재검증.
 *   - 검증 실패 cwd → undefined drop (임의 경로 무확인 통과 0).
 *   - 손상 JSON / version≠2 → null (graceful).
 */
export interface MultiSessionLoadResponse {
  /** 복원된 멀티 세션 상태 (파일 없음/손상/version 불일치 → null) */
  state: PersistedMultiState | null
}
