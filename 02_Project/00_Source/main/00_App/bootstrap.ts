import { app, powerMonitor, safeStorage, shell, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import { getUserDataDir } from '@main/02_Common/userData'
import { getWorkspaceRootPath } from '@main/07_Workspace/roots'
import { registerIpc } from '@main/01_Ipc/index'
import { pushGithubState } from '@main/01_Ipc/handlers/github'
import { pushAlertOpen, pushAlerts, pushLoopState, pushMainState, pushSessionEvent } from '@main/01_Ipc/handlers/loop'
import { appGithubToken, setAppTokenSource } from '@main/14_GitHub/appToken'
import { fetchJson } from '@main/14_GitHub/deviceFlow'
import { createGithubAuth, githubBasesOf, githubClientIdOf } from '@main/14_GitHub/githubAuth'
import { GITHUB_AUTH_FILE, createTokenStore, storedToken } from '@main/14_GitHub/tokenStore'
import { controlsForRun } from '@main/04_Claude/permission/controlsStore'
import { limitInjectFileOf } from '@main/05_Loop/limitInjection'
import { autoModeReasonOf, createLoopDriver, recheckOnResume, type LoopDriver } from '@main/05_Loop/loopDriver'
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

// 실패해도 앱은 뜬다(영속화만 꺼진다)
export function startApp(): void {
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

// 첫 창에서만 store·LSP·IPC를 만든다. 다음 창(activate)은 win만 바꾼다
export function attachWindow(win: BrowserWindow): void {
  ipcState.win = win
  if (_registered) return
  _registered = true

  initStores()
  initLsp()

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

  const githubStore = createTokenStore({ file: join(getUserDataDir(), GITHUB_AUTH_FILE), safeStorage })
  setAppTokenSource(() => storedToken(githubStore))
  const githubAuth = createGithubAuth({
    store: githubStore,
    http: fetchJson,
    clientId: async () => githubClientIdOf(await getPrefsStore()?.getAll()),
    bases: githubBasesOf(process.env, app.isPackaged),
    openExternal: (url) => shell.openExternal(url),
    onChange: (s) => pushGithubState(ipcState, s),
  })

  const limitInjectFile = limitInjectFileOf(process.env, loopAppDir)
  _loopDriver = createLoopDriver({
    appDataDir: loopAppDir,
    tasteDataDir: getUserDataDir(),
    backend: getBackend('claude-code'),
    openExtras: { githubToken: appGithubToken, ...(limitInjectFile ? { limitInjectFile } : {}) },
    // 자동 모드 허용 노드는 구동마다 다시 읽는다
    autoModeCheck: () => autoModeReasonOf(controlsForRun(getUserDataDir())),
    onState: (s) => {
      pushLoopState(ipcState, s)
      void notifier.observe(s)
    },
    onMainState: (v) => pushMainState(ipcState, v),
    onSessionEvent: (p) => pushSessionEvent(ipcState, p),
  })

  registerIpc({
    githubAuth,
    openExternal: (url) => shell.openExternal(url),
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

  // 앱을 끌 때 열려 있던 작업 폴더를 다시 연다. 화면의 열기와 겹쳐도 구동자가 한 줄로 세운다
  void _loopDriver.reopenLast().catch((err) => console.error('[main] 루프 다시 열기 실패:', err))
  recheckOnResume(powerMonitor, _loopDriver)
}

// 루프 구동자 닫기는 기다리지 않는다. 세션 취소·잠금 해제가 끝나기 전에 프로세스가 끝나도
// 다음 열기가 죽은 잠금을 넘겨받고 저장본에서 이어 간다
export function stopApp(): void {
  if (_loopDriver) void _loopDriver.closeAll().catch((err) => console.error('[main] 루프 구동자 닫기 실패:', err))
  disposeAllRuns()
  disposeLspManager()
  closeConversationStore()
}
