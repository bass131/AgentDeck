import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipcContract'
import type {
  Profile,
  UiPrefs,
  UiPrefsSetReq,
  UsageInfo,
} from '../../../shared/ipcContract'
import type { PrefsStore } from '../../prefs'
import type { ProfileStore } from '../../profile'
import { getUsage } from '../../usage'

export interface PersonalizationHandlerDeps {
  getPrefsStore: () => PrefsStore | null
  getProfileStore: () => ProfileStore | null
}

export function registerPersonalizationHandlers(deps: PersonalizationHandlerDeps): void {
  const { getPrefsStore, getProfileStore } = deps

  ipcMain.handle(IPC_CHANNELS.UI_PREFS_GET, async (): Promise<UiPrefs> => {
    const store = getPrefsStore()
    if (!store) return {}
    return store.getAll()
  })

  ipcMain.handle(IPC_CHANNELS.UI_PREFS_SET, async (_e, req: UiPrefsSetReq): Promise<{ ok: boolean }> => {
    const store = getPrefsStore()
    if (!store) return { ok: false }
    const key = req?.key
    if (typeof key !== 'string' || key.trim().length === 0) {
      return { ok: false }
    }
    const ok = await store.set(key.trim(), req.value)
    return { ok }
  })

  ipcMain.handle(IPC_CHANNELS.PROFILE_GET, async (): Promise<Profile | null> => {
    const store = getProfileStore()
    if (!store) return null
    return store.get()
  })

  ipcMain.handle(IPC_CHANNELS.PROFILE_SET, async (_e, req: Profile): Promise<{ ok: boolean }> => {
    const store = getProfileStore()
    if (!store) return { ok: false }
    if (!req || typeof req !== 'object') return { ok: false }
    const nickname = req.nickname
    const color = req.color
    if (typeof nickname !== 'string' || nickname.trim().length === 0) {
      return { ok: false }
    }
    if (typeof color !== 'string') {
      return { ok: false }
    }
    const ok = await store.set({ nickname: nickname.trim(), color })
    return { ok }
  })

  ipcMain.handle(IPC_CHANNELS.USAGE_GET, async (): Promise<UsageInfo> => {
    return getUsage()
  })
}
