import type { Ack, BackendId } from '../02_Common/common'

export const ENGINE_CHANNELS = {
  // M05 G10 재분류: app.getVersion·backend.list·usage.get → engine.* (계약도 personalization에서 이리로 옮겼다)
  APP_VERSION: 'engine.appVersion',
  ENGINE_INSTALL: 'engine.install',
  ENGINE_INSTALL_PROGRESS: 'engine.installProgress',
  ENGINE_SET_ACTIVE: 'engine.setActive',
  // M05 G10: renderer가 부르지 않던 engine.versionState는 지웠다 (EngineVersionState 타입은 main 내부가 쓴다)
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

// M05 G10 ack 통일: 공용 Ack의 별칭 (모양 무변경)
export type EngineInstallResult = Ack

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

// M07 G4 엔진 봉인 상태 — ok: 앱이 고른 그대로 · missing: 봉인 없음 · mismatch: 앱 밖에서 바뀜
// below-floor: 번들보다 낮은 버전 · none: 고른 엔진 없음(번들 사용)
// restart: 이 프로세스가 같은 버전을 다른 내용으로 이미 불러왔다 — 다시 고른 내용은 앱 재시작 뒤에 쓰인다.
// ok가 아니면 번들 엔진을 쓴다.
export type EngineSealStatus = 'ok' | 'missing' | 'mismatch' | 'below-floor' | 'none' | 'restart'

export interface EngineVersionState {
  package: string
  bundled: string | null
  active: string | null
  installed: string[]
  seal: EngineSealStatus
}
