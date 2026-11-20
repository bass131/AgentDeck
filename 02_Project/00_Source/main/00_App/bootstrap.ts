import { app, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import { getUserDataDir } from '@main/02_Common/userData'
import { getWorkspaceRootPath } from '@main/07_Workspace/roots'
import { registerIpc } from '@main/01_Ipc/index'
import { pushAlertOpen, pushAlerts, pushLoopState, pushMainState, pushSessionEvent } from '@main/01_Ipc/handlers/loop'
import { controlsForRun } from '@main/04_Claude/permission/controlsStore'
import { autoModeReasonOf, createLoopDriver, type LoopDriver } from '@main/05_Loop/loopDriver'
import { createLoopNotifier } from '@main/05_Loop/loopNotifier'
import { createNotifyPort } from '@main/05_Loop/realPorts/notifyPort'
import { disposeLspManager } from '@main/09_Lsp/manager'
import { applyDevAppUserModelId } from './appUserModel'
import { getBackend } from './registry'
import {
  ipcState,
  roots,
  runManager,
  initConversationStore,
  closeConversationStore,
  getStore,
  initStores,
  initLsp,
  disposeAllRuns,
  getPrefsStore,
  getProfileStore,
  getSkillsStore,
  getMcpStore,
  getCommandsStore,
  getModelListProvider,
} from './context'

// main 프로세스의 조립 지점 (M05 G11) — 객체 생성과 배선은 여기서 한 번 일어난다.
// 진입점(index.ts)은 창을 만들고 Electron 수명주기 이벤트에서 아래 셋을 부르기만 한다.
// 기동 순서: 대화 저장소 → (창 생성) → 창 붙이기. M10 G1에서 멀티 에이전트 모드를 지워 멀티 저장 경로 단계가 없어졌다
// (사용자 디스크의 옛 멀티 저장 파일은 지우지도 읽지도 않는다).

// 창을 만들기 전의 기동 — 실패해도 앱은 뜬다(영속화만 꺼진다)
export function startApp(): void {
  // M10 G5 — 개발 빌드에서도 Windows 알림이 뜨도록 AppUserModelID를 정한다(패키지 빌드는 설치기의 id를 쓴다)
  applyDevAppUserModelId(app)
  try {
    initConversationStore(join(getUserDataDir(), 'chats'))
  } catch (err) {
    console.error(
      '[main] 영속화 초기화 실패 — 대화 저장/복구 비활성. ' +
        'JSON 디렉토리 생성 또는 파일 I/O 오류:',
      err
    )
  }
}

let _registered = false
let _loopDriver: LoopDriver | null = null

// 창을 붙인다 — 첫 창에서만 store 다섯·LSP를 만들고 IPC 핸들러를 등록한다. 다음 창(activate)은 win만 바꾼다
export function attachWindow(win: BrowserWindow): void {
  ipcState.win = win
  if (_registered) return
  _registered = true

  initStores()
  initLsp()

  // M10 G5 — 알림 판정자. 구동자의 상태를 받아 사람을 부르는 사건을 정한다. 알림을 누르면 창을 앞으로 가져와 그 작업 폴더를 연다
  const loopAppDir = join(getUserDataDir(), 'loop')
  const notifier = createLoopNotifier({
    appDataDir: loopAppDir,
    notify: createNotifyPort(),
    onChange: (list) => pushAlerts(ipcState, list),
    onOpen: (cwd) => {
      const w = ipcState.win
      if (w && !w.isDestroyed()) {
        if (w.isMinimized()) w.restore()
        w.show()
        w.focus()
      }
      pushAlertOpen(ipcState, { cwd })
    },
  })

  // M09 G4 — 앱 안 루프 구동자. 앱 영역은 userData/loop, 상태 변화는 창으로 push, 자동 모드 허용 노드는 구동마다 다시 읽는다.
  _loopDriver = createLoopDriver({
    appDataDir: loopAppDir,
    backend: getBackend('claude-code'),
    autoModeCheck: () => autoModeReasonOf(controlsForRun(getUserDataDir())),
    onState: (s) => {
      pushLoopState(ipcState, s)
      void notifier.observe(s)
    },
    // M10 G2 — 메인 대화 보기와 루프 세션 사건(꼬리표 동봉)도 창으로 push한다
    onMainState: (v) => pushMainState(ipcState, v),
    onSessionEvent: (p) => pushSessionEvent(ipcState, p),
  })

  registerIpc({
    loopDriver: _loopDriver,
    loopAlerts: notifier,
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
    getModelList: () => getModelListProvider().load(),
  })
}

// 종료 정리 — 실행 중인 run과 LSP 서버를 닫고 대화 저장소를 닫는다. 루프 구동자는 닫기를 걸어 두고 기다리지 않는다(M09 G4 —
// 세션 취소·저장소 잠금 해제가 비동기다. 그 전에 프로세스가 끝나면 다음 열기가 죽은 잠금을 넘겨받고 저장본에서 이어 간다).
export function stopApp(): void {
  if (_loopDriver) void _loopDriver.closeAll().catch((err) => console.error('[main] 루프 구동자 닫기 실패:', err))
  disposeAllRuns()
  disposeLspManager()
  closeConversationStore()
}
