/**
 * slices/workspace.ts — 워크스페이스 슬라이스 (P12 분해).
 *
 * workspaceMode·workspaceRoot·fileTree·diffFilePath·recentFiles + 워크스페이스 액션.
 * 거동 보존: 액션 본문/초기값은 기존 appStore.ts에서 그대로 이전.
 *
 * 슬라이스 cross-call(get() 결합 보존):
 *   - restoreWorkspaceFromCwd → get().loadProjectFiles() (composer)
 *   - openWorkspace          → get().loadProjectFiles() (composer)
 *
 * CRITICAL(신뢰경계): 직접 set({workspaceRoot}) 금지 — workspaceOpen IPC 경유(main 재검증).
 */
import type { StateCreator } from 'zustand'
import type { FileTreeNode } from '../../../../shared/ipc-contract'
import type { AppStore } from './types'

export interface WorkspaceState {
  // ── 워크스페이스 모드 (F13: renderer state 전용, 새 IPC 0) ─────────────────
  /** 단일/멀티 에이전트 워크스페이스 모드 */
  workspaceMode: 'single' | 'multi'

  // ── 워크스페이스 ────────────────────────────────────────────────────────────
  workspaceRoot: string | null
  fileTree: FileTreeNode | null
  /** diff 뷰어에 표시할 파일 경로 */
  diffFilePath: string | null

  // ── 최근 파일 탭바 (F10-01, renderer state 전용 — 새 IPC 0) ─────────────────
  /** 최근 열린 파일 경로 목록(최신순, cap 20, dedup) */
  recentFiles: string[]
}

export interface WorkspaceActions {
  /** 단일/멀티 에이전트 모드 전환 (renderer state, IPC 0) */
  setWorkspaceMode: (mode: 'single' | 'multi') => void
  /**
   * cwd 절대경로로 워크스페이스 복원 내부 헬퍼. (ADR-020)
   * workspaceOpen({folderPath}) IPC 경유 → main 재검증(isAbsolute+existsSync+isDirectory).
   * 검증 실패(rootPath null) 또는 IPC 예외 → 전역 workspaceRoot 유지(graceful).
   * openWorkspace(다이얼로그) · selectConversation(cwd 복원) 양쪽 재사용.
   */
  restoreWorkspaceFromCwd: (cwd: string) => Promise<void>
  /** workspaceOpen IPC 호출 → tree 업데이트 */
  openWorkspace: () => Promise<void>
  /** 파일 클릭 → diff 뷰어 표시 */
  selectDiffFile: (path: string | null) => void
  /** 최근 파일 탭바에서 경로 제거 (renderer state, IPC 0). */
  removeRecentFiles: (paths: string[]) => void
  /** 드래그 재정렬 후 전체 순서 반영 (renderer state, IPC 0). */
  reorderRecentFiles: (files: string[]) => void
  /**
   * 현재 워크스페이스 파일 트리를 재읽기하여 fileTree 갱신.
   * 에이전트 턴 종료(done/error) 시 1회 호출 → 변경 파일 탐색기 자동 반영(원본 fsTick on done/error 미러).
   * CRITICAL: renderer untrusted — window.api.workspaceTree(화이트리스트)만 호출. fs/Node 0.
   * - workspaceRoot 미오픈 시 no-op(가드).
   * - IPC 실패 또는 tree:null 응답 시 기존 fileTree 유지(graceful).
   */
  refreshFileTree: () => Promise<void>
}

export const createWorkspaceSlice: StateCreator<AppStore, [], [], WorkspaceState & WorkspaceActions> = (set, get) => ({
  // ── 초기값 ────────────────────────────────────────────────────────────────
  workspaceMode: 'single' as const,
  workspaceRoot: null,
  fileTree: null,
  diffFilePath: null,
  recentFiles: [],

  // ── 워크스페이스 모드 (F13) ──────────────────────────────────────────────
  setWorkspaceMode: (mode) => {
    set({ workspaceMode: mode })
  },

  // ── 워크스페이스 ─────────────────────────────────────────────────────────
  /**
   * restoreWorkspaceFromCwd — cwd 절대경로로 워크스페이스 복원 내부 헬퍼. (ADR-020)
   *
   * CRITICAL(신뢰경계): 직접 set({workspaceRoot}) 금지.
   * 반드시 workspaceOpen({folderPath}) IPC 경유 → main이 isAbsolute+existsSync+isDirectory 재검증.
   * rootPath null(검증 실패/취소) 시 전역 workspaceRoot 유지(graceful, 미변경).
   *
   * openWorkspace(다이얼로그) · selectConversation(cwd 복원) 양쪽에서 재사용.
   */
  restoreWorkspaceFromCwd: async (cwd: string) => {
    try {
      const res = await window.api.workspaceOpen({ folderPath: cwd })
      if (res.rootPath) {
        set({ workspaceRoot: res.rootPath, fileTree: res.tree })
        // M4-2: 워크스페이스 바뀌면 파일 목록 갱신 (@멘션 팔레트)
        void get().loadProjectFiles()
      }
      // rootPath null → 검증 실패 / 취소: 전역 workspaceRoot 유지(graceful)
    } catch {
      // IPC 실패 → 전역 workspaceRoot 유지(graceful). 콘솔 노이즈 최소화.
    }
  },

  openWorkspace: async () => {
    // 다이얼로그 모드: folderPath 없이 호출 → main이 OS 폴더 선택 다이얼로그 열기
    const res = await window.api.workspaceOpen({})
    if (res.rootPath) {
      set({ workspaceRoot: res.rootPath, fileTree: res.tree })
      // M4-2: 워크스페이스 바뀌면 파일 목록 갱신 (@멘션 팔레트)
      void get().loadProjectFiles()
    }
  },

  selectDiffFile: (path) => {
    set({ diffFilePath: path })
  },

  removeRecentFiles: (paths) => {
    const pathSet = new Set(paths)
    set((s) => ({ recentFiles: s.recentFiles.filter((p) => !pathSet.has(p)) }))
  },

  reorderRecentFiles: (files) => {
    set({ recentFiles: files })
  },

  // ── 탐색기 갱신 (P13) ────────────────────────────────────────────────────
  refreshFileTree: async () => {
    // 워크스페이스 미오픈 시 no-op (가드)
    if (!get().workspaceRoot) return
    try {
      // IPC 경유 — renderer는 fs/Node 직접 0.
      // window.api.workspaceTree: 인자 없음(빈 객체), 응답 { tree: FileTreeNode | null }.
      // 기존 화이트리스트·reviewed 채널 재사용 — 신규 IPC 불필요.
      const res = await window.api.workspaceTree({})
      // tree: null 응답 시 기존 트리 유지(graceful — 재읽기 실패로 트리 소실 방지)
      if (res?.tree) {
        set({ fileTree: res.tree })
      }
    } catch {
      // IPC 실패 — 기존 fileTree 유지(graceful). 콘솔 노이즈 최소화.
    }
  },
})
