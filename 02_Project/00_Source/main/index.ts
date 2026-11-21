import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { startApp, attachWindow, stopApp } from './00_App/bootstrap'
import { getPrefsStore } from './00_App/context'
import { restoreBootZoom } from './12_Window/zoom'

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

// 두 실행이 같은 앱 영역을 나눠 쓰지 않게 한 벌만 돈다. 둘째 실행은 첫 창을 앞으로 가져오고 끝난다
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
