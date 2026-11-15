import { getPref } from '@renderer/11_Settings/prefs'
import { useAppStore } from '@renderer/00_App/appStore'
import { isConversationLayout, type WorkspaceMode } from './windowMode'

// 앱 시작 때의 화면 배치 복원 — 저장된 배치를 store에 넣고, 대화 하나의 배치일 때만 마지막 대화를 연다.
// main.tsx는 이 함수만 부른다(G9c, 단일·멀티 분기를 12_Window 안으로).
export function restoreSavedWorkspace(): void {
  const savedMode = getPref<WorkspaceMode>('workspace.mode', 'single')
  useAppStore.getState().setWorkspaceMode(savedMode)

  if (isConversationLayout(savedMode)) {
    void useAppStore.getState().restoreLastActiveConversation()
  }
}
