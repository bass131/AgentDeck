import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { createConversationStore } from './persistence/store'
import { registerIpc, setStore } from './ipc/index'

// 신뢰 경계(헌법 CRITICAL): renderer는 untrusted.
//   contextIsolation: true  — renderer와 preload 컨텍스트 격리
//   nodeIntegration: false  — renderer에서 Node 직접 접근 차단
//   sandbox: false          — preload에서 일부 Node API 사용(향후 IPC 브릿지). 노출은 preload 화이트리스트로 통제.
function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: '#0e0f12',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // 개발: electron-vite가 주입하는 dev 서버 URL / 프로덕션: 번들된 index.html
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  // DB 경로: userData(앱 전용 디렉토리) + conversations.db
  // ADR-008: API 키 평문 저장 금지 — conversations 테이블에 시크릿 컬럼 없음.
  const dbPath = join(app.getPath('userData'), 'conversations.db')
  const store = createConversationStore(dbPath)
  setStore(store)

  const win = createWindow()

  // IPC 핸들러 등록 (8채널 전체)
  registerIpc(win)

  // DB 정리: 앱 종료 시 연결 닫기
  app.on('before-quit', () => {
    store.close()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWin = createWindow()
      registerIpc(newWin)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
