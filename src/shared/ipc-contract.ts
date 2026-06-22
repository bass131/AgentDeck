/**
 * ipc-contract.ts — IPC 채널명 상수 + 요청/응답 타입 (단일 진실 공급원)
 *
 * CRITICAL (헌법): 채널명 문자열은 이 파일에만 존재.
 * main(ipcMain.handle) · renderer(api.*) 모두 여기서 import.
 *
 * 채널 종류:
 *   invoke형 — renderer가 main에 요청, main이 응답 (ipcRenderer.invoke).
 *   event형  — main이 renderer로 단방향 push (ipcMain.emit → ipcRenderer.on).
 *
 * 구현 위치: src/main/ipc/ (Phase 04, main-process 에이전트 담당).
 * 이 파일은 *정의*만 — 핸들러 로직 없음.
 */

import type { AgentEvent } from './agent-events'

/**
 * 코딩 엔진 백엔드 식별자 (단일 공급원).
 * registry(Phase 03)·IPC 계약·DB 레코드가 공유 → 엔진 추가 시 여기 한 곳만 확장.
 * Track 1은 'claude-code'만 실동작, 'codex'는 Track 2(stub).
 */
export type BackendId = 'claude-code' | 'codex'

// ═══════════════════════════════════════════════════════════════════════════════
// 채널명 상수
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 워크스페이스 루트의 고정 등록 ID.
 *
 * main 레지스트리에서 ID → 실제 경로 매핑을 관리한다.
 * - 워크스페이스 루트는 항상 이 상수 ID를 가진다.
 * - 레퍼런스 폴더는 main이 'ref-1', 'ref-2'… 형식으로 발급한다(발급 로직은 main 담당).
 *
 * CRITICAL(보안): FsReadRequest.root 는 이 ID 또는 reference.add 가 발급한 ID여야 한다.
 * renderer가 임의 경로 문자열을 root로 주입할 수 없다 — main 레지스트리에 미등록 ID면 not-found.
 */
export const WORKSPACE_ROOT_ID = 'workspace' as const

/**
 * IPC 채널명 상수.
 * preload · main 핸들러 · (필요 시) 테스트가 이 객체에서 import.
 * 문자열 리터럴 직접 사용 금지 — 오타 방지 + 리팩터 안전.
 */
