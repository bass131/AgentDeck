// M10 G5 — Windows 토스트는 AppUserModelID가 있는 앱에서만 뜬다. Electron 문서(tutorial/notifications)는 개발 중에
// app.setAppUserModelId(process.execPath)를 부르라고 한다. 패키지 빌드는 설치기가 바로 가기와 함께 정하므로 덮지 않는다.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyDevAppUserModelId, devAppUserModelId } from '@main/00_App/appUserModel'

describe('개발 빌드의 AppUserModelID (M10 G5)', () => {
  it('Windows의 패키지 안 된 실행에서만 실행 파일 경로를 id로 쓴다', () => {
    expect(devAppUserModelId({ platform: 'win32', isPackaged: false, execPath: 'C:/e/electron.exe' })).toBe('C:/e/electron.exe')
    expect(devAppUserModelId({ platform: 'win32', isPackaged: true, execPath: 'C:/e/AgentDeck.exe' })).toBeNull()
    expect(devAppUserModelId({ platform: 'darwin', isPackaged: false, execPath: '/e/Electron' })).toBeNull()
  })

  it('정한 id가 있을 때만 setAppUserModelId를 한 번 부른다', () => {
    const set = vi.fn()
    applyDevAppUserModelId({ isPackaged: false, setAppUserModelId: set }, 'win32', 'C:/e/electron.exe')
    applyDevAppUserModelId({ isPackaged: true, setAppUserModelId: set }, 'win32', 'C:/e/AgentDeck.exe')
    applyDevAppUserModelId({ isPackaged: false, setAppUserModelId: set }, 'linux', '/e/electron')
    expect(set.mock.calls).toEqual([['C:/e/electron.exe']])
  })
})

// M11 G4 — 진입점(index.ts)을 electron·조립 지점 대역으로 불러 단일 인스턴스 잠금의 배선을 본다
describe('단일 인스턴스 (M11 G4)', () => {
  const MOCKED = ['electron', '@main/00_App/bootstrap', '@main/00_App/context', '@main/12_Window/zoom']
  async function boot(lock: boolean) {
    vi.resetModules()
    const on = new Map<string, (...a: unknown[]) => void>()
    const windows: { show: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn>; restore: ReturnType<typeof vi.fn>; minimized: boolean }[] = []
    const app = {
      requestSingleInstanceLock: vi.fn(() => lock),
      quit: vi.fn(),
      whenReady: vi.fn(() => Promise.resolve()),
      on: vi.fn((ev: string, fn: (...a: unknown[]) => void) => { on.set(ev, fn); return app }),
    }
    class BrowserWindow {
      static getAllWindows = (): unknown[] => windows
      webContents = { on: vi.fn(), setZoomFactor: vi.fn() }
      minimized = false
      on = vi.fn(); loadURL = vi.fn(); loadFile = vi.fn(); show = vi.fn(); focus = vi.fn(); restore = vi.fn()
      constructor() { windows.push(this) }
      isMinimized = (): boolean => this.minimized
      isDestroyed = (): boolean => false
    }
    const startApp = vi.fn()
    const attachWindow = vi.fn()
    const stopApp = vi.fn()
    vi.doMock('electron', () => ({ app, BrowserWindow, screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) } }))
    vi.doMock('@main/00_App/bootstrap', () => ({ startApp, attachWindow, stopApp }))
    vi.doMock('@main/00_App/context', () => ({ getPrefsStore: () => null }))
    vi.doMock('@main/12_Window/zoom', () => ({ restoreBootZoom: vi.fn() }))
    await import('@main/index')
    await new Promise((r) => setTimeout(r, 0))
    return { app, on, startApp, attachWindow, windows }
  }
  afterEach(() => {
    for (const m of MOCKED) vi.doUnmock(m)
    vi.resetModules()
  })

  it('[M11-G4 M10-18] 잠금을 못 잡은 둘째 실행은 기동하지 않고 끝난다 — 종료 정리(before-quit)도 걸지 않는다', async () => {
    const { app, on, startApp, windows } = await boot(false)
    expect(app.requestSingleInstanceLock).toHaveBeenCalledTimes(1)
    expect(app.quit).toHaveBeenCalledTimes(1)
    expect(app.whenReady).not.toHaveBeenCalled()
    expect(startApp).not.toHaveBeenCalled()
    expect(windows).toHaveLength(0)
    expect(on.has('before-quit')).toBe(false)
  })

  it('[M11-G4 M10-18] 잠금을 잡은 첫 실행은 기동하고, 둘째 실행이 오면 첫 창을 앞으로 가져온다', async () => {
    const { app, on, startApp, attachWindow, windows } = await boot(true)
    expect(app.quit).not.toHaveBeenCalled()
    expect(startApp).toHaveBeenCalledTimes(1)
    expect(attachWindow).toHaveBeenCalledTimes(1)
    expect(windows).toHaveLength(1)
    windows[0].minimized = true
    on.get('second-instance')?.()
    expect(windows[0].restore).toHaveBeenCalledTimes(1)
    expect(windows[0].show).toHaveBeenCalled()
    expect(windows[0].focus).toHaveBeenCalledTimes(1)
  })
})
