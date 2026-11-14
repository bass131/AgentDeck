import type { BackendId } from '../02_Common/common'

export const ENGINE_CHANNELS = {
  // M05 G10 재분류: app.getVersion·backend.list·usage.get → engine.* (계약도 personalization에서 이리로 옮겼다)
  APP_VERSION: 'engine.appVersion',
  ENGINE_INSTALL: 'engine.install',
  ENGINE_INSTALL_PROGRESS: 'engine.installProgress',
  ENGINE_SET_ACTIVE: 'engine.setActive',
  ENGINE_VERSION_STATE: 'engine.versionState',
  ENGINE_STATE: 'engine.state',
  ENGINE_CHECK_UPDATE: 'engine.checkUpdate',
  BACKEND_LIST: 'engine.listBackends',
  USAGE_GET: 'engine.usage',
} as const

export interface UsageWindow {
  pct: number
  resetsAt: number | null
}

export interface UsageInfo {
  fiveHour: UsageWindow | null
  weekly: UsageWindow | null
}

export interface EngineState {
  available: boolean
  authed: boolean
  version: string | null
}

export interface EngineUpdateInfo {
  current: string | null
  latest: string | null
  updateAvailable: boolean
}

export interface BackendStatus {
  id: BackendId
  name: string
  available: boolean
  version: string | null
  latestVersion: string | null
  authed: boolean
}

export interface EngineInstallRequest {
  version: string
}

export interface EngineInstallResult {
  ok: boolean
  error?: string
}

export interface EngineInstallProgress {
  version: string
  line?: string
  done?: boolean
  ok?: boolean
  error?: string
}

export interface EngineSetActiveRequest {
  version: string
}

export interface EngineVersionState {
  package: string
  bundled: string | null
  active: string | null
  installed: string[]
}