export const IPC_CHANNELS = {
  // ── Workspace ──────────────────────────────────────────────────────────────
  /** 워크스페이스 폴더를 열고 파일 트리를 반환 (invoke) */
  WORKSPACE_OPEN: 'workspace.open',
  /** 현재 열린 워크스페이스의 파일 트리를 반환 (invoke) */
  WORKSPACE_TREE: 'workspace.tree',

  // ── Agent ──────────────────────────────────────────────────────────────────
  /** 에이전트 대화 실행 시작 (invoke — 실행 ID 반환, 이벤트는 AGENT_EVENT로) */
  AGENT_RUN: 'agent.run',
  /** 진행 중인 에이전트 실행 중단 (invoke) */
  AGENT_ABORT: 'agent.abort',
  /**
   * main → renderer 스트리밍 이벤트 (event형 — ipcRenderer.on).
   * 구독은 preload의 onAgentEvent helper를 통해서만.
   */
  AGENT_EVENT: 'agent.event',

  // ── FileSystem ─────────────────────────────────────────────────────────────
  /** 파일 경로를 받아 워크 트리 vs 스냅샷 diff를 반환 (invoke) */
  FS_DIFF: 'fs.diff',
  /** 파일 내용 읽기 — 텍스트(하이라이팅) 또는 바이너리(이미지 data URL). 단일 채널(M2) (invoke) */
  FS_READ: 'fs.read',

  // ── Conversation ───────────────────────────────────────────────────────────
  /** 대화 히스토리 로드 (invoke) */
  CONVERSATION_LOAD: 'conversation.load',
  /** 대화 히스토리 저장 (invoke) */
  CONVERSATION_SAVE: 'conversation.save',

  // ── Reference Folder (M2-03) ───────────────────────────────────────────────
  /**
   * 레퍼런스 폴더를 워크스페이스 밖 읽기전용 보조 루트로 등록 (invoke).
   * main이 고유 ID('ref-1', 'ref-2'…)를 발급하고 레지스트리에 저장.
   */
  REFERENCE_ADD: 'reference.add',
  /** 등록된 레퍼런스 폴더 목록 반환 (invoke) */
  REFERENCE_LIST: 'reference.list',
  /**
   * 특정 레퍼런스 루트의 파일 트리 반환 (invoke).
   * 요청의 id는 reference.add 가 발급한 등록 루트 ID여야 한다.
   */
  REFERENCE_TREE: 'reference.tree',

  // ── Window Control (F1-b — 투명 frameless 셸) ──────────────────────────────
  // CRITICAL(신뢰경계): 아래 채널은 **창 식별자 인자를 받지 않는다**. main이
  // BrowserWindow.fromWebContents(event.sender)로 *요청을 보낸 창*만 조작한다
  // (renderer가 임의 창 ID/핸들을 주입할 수 없음). drag/resize는 start/end
  // 브래킷만 renderer가 트리거하고, 커서 추종 setBounds는 main이 수행한다.
  /** 현재 창 최소화 (invoke) */
  WINDOW_MINIMIZE: 'window.minimize',
  /** 최대화 토글 — 투명창은 OS 네이티브 maximize 부재 → main custom maximize (invoke, {maximized} 반환) */
  WINDOW_MAXIMIZE_TOGGLE: 'window.maximizeToggle',
  /** 현재 창 닫기 (invoke) */
  WINDOW_CLOSE: 'window.close',
  /** 현재 창의 최대화 상태 조회 (invoke, {maximized} 반환) */
  WINDOW_IS_MAXIMIZED: 'window.isMaximized',
  /** 현재 창 bounds 조회 (invoke, WindowBounds 반환) */
  WINDOW_GET_BOUNDS: 'window.getBounds',
  /** 현재 창 bounds 설정 (invoke) */
  WINDOW_SET_BOUNDS: 'window.setBounds',
  /** 수동 드래그 시작 — main이 grab점 잠금 후 커서 추종 setBounds 개시 (invoke) */
  WINDOW_DRAG_START: 'window.dragStart',
  /** 수동 드래그 종료 — 커서 추종 정지 (invoke) */
  WINDOW_DRAG_END: 'window.dragEnd',
  /** 수동 리사이즈 시작 — 엣지 지정, main이 커서 추종 setBounds 개시 (invoke) */
  WINDOW_RESIZE_START: 'window.resizeStart',
  /** 수동 리사이즈 종료 (invoke) */
  WINDOW_RESIZE_END: 'window.resizeEnd',
  /** main → renderer 최대화 상태 변경 push (event형 — .win.max 토글용) */
  WINDOW_STATE: 'window.state',
} as const

/** 채널명 리터럴 유니온 타입 (핸들러 등록 타입 안전 보조용) */
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

// ═══════════════════════════════════════════════════════════════════════════════
// Workspace 채널 타입
// ═══════════════════════════════════════════════════════════════════════════════

/** 파일/디렉토리 노드 (트리 재귀 구조) */
export interface FileTreeNode {
  /** 파일/디렉토리 이름 */
  name: string
  /** 워크스페이스 루트 기준 상대 경로 */
  path: string
  /** 노드 종류 */
  kind: 'file' | 'directory'
  /** 디렉토리일 때 자식 노드 목록 */
  children?: FileTreeNode[]
}

// workspace.open ──────────────────────────────────────────────────────────────

/** `workspace.open` 요청 */
export interface WorkspaceOpenRequest {
  /**
   * 열 폴더의 절대 경로.
   * undefined면 OS 폴더 선택 다이얼로그를 띄운다.
   */
  folderPath?: string
}

/** `workspace.open` 응답 */
export interface WorkspaceOpenResponse {
  /** 선택된 워크스페이스 절대 경로 (사용자가 취소하면 null) */
  rootPath: string | null
  /** 초기 파일 트리 (rootPath가 null이면 null) */
  tree: FileTreeNode | null
}

// workspace.tree ──────────────────────────────────────────────────────────────

/** `workspace.tree` 요청 (현재 열린 워크스페이스 기준이므로 인자 없음) */
export type WorkspaceTreeRequest = Record<string, never>

/** `workspace.tree` 응답 */
export interface WorkspaceTreeResponse {
  /** 현재 워크스페이스의 파일 트리 (열려 있지 않으면 null) */
  tree: FileTreeNode | null
}

