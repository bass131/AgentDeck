// 시작하기 안내 IPC — gh 확인과 설치 안내 주소 열기 둘이다. 열기는 요청을 받지 않고 고정 주소 하나만 연다.
import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ handlers: new Map<string, (...a: unknown[]) => unknown>() }))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown): void => { h.handlers.set(ch, fn) },
  },
}))

import { registerOnboardingHandlers } from '@main/01_Ipc/handlers/onboarding'
import { API_ROUTES } from '@shared/01_Ipc/apiRoutes'
import { GH_INSTALL_URL, ONBOARDING_CHANNELS } from '@shared/ipcContract'

const call = (ch: string, req?: unknown): Promise<unknown> =>
  Promise.resolve((h.handlers.get(ch) as (...a: unknown[]) => unknown)({}, req))

describe('시작하기 안내 IPC', () => {
  it('채널은 gh 확인과 설치 안내 열기 둘이고, 둘 다 요청 없이 부른다', () => {
    expect(Object.values(ONBOARDING_CHANNELS).sort()).toEqual(['onboarding.ghCheck', 'onboarding.openGhInstall'])
    expect(API_ROUTES.onboarding).toEqual({
      ghCheck: { kind: 'call0', channel: 'onboarding.ghCheck' },
      openGhInstall: { kind: 'call0', channel: 'onboarding.openGhInstall' },
    })
  })

  it('gh 확인은 주입한 확인 함수의 결과를 그대로 돌려준다', async () => {
    registerOnboardingHandlers({ openExternal: async () => undefined, checkGh: async () => ({ state: 'timeout' }) })
    expect(await call(ONBOARDING_CHANNELS.ONBOARDING_GH_CHECK)).toEqual({ state: 'timeout' })
  })

  it('설치 안내 열기는 요청에 무엇이 와도 공식 주소 하나만 연다', async () => {
    const openExternal = vi.fn(async () => undefined)
    registerOnboardingHandlers({ openExternal, checkGh: async () => ({ state: 'absent' }) })
    expect(await call(ONBOARDING_CHANNELS.ONBOARDING_OPEN_GH_INSTALL, { url: 'https://evil.example' })).toEqual({ ok: true })
    expect(openExternal).toHaveBeenCalledTimes(1)
    expect(openExternal).toHaveBeenCalledWith('https://cli.github.com')
    expect(GH_INSTALL_URL).toBe('https://cli.github.com')
  })

  it('브라우저를 열지 못하면 거짓과 사유를 돌려준다', async () => {
    registerOnboardingHandlers({ openExternal: async () => { throw new Error('no browser') }, checkGh: async () => ({ state: 'absent' }) })
    expect(await call(ONBOARDING_CHANNELS.ONBOARDING_OPEN_GH_INSTALL)).toEqual({ ok: false, error: '브라우저를 열지 못했어요' })
  })

  it('IPC 등록부는 GitHub 연결이 없어도 두 채널을 등록하고, 받은 여는 함수로 연다', async () => {
    h.handlers.clear()
    const { registerIpc } = await import('@main/01_Ipc/index')
    const stub = (): null => null
    const openExternal = vi.fn(async () => undefined)
    registerIpc({
      state: { win: null }, roots: {} as never, runManager: {} as never,
      getStore: stub, getCurrentWorkspaceRoot: stub, getSkillsStore: stub, getMcpStore: stub,
      getCommandsStore: stub, getPrefsStore: stub, getProfileStore: stub,
      openExternal,
    })
    expect(h.handlers.has(ONBOARDING_CHANNELS.ONBOARDING_GH_CHECK)).toBe(true)
    expect(await call(ONBOARDING_CHANNELS.ONBOARDING_OPEN_GH_INSTALL)).toEqual({ ok: true })
    expect(openExternal).toHaveBeenCalledWith(GH_INSTALL_URL)
  })

  it('여는 함수가 없으면 열지 않고 거짓을 돌려준다', async () => {
    registerOnboardingHandlers({ checkGh: async () => ({ state: 'absent' }) })
    expect(await call(ONBOARDING_CHANNELS.ONBOARDING_OPEN_GH_INSTALL)).toEqual({ ok: false, error: '브라우저를 열지 못했어요' })
  })
})
