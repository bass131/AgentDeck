/**
 * ipc/multi.ts — 멀티 에이전트 세션 영속 도메인 채널·타입 계약 (M3 — maStore.ts 미러)
 *
 * 채널: MULTI_SESSION_LOAD('multi.load') ·
 *       MULTI_CMD_UPSERT('multi.cmdUpsert') · MULTI_CMD_CREATE('multi.cmdCreate') ·
 *       MULTI_CMD_DELETE('multi.cmdDelete') · MULTI_CMD_RENAME('multi.cmdRename') ·
 *       MULTI_CMD_SELECT('multi.cmdSelect') (ADR-031 — RMW1)
 * 구현 위치: main-process 담당 (이 파일은 *정의*만 — 핸들러 로직 없음).
 *
 * ADR-031(2026-07-03): renderer 분산 RMW(read-modify-write) 폐기 → main 명령 기반 이관.
 * blob 통짜 SAVE 대신 **의도 명령**(upsert/create/delete/rename/select)을 IPC로 보내고
 * main이 read→merge→write를 단일 원자 블록(run-to-completion)으로 실행 — 단일 기록자.
 * 명령 5종은 RMW1-P02(shared-ipc)에서 계약 정의, main 핸들러 구현은 RMW1-P03,
 * renderer 호출처 재작성은 RMW1-P04, blob 통짜 SAVE 채널 제거는 RMW1-P05(이 커밋)에서 완료.
 */

import type { TokenUsage } from '../agent-events'

// ── 채널명 상수 ──────────────────────────────────────────────────────────────

