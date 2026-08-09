import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { createConversationStore } from './04_persistence/store'
import type { ConversationStore } from './04_persistence/store'
import { registerIpc, setStore, initMultiStore, disposeAllRuns, getPrefsStore } from './00_ipc/index'
import { restoreBootZoom } from './06_window/zoom'

function createWindow(): BrowserWindow {
  const { width: areaW, height: areaH } = screen.getPrimaryDisplay().workAreaSize
  const width = Math.min(1920, areaW)
  const height = Math.min(1080, areaH)

  const win = new BrowserWindow({
    width,
    height,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.on('did-finish-load', () => {
    void restoreBootZoom({
      getUiPrefs: async () => (await getPrefsStore()?.getAll()) ?? {},
      applyZoomFactor: (factor) => win.webContents.setZoomFactor(factor),
    })
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

let _store: ConversationStore | null = null

app.whenReady().then(() => {
  try {
    const chatsDir = join(app.getPath('userData'), 'chats')
    _store = createConversationStore(chatsDir)
    setStore(_store)
  } catch (err) {
    console.error(
      '[main] 영속화 초기화 실패 — 대화 저장/복구 비활성. ' +
        'JSON 디렉토리 생성 또는 파일 I/O 오류:',
      err
    )
  }

  try {
    initMultiStore(app.getPath('userData'))
  } catch (err) {
    console.error('[main] multiStore 초기화 실패 — 멀티 세션 영속 비활성:', err)
  }

  const win = createWindow()
  registerIpc(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWin = createWindow()
      registerIpc(newWin)
    }
  })
})

app.on('before-quit', () => {
  disposeAllRuns()
  _store?.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
