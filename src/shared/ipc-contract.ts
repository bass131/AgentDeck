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

  // ── Conversation ───────────────────────────────────────────────────────────
  /** 대화 히스토리 로드 (invoke) */
  CONVERSATION_LOAD: 'conversation.load',
  /** 대화 히스토리 저장 (invoke) */
  CONVERSATION_SAVE: 'conversation.save',
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