export const MULTI_CHANNELS = {
  /**
   * 멀티 에이전트 세션 상태 로드 (invoke).
   * 인자 없음. 응답 PersistedMultiState | null.
   *
   * CRITICAL(신뢰경계): 반환 전 각 panel.cwd를 isAbsolute+existsSync+isDirectory로
   * 재검증 — 실패 시 undefined drop(임의 경로 무확인 통과 0). 손상/version 불일치 → null.
   * 구현: main-process multiStore.ts (userData/multi-agent.json 읽기 + cwd 재검증).
   * 소비: renderer MultiWorkspace 마운트 복원. READ 전용 — ADR-031 이후에도 유지(폐기 대상 아님).
   */
  MULTI_SESSION_LOAD: 'multi.load',

  // ── 의도 명령 5종 (ADR-031 — RMW1, 병합 책임 main 단일 기록자 이관) ───────────
  // 구현: main-process multiStore.ts + ipc/index.ts (RMW1-P03, 이 Phase에서는 계약만).
  // 소비: renderer slices/multiSession.ts · hooks/useMultiPersist.ts (RMW1-P04에서 재배선).
  // 모든 명령 응답은 병합 후 권위 PersistedMultiState를 포함 — renderer Zustand는 낙관적
  // 갱신 대신 이 값으로 미러 동기화(응답 없이 로컬 상태를 먼저 확정하지 않는다).

  /**
   * 활성 세션 스냅샷 upsert (invoke) — id 일치 세션 교체, 미지 id는 no-op + ok:false.
   * 요청 MultiCmdUpsertRequest. 응답 MultiCmdUpsertResponse.
   * main이 read→upsert→write를 단일 원자 블록에서 실행(인터리브 불가 — run-to-completion).
   *
   * 채널명: 'multi.cmdUpsert' — namespace(multi) + camelCase action(cmdUpsert).
   * 전역 dot-namespaced 규칙(namespace.action, 단일 dot — ipc-contract.test.ts 골든)을
   * 따르기 위해 'multi.cmd.upsert'(2-dot) 대신 'cmd' 접두 camelCase로 표기.
   */
  MULTI_CMD_UPSERT: 'multi.cmdUpsert',
  /**
   * 새 멀티세션 생성 + 활성화 (invoke) — 인자 없음, id는 main 생성.
   * 요청 MultiCmdCreateRequest. 응답 MultiCmdCreateResponse.
   */
  MULTI_CMD_CREATE: 'multi.cmdCreate',
  /**
   * 세션 영구 삭제 (invoke) — 활성 세션 삭제 시 main이 활성 재계산.
   * 요청 MultiCmdDeleteRequest. 응답 MultiCmdDeleteResponse.
   */
  MULTI_CMD_DELETE: 'multi.cmdDelete',
  /**
   * 세션 제목 변경 (invoke) — title은 untrusted 입력, main이 trim+cap 검증.
   * 요청 MultiCmdRenameRequest. 응답 MultiCmdRenameResponse.
   */
  MULTI_CMD_RENAME: 'multi.cmdRename',
  /**
   * 활성 세션 전환 (invoke).
   * 요청 MultiCmdSelectRequest. 응답 MultiCmdSelectResponse.
   */
  MULTI_CMD_SELECT: 'multi.cmdSelect',
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
  /**
   * 패널별 REPL 지속세션(ADR-024) 토글 — 전역 단일 필드에서 이관(LR4 P07).
   * true = held-open persistent 세션. false = 단발 query. `sessionId?`(같은 스냅샷 내) 선례 미러.
   *
   * 미설정 → undefined → makePanelInitialState가 전역 마이그값→기본 true로 폴백(회귀 0).
   */
  replMode?: boolean
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
 * CRITICAL(신뢰경계): 이 blob의 필드(session/title 등)는 renderer가 명령(MULTI_CMD_*)으로
 * 보내는 untrusted 입력 — main이 read→merge→write 단일 원자 블록에서 병합 후 기록한다(ADR-031).
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

// ── 의도 명령 5종 — 공통 응답 (ADR-031, RMW1-P02) ─────────────────────────────

/**
 * 명령 채널(upsert/create/delete/rename/select) 공통 응답 형태.
 *
 * 모든 명령은 **병합 후 main 권위 상태**를 돌려준다 — renderer Zustand는 이 값으로
 * 로컬 미러를 동기화한다. "내가 보낸 대로 됐겠지"라는 낙관적 갱신만으로는 main의
 * 병합 결과(예: 삭제 후 활성 재계산·title 보존)와 어긋날 수 있음 — 응답 미러링이
 * 그 어긋남을 구조적으로 차단한다.
 *
 * 채널별 Response 타입(MultiCmdUpsertResponse 등)은 이 형태의 별칭 — preload·소비처가
 * 채널 의도를 타입명으로 읽을 수 있도록 개별 export하되 구조는 단일 정의를 공유한다.
 */
export interface MultiCmdResponse {
  /** 명령 처리 성공 여부 (best-effort — 실패해도 크래시 0) */
  ok: boolean
  /** 병합 후 권위 상태 — renderer가 이 값으로 로컬 미러(zustand)를 갱신 */
  state: PersistedMultiState
}

// ── multi.cmdUpsert ────────────────────────────────────────────────────────────

/**
 * `multi.cmdUpsert` 요청 — 활성 세션 스냅샷 upsert(id 일치 시 교체, 미지 id는 no-op + ok:false).
 *
 * **title 필드를 의도적으로 제외**(`Omit`) — upsert는 콘텐츠(count/panels)만 갱신하고
 * title은 rename 명령 전용. main은 기존 세션의 title을 그대로 보존한 채 나머지를 교체
 * (renderer 측 이전 RMW 로직 useMultiPersist.performRmwSave의 title 보존 규칙을 main으로 이관).
 * id에 해당하는 세션이 없으면 **no-op + ok:false**(상태 불변) — 삭제된 세션의 뒤늦은
 * autosave가 세션을 되살리는 "stale upsert 부활"을 차단한다(P02 reviewer 🟡 → 게이트 확정).
 * 정상 경로에서 id는 항상 cmdCreate가 발급하므로 미지 id = stale로 판정 가능.
 *
 * CRITICAL(신뢰경계): session은 renderer untrusted 입력 — main이 best-effort 병합.
 */
export interface MultiCmdUpsertRequest {
  /** upsert 대상 세션 스냅샷 (title 제외 — 콘텐츠만) */
  session: Omit<PersistedMultiSession, 'title'>
}

/** `multi.cmdUpsert` 응답 — {@link MultiCmdResponse} */
export type MultiCmdUpsertResponse = MultiCmdResponse

// ── multi.cmdCreate ────────────────────────────────────────────────────────────

/**
 * `multi.cmdCreate` 요청 — 새 멀티세션 생성 + 즉시 활성화. 인자 없음.
 *
 * id는 main이 생성(crypto.randomUUID 등 — 단일 기록자가 소유). 초기 메타는
 * title=''·count=2·panels=[] 고정(기존 renderer newMultiSession() 동작 미러).
 * 생성된 세션이 곧바로 활성 세션이 된다 — 응답 state.activeSessionId로 새 id 확인.
 */
export type MultiCmdCreateRequest = Record<string, never>

/** `multi.cmdCreate` 응답 — {@link MultiCmdResponse}. state.activeSessionId = 신규 세션 id */
export type MultiCmdCreateResponse = MultiCmdResponse

// ── multi.cmdDelete ────────────────────────────────────────────────────────────

/**
 * `multi.cmdDelete` 요청 — 세션 영구 삭제.
 *
 * 활성 세션 삭제 시 main이 남은 첫 세션을 활성화(없으면 새 세션 자동 생성) — 기존
 * renderer deleteMultiSession()의 활성 재계산 로직이 main으로 이관.
 */
export interface MultiCmdDeleteRequest {
  /** 삭제할 세션 ID (untrusted — main이 존재 검증, 없는 id는 no-op) */
  id: string
}

/** `multi.cmdDelete` 응답 — {@link MultiCmdResponse}. 삭제·활성 재계산 반영 상태 */
export type MultiCmdDeleteResponse = MultiCmdResponse

// ── multi.cmdRename ────────────────────────────────────────────────────────────

/**
 * `multi.cmdRename` 요청 — 세션 제목 변경.
 *
 * CRITICAL(신뢰경계): id·title 모두 untrusted 입력 — main이 title trim + cap(200자)
 * 검증(기존 renderer renameMultiSession()의 sanitize 로직이 main으로 이관).
 */
export interface MultiCmdRenameRequest {
  /** 이름 변경할 세션 ID (untrusted) */
  id: string
  /** 새 제목 (untrusted — main이 trim+cap 검증) */
  title: string
}

/** `multi.cmdRename` 응답 — {@link MultiCmdResponse} */
export type MultiCmdRenameResponse = MultiCmdResponse

// ── multi.cmdSelect ────────────────────────────────────────────────────────────

/**
 * `multi.cmdSelect` 요청 — 활성 세션 전환.
 */
export interface MultiCmdSelectRequest {
  /** 활성화할 세션 ID */
  id: string
}

/** `multi.cmdSelect` 응답 — {@link MultiCmdResponse} */
export type MultiCmdSelectResponse = MultiCmdResponse
