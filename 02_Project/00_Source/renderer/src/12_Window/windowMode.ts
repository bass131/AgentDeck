import type { StateCreator } from 'zustand'
import type { AppStore } from '@renderer/00_App/state/types'

// 화면 배치(대화 하나 / 멀티 패널) — 단일·멀티 분기의 유일한 거처는 12_Window다(G9c).
// store 필드 이름(workspaceMode)과 prefs 키('workspace.mode')는 그대로다.

export type WorkspaceMode = 'single' | 'multi'

export interface WindowModeState {
  workspaceMode: WorkspaceMode
}

export interface WindowModeActions {
  setWorkspaceMode: (mode: WorkspaceMode) => void
}

export const createWindowModeSlice: StateCreator<AppStore, [], [], WindowModeState & WindowModeActions> = (set) => ({
  workspaceMode: 'single' as const,

  setWorkspaceMode: (mode) => {
    set({ workspaceMode: mode })
  },
})

export const selectWorkspaceMode = (s: AppStore): WorkspaceMode => s.workspaceMode

// 대화 하나의 배치인가 — 배치에 따라 갈리는 시작 동작(마지막 대화 복원)이 묻는다.
export function isConversationLayout(mode: WorkspaceMode): boolean {
  return mode === 'single'
}
