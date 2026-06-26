import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { createConversationStore } from './persistence/store'
import type { ConversationStore } from './persistence/store'
import { registerIpc, setStore, initMultiStore, disposeAllRuns } from './ipc/index'

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
    // 충실도 F1-b: 투명 frameless 셸 — 16px inset 둥근 카드 뒤로 데스크톱이 비친다.
    // 커스텀 타이틀바(드래그)·리사이즈 핸들은 renderer + 수동 IPC 제어(window/controls.ts).
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
  // JSON fan-out 영속화 초기화 (ADR-006 supersede → JSON 통일).
  // 파일 I/O 실패해도 *앱이 죽지 않도록 방어* — persistence만 비활성, 창은 정상 오픈.
  // ADR-008: ConversationRecord에 시크릿 컬럼 없음(평문 키 저장 금지).
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

  // multiStore 경로 초기화 (M3 — 멀티 세션 영속, store M1 동형 패턴).
  // app.getPath('userData')는 electron ready 이후에만 유효.
  // best-effort: 실패 시 multiSession.load/save 핸들러가 null 경로로 graceful 처리.
  try {
    initMultiStore(app.getPath('userData'))
  } catch (err) {
    console.error('[main] multiStore 초기화 실패 — 멀티 세션 영속 비활성:', err)
  }

  const win = createWindow()
  registerIpc(win) // IPC 핸들러 등록 (11 invoke + AGENT_EVENT)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWin = createWindow()
      registerIpc(newWin)
    }
  })
})

// 앱 종료 시: 활성 세션 전부 종료(좀비 0, ADR-024 (4a)) + DB 연결 닫기.
// 끄면 세션은 죽는다 — 끈 뒤에도 도는 auto-revive는 두지 않음. 맥락 복원은 다음 프롬프트 resume.
app.on('before-quit', () => {
  disposeAllRuns()
  _store?.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
