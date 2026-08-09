export const PERSONALIZATION_CHANNELS = {
  PROFILE_GET: 'profile.get',
  PROFILE_SET: 'profile.set',
  UI_PREFS_GET: 'ui.getPrefs',
  UI_PREFS_SET: 'ui.setPref',
  USAGE_GET: 'usage.get',
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

export interface UsageWindow {
  pct: number
  resetsAt: number | null
}

export interface UsageInfo {
  fiveHour: UsageWindow | null
  weekly: UsageWindow | null
}

export const ZOOM_FACTOR_RANGE = {
  MIN: 0.5,
  MAX: 2.0,
} as const

export const ZOOM_FACTOR_STEP = 0.1
