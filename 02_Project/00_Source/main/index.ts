import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { startApp, attachWindow, stopApp } from './00_App/bootstrap'
import { getPrefsStore } from './00_App/context'
import { restoreBootZoom } from './12_Window/zoom'

// 진입점 — 창을 만들고 Electron 수명주기 이벤트를 조립 지점(00_App/bootstrap)에 잇는다 (M05 G11)
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

// M11 G4 — 앱은 한 벌만 돈다(같은 앱 영역). 둘째 실행은 기동하지 않고 끝나며, 첫 실행이 제 창을 앞으로 가져온다
function focusFirstWindow(): void {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', focusFirstWindow)

  app.whenReady().then(() => {
    startApp()

    const win = createWindow()
    attachWindow(win)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const newWin = createWindow()
        attachWindow(newWin)
      }
    })
  })

  app.on('before-quit', () => {
    stopApp()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
