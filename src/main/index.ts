import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { createConversationStore } from './persistence/store'
import type { ConversationStore } from './persistence/store'
import { registerIpc, setStore } from './ipc/index'

// 신뢰 경계(헌법 CRITICAL): renderer는 untrusted.
//   contextIsolation: true  — renderer와 preload 컨텍스트 격리
//   nodeIntegration: false  — renderer에서 Node 직접 접근 차단
//   sandbox: false          — preload에서 일부 Node API 사용(향후 IPC 브릿지). 노출은 preload 화이트리스트로 통제.
function createWindow(): BrowserWindow {
  // 첫 실행 기본 해상도: FHD(1920×1080) 기준.
  // 실제 모니터 작업영역으로 클램프 — FHD인 화면에선 작업영역을 가득(작업표시줄 제외),
  // 더 큰 화면에선 정확히 1920×1080으로 중앙 배치(x/y 미지정 시 Electron 기본 중앙).
  const { width: areaW, height: areaH } = screen.getPrimaryDisplay().workAreaSize
  const width = Math.min(1920, areaW)
  const height = Math.min(1080, areaH)

  const win = new BrowserWindow({
    width,
    height,
    minWidth: 1024,
    minHeight: 680,
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

// 영속화 store는 모듈 스코프 — 종료 시 연결을 닫기 위해.
let _store: ConversationStore | null = null

app.whenReady().then(() => {
  // DB 영속화 초기화. better-sqlite3 ABI 불일치(예: test:e2e 후 node ABI 잔존)나
  // DB 손상 등으로 실패해도 *앱이 죽지 않도록 방어* — persistence만 비활성, 창은 정상 오픈.
  // ADR-008: conversations 테이블에 시크릿 컬럼 없음(평문 키 저장 금지).
  try {
    const dbPath = join(app.getPath('userData'), 'conversations.db')
    _store = createConversationStore(dbPath)
    setStore(_store)
  } catch (err) {
    console.error(
      '[main] 영속화 초기화 실패 — 대화 저장/복구 비활성. ' +
        'better-sqlite3 ABI 불일치면 `npm run rebuild:native` 실행:',
      err
    )
  }

  const win = createWindow()
  registerIpc(win) // IPC 핸들러 등록 (8채널)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWin = createWindow()
      registerIpc(newWin)
    }
  })
})

// 앱 종료 시 DB 연결 닫기 (store 초기화 실패 시 no-op)
app.on('before-quit', () => {
  _store?.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