// ═══════════════════════════════════════════════════════════════════════════════
// Agent 채널 타입
// ═══════════════════════════════════════════════════════════════════════════════

/** 대화 메시지 역할 */
export type MessageRole = 'user' | 'assistant'

/** 대화 메시지 단위 */
export interface ConversationMessage {
  role: MessageRole
  /** 텍스트 내용 */
  content: string
}

// agent.run ───────────────────────────────────────────────────────────────────

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
}

/** `agent.run` 응답 — 실행 핸들 ID (abort·이벤트 매칭용) */
export interface AgentRunResponse {
  /** 실행 고유 ID. AGENT_EVENT 이벤트의 runId와 대응. */
  runId: string
}

// agent.abort ─────────────────────────────────────────────────────────────────

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

// agent.event (event형 — main → renderer push) ────────────────────────────────

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

// ═══════════════════════════════════════════════════════════════════════════════
// FileSystem 채널 타입
// ═══════════════════════════════════════════════════════════════════════════════

// fs.diff ─────────────────────────────────────────────────────────────────────

/** `fs.diff` 요청 */
export interface FsDiffRequest {
  /** diff를 구할 파일의 절대(또는 워크스페이스 상대) 경로 */
  filePath: string
}

/** diff 변경 라인 단위 */
export interface DiffLine {
  /** 라인 종류 */
  kind: 'add' | 'remove' | 'context'
  /** 라인 내용 (줄바꿈 제외) */
  content: string
  /** 원본(스냅샷) 기준 라인 번호 (context/remove일 때) */
  lineOld?: number
  /** 변경 후(워크 트리) 기준 라인 번호 (context/add일 때) */
  lineNew?: number
}

/** `fs.diff` 응답 */
export interface FsDiffResponse {
  /** 요청한 파일 경로 */
  filePath: string
  /**
   * 통합 diff 라인 목록.
   * 파일이 존재하지 않거나 스냅샷이 없으면 빈 배열.
   */
  lines: DiffLine[]
}

// fs.read (텍스트 + 바이너리 통합 단일 채널 — M2) ──────────────────────────────

/** `fs.read` 요청 */
export interface FsReadRequest {
  /** 읽을 파일의 루트 기준 상대 경로 (untrusted) */
  path: string
  /**
   * **등록 루트 ID** (WORKSPACE_ROOT_ID 또는 reference.add 가 발급한 id).
   * 미지정이면 워크스페이스(WORKSPACE_ROOT_ID) 기준으로 동작.
   * **임의 경로 아님** — main이 레지스트리에서 ID로 실제 경로를 조회하며,
   * 미등록 ID는 not-found 응답으로 은닉(경로 탈출 방지).
   * renderer가 절대 경로 문자열을 이 필드에 주입해도 레지스트리 조회 실패로 차단된다.
   */
  root?: string
  /** true면 바이너리(이미지)로 읽어 data URL 반환 */
  asBinary?: boolean
}

/**
 * `fs.read` 응답 — discriminated union(`kind`).
 * 경로 탈출/미존재는 모두 `not-found`로 은닉(정보 누출 최소화).
 */
export type FsReadResponse =
  | { kind: 'text'; content: string; language: string }
  | { kind: 'binary'; dataUrl: string; mime: string }
  | { kind: 'too-large' }
  | { kind: 'binary-skipped' }
  | { kind: 'not-found' }

// ═══════════════════════════════════════════════════════════════════════════════
// Conversation 채널 타입
// ═══════════════════════════════════════════════════════════════════════════════

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
}

// conversation.load ───────────────────────────────────────────────────────────

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

// conversation.save ───────────────────────────────────────────────────────────

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

// ═══════════════════════════════════════════════════════════════════════════════
// Reference Folder 채널 타입 (M2-03)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 등록된 레퍼런스 폴더 레코드.
 *
 * readOnly 는 리터럴 true — 쓰기 불가를 타입 수준에서 표현한다.
 * 워크스페이스 밖의 보조 루트이므로 fs.read 를 통한 읽기만 허용.
 *
 * id 형식: main이 'ref-1', 'ref-2'… 순서로 발급 (발급 로직은 main-process 담당).
 * rootPath: main이 절대경로 + 존재 + 디렉토리 여부를 검증한 실제 경로.
 *           renderer는 이 값을 표시 목적으로만 사용하고,
 *           파일 접근 시에는 반드시 id를 통해 요청해야 한다.
 */
