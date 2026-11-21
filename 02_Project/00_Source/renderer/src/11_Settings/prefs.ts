import type { UiPrefs } from '@shared/ipcContract'
import { ipc, hasBridge } from '@renderer/01_Ipc'

let _cache: UiPrefs = {}

let _loaded = false

export async function loadPrefs(): Promise<void> {
  try {
    const raw = await ipc.settings.getUiPrefs()
    _cache = raw != null ? raw : {}
  } catch {
    _cache = {}
  }
  _loaded = true
}

export function getPref<T>(key: string, fallback: T): T {
  if (!_loaded) return fallback
  const v = _cache[key]
  return v === undefined || v === null ? fallback : (v as T)
}

export function setPref(key: string, value: unknown): void {
  _cache = { ..._cache, [key]: value }

  if (!hasBridge() || typeof ipc.settings.setUiPref !== 'function') return
  ipc.settings.setUiPref({ key, value }).catch(() => {
  })
}
