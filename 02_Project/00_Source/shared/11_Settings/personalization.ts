export const PERSONALIZATION_CHANNELS = {
  // M05 G10 재분류: profile.*·ui.* → settings.* (usage.get은 engine.usage로 10_Engine/engine.ts에 옮겼다)
  PROFILE_GET: 'settings.getProfile',
  PROFILE_SET: 'settings.setProfile',
  UI_PREFS_GET: 'settings.getUiPrefs',
  UI_PREFS_SET: 'settings.setUiPref',
} as const

export interface Profile {
  nickname: string
  color: string
}

export type UiPrefs = Record<string, unknown>

export interface UiPrefsSetReq {
  key: string
  value: unknown
}

export const ZOOM_FACTOR_RANGE = {
  MIN: 0.5,
  MAX: 2.0,
} as const

export const ZOOM_FACTOR_STEP = 0.1
