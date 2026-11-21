import { getPref } from '@renderer/11_Settings/prefs'
import { useAppStore } from '@renderer/00_App/appStore'
import { parseWorkspaceMode } from './windowMode'

// 앱 시작 때의 화면 모드 복원 — 저장된 모드를 store에 넣고, 채팅의 마지막 대화를 연다.
// 저장값이 옛 'multi'나 모르는 값이면 「채팅」으로 읽는다.
// 「작업」 모드로 켜도 채팅의 마지막 대화를 store에 복원해 둔다 — 채팅 모드로 돌아가면 그 대화로 뜬다.
// 작업 모드의 작업 폴더 복원은 Shell(work.cwd)이 한다.
// 채팅으로 처음 돌아갈 때 복원하는 길은 두지 않는다 — 사이드바에서 고른 대화와 경쟁한다.
// main.tsx는 모드 분기를 12_Window 안에 두려고 이 함수만 부른다.
export function restoreSavedWorkspace(): void {
  const savedMode = parseWorkspaceMode(getPref<unknown>('workspace.mode', 'single'))
  useAppStore.getState().setWorkspaceMode(savedMode)
  void useAppStore.getState().restoreLastActiveConversation()
}
