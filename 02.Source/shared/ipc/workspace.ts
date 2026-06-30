/**
 * ipc/workspace.ts — 워크스페이스 도메인 채널·타입 계약
 *
 * 채널: WORKSPACE_OPEN · WORKSPACE_TREE
 * 구현 위치: main-process 담당 (이 파일은 *정의*만 — 핸들러 로직 없음).
 */

// ── 채널명 상수 ──────────────────────────────────────────────────────────────

export const WORKSPACE_CHANNELS = {
  /** 워크스페이스 폴더를 열고 파일 트리를 반환 (invoke) */
  WORKSPACE_OPEN: 'workspace.open',
  /** 현재 열린 워크스페이스의 파일 트리를 반환 (invoke) */
  WORKSPACE_TREE: 'workspace.tree',
} as const

// ── 공통 노드 타입 ────────────────────────────────────────────────────────────

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

// ── workspace.open ────────────────────────────────────────────────────────────

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

// ── workspace.tree ────────────────────────────────────────────────────────────

/** `workspace.tree` 요청 (현재 열린 워크스페이스 기준이므로 인자 없음) */
export type WorkspaceTreeRequest = Record<string, never>

/** `workspace.tree` 응답 */
export interface WorkspaceTreeResponse {
  /** 현재 워크스페이스의 파일 트리 (열려 있지 않으면 null) */
  tree: FileTreeNode | null
}
