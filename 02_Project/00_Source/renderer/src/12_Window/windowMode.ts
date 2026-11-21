import type { StateCreator } from 'zustand'
import type { AppStore } from '@renderer/00_App/state/types'

// 화면 모드(채팅 / 작업) — 모드 분기의 유일한 거처는 12_Window다.
// 화면 이름은 「채팅」(대화 하나)과 「작업」(마일스톤 루프)이다.
// store 필드 이름(workspaceMode)과 prefs 키('workspace.mode')는 그대로다.

export type WorkspaceMode = 'single' | 'work'

// 저장된 모드 값 읽기 — 지금 모르는 값(옛 'multi' 포함)은 「채팅」으로 읽는다. 저장 파일은 고치지 않는다.
export function parseWorkspaceMode(saved: unknown): WorkspaceMode {
  return saved === 'work' ? 'work' : 'single'
}

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
