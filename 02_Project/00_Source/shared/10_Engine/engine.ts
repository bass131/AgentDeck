import type { BackendId } from './common'

export const ENGINE_CHANNELS = {
  APP_VERSION: 'app.getVersion',
  ENGINE_INSTALL: 'engine.install',
  ENGINE_INSTALL_PROGRESS: 'engine.installProgress',
  ENGINE_SET_ACTIVE: 'engine.setActive',
  ENGINE_VERSION_STATE: 'engine.versionState',
  ENGINE_STATE: 'engine.state',
  ENGINE_CHECK_UPDATE: 'engine.checkUpdate',
  BACKEND_LIST: 'backend.list',
} as const

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
