export const PERSONALIZATION_CHANNELS = {
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