export interface ReferenceFolder {
  /** main 레지스트리가 발급한 불투명 등록 루트 ID ('ref-1', 'ref-2'…) */
  id: string
  /** 사용자에게 보여줄 폴더 이름 (OS basename) */
  name: string
  /** 실제 절대 경로 (main이 검증 후 저장 — 표시 전용) */
  rootPath: string
  /** 항상 true — 레퍼런스 폴더는 읽기전용 (타입으로 불변식 표현) */
  readOnly: true
}

// reference.add ───────────────────────────────────────────────────────────────

/**
 * `reference.add` 요청 — 레퍼런스 폴더 등록.
 *
 * folderPath 주어지면: main이 절대경로 + 존재 + 디렉토리 여부를 검증 후 등록.
 * folderPath 미지정:   main이 OS 폴더 선택 다이얼로그(또는 e2e 환경변수
 *                      AGENTDECK_E2E_REFERENCE)를 사용해 경로를 획득.
 *
 * 보안 불변식: folderPath 는 참고용 힌트일 뿐, main이 항상 재검증한다.
 * 이후 파일 읽기는 reference.add 가 발급한 id 로만 요청 가능(임의 경로 주입 불가).
 */
export interface ReferenceAddRequest {
  /**
   * 등록할 폴더의 절대 경로.
   * undefined 면 main이 OS 다이얼로그(또는 e2e 환경변수)로 경로를 획득.
   * 지정해도 main에서 절대경로 + 존재 + 디렉토리 검증을 수행한다.
   */
  folderPath?: string
}

/** `reference.add` 응답 */
export interface ReferenceAddResponse {
  /**
   * 등록된 레퍼런스 폴더 레코드.
   * 사용자가 다이얼로그를 취소하거나 검증 실패 시 null.
   */
  reference: ReferenceFolder | null
}

// reference.list ──────────────────────────────────────────────────────────────

/** `reference.list` 요청 (인자 없음) */
export type ReferenceListRequest = Record<string, never>

/** `reference.list` 응답 */
export interface ReferenceListResponse {
  /** 현재 세션에 등록된 레퍼런스 폴더 목록 (등록 순서) */
  references: ReferenceFolder[]
}

// reference.tree ──────────────────────────────────────────────────────────────

/**
 * `reference.tree` 요청 — 특정 레퍼런스 루트의 파일 트리.
 *
 * id 는 reference.add 가 발급한 등록 루트 ID여야 한다.
 * 미등록 ID면 응답의 tree 가 null 로 반환된다(오류 은닉).
 */
export interface ReferenceTreeRequest {
  /** reference.add 가 발급한 등록 루트 ID */
  id: string
}

/** `reference.tree` 응답 */
export interface ReferenceTreeResponse {
  /**
   * 요청한 레퍼런스 루트의 파일 트리.
   * 미등록 ID이거나 트리 구성 실패 시 null.
   */
  tree: FileTreeNode | null
}

// ═══════════════════════════════════════════════════════════════════════════════
// Window Control 채널 타입 (F1-b — 투명 frameless 셸)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 창 bounds (스크린 좌표 px).
 * getBounds 응답 / setBounds 요청 공용.
 */
export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 리사이즈 핸들 방향 (8 엣지/모서리).
 * resizeStart 요청에 포함 — main이 해당 엣지를 커서 추종으로 늘린다.
 */
export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** `window.maximizeToggle` / `window.isMaximized` 응답 */
export interface WindowMaximizedResponse {
  /** 토글/조회 후 최대화 상태 */
  maximized: boolean
}

/** `window.resizeStart` 요청 */
export interface WindowResizeStartRequest {
  /** 늘릴 엣지/모서리 */
  edge: ResizeEdge
}

/**
 * `window.state` IPC 이벤트 페이로드 (main → renderer push).
 * 최대화/복원 시 main이 push → renderer가 `.win.max` 토글.
 */
export interface WindowStatePayload {
  /** 현재 최대화 여부 */
  maximized: boolean
}
