import type { StateCreator } from 'zustand'
import type { FileTreeNode } from '../../../../shared/ipcContract'
import type { AppStore } from '@renderer/00_App/state/types'

// 화면 배치(대화 하나 / 멀티 패널) 상태는 12_Window/windowMode 슬라이스로 옮겼다(G9c).
export interface WorkspaceState {
  workspaceRoot: string | null
  fileTree: FileTreeNode | null
  diffFilePath: string | null

  recentFiles: string[]
}

export interface WorkspaceActions {
  restoreWorkspaceFromCwd: (cwd: string) => Promise<void>
  openWorkspace: () => Promise<void>
  selectDiffFile: (path: string | null) => void
  removeRecentFiles: (paths: string[]) => void
  reorderRecentFiles: (files: string[]) => void
  refreshFileTree: () => Promise<void>
}

export const createWorkspaceSlice: StateCreator<AppStore, [], [], WorkspaceState & WorkspaceActions> = (set, get) => ({
  workspaceRoot: null,
  fileTree: null,
  diffFilePath: null,
  recentFiles: [],

  restoreWorkspaceFromCwd: async (cwd: string) => {
    try {
      const res = await window.api.workspaceOpen({ folderPath: cwd })
      if (res.rootPath) {
        set({ workspaceRoot: res.rootPath, fileTree: res.tree })
        void get().loadProjectFiles()
      }
    } catch {
    }
  },

  openWorkspace: async () => {
    const res = await window.api.workspaceOpen({})
    if (res.rootPath) {
      set({ workspaceRoot: res.rootPath, fileTree: res.tree })
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

  refreshFileTree: async () => {
    if (!get().workspaceRoot) return
    try {
      const res = await window.api.workspaceTree({})
      if (res?.tree) {
        set({ fileTree: res.tree })
      }
    } catch {
    }
  },
})
