// M10 G5 — Windows 토스트는 AppUserModelID가 있는 앱에서만 뜬다. Electron 문서(tutorial/notifications)는 개발 중에
// app.setAppUserModelId(process.execPath)를 부르라고 한다. 패키지 빌드는 설치기가 바로 가기와 함께 정하므로 덮지 않는다.
import { describe, expect, it, vi } from 'vitest'
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
