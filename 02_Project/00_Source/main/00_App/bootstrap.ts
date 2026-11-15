import type { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { getUserDataDir } from '@main/02_Common/userData'
import { getWorkspaceRootPath } from '@main/07_Workspace/roots'
import { registerIpc } from '@main/01_Ipc/index'
import {
  ipcState,
  roots,
  runManager,
  initConversationStore,
  closeConversationStore,
  getStore,
  initStores,
  initLsp,
  initMultiStore,
  disposeAllRuns,
  getPrefsStore,
  getProfileStore,
  getSkillsStore,
  getMcpStore,
  getCommandsStore,
} from './context'

// main 프로세스의 조립 지점 (M05 G11) — 객체 생성과 배선은 여기서 한 번 일어난다.
// 진입점(index.ts)은 창을 만들고 Electron 수명주기 이벤트에서 아래 셋을 부르기만 한다.
// 기동 순서는 옮기기 전과 같다: 대화 저장소 → multi 경로 → (창 생성) → 창 붙이기.

// 창을 만들기 전의 기동 — 실패해도 앱은 뜬다(영속화만 꺼진다)
export function startApp(): void {
  try {
    initConversationStore(join(getUserDataDir(), 'chats'))
  } catch (err) {
    console.error(
      '[main] 영속화 초기화 실패 — 대화 저장/복구 비활성. ' +
        'JSON 디렉토리 생성 또는 파일 I/O 오류:',
      err
    )
  }

  try {
    initMultiStore(getUserDataDir())
  } catch (err) {
    console.error('[main] multiStore 초기화 실패 — 멀티 세션 영속 비활성:', err)
  }
}

let _registered = false

// 창을 붙인다 — 첫 창에서만 store 다섯·LSP를 만들고 IPC 핸들러를 등록한다. 다음 창(activate)은 win만 바꾼다
export function attachWindow(win: BrowserWindow): void {
  ipcState.win = win
  if (_registered) return
  _registered = true

  initStores()
  initLsp()

  registerIpc({
    state: ipcState,
    roots,
    runManager,
    getStore,
    getCurrentWorkspaceRoot: () => getWorkspaceRootPath(roots),
    getSkillsStore,
    getMcpStore,
    getCommandsStore,
    getPrefsStore,
    getProfileStore,
    getMultiStorePath: () => ipcState.multiStorePath,
  })
}

// 종료 정리 — 실행 중인 run을 닫고 대화 저장소를 닫는다
export function stopApp(): void {
  disposeAllRuns()
  closeConversationStore()
}
