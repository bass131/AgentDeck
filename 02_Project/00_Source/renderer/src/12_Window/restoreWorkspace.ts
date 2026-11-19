import { getPref } from '@renderer/11_Settings/prefs'
import { useAppStore } from '@renderer/00_App/appStore'
import { isConversationLayout, parseWorkspaceMode } from './windowMode'

// 앱 시작 때의 화면 모드 복원 — 저장된 모드를 store에 넣고, 대화 하나의 배치일 때만 마지막 대화를 연다.
// 저장값이 옛 'multi'나 모르는 값이면 「채팅」으로 읽는다(M10 G1).
// main.tsx는 이 함수만 부른다(G9c, 모드 분기를 12_Window 안으로).
export function restoreSavedWorkspace(): void {
  const savedMode = parseWorkspaceMode(getPref<unknown>('workspace.mode', 'single'))
  useAppStore.getState().setWorkspaceMode(savedMode)

  if (isConversationLayout(savedMode)) {
    void useAppStore.getState().restoreLastActiveConversation()
  }
}
