import { app } from 'electron'
import { IPC_CHANNELS, sendPush } from '@shared/ipcContract'
import { handle } from '../handle'
import type {
  EngineState,
  BackendStatus,
  EngineUpdateInfo,
  EngineInstallRequest,
  EngineInstallResult,
  EngineInstallProgress,
  EngineSetActiveRequest,
  UsageInfo,
} from '@shared/ipcContract'
import { setActive, installVersion } from '@main/10_Engine/engineVersions'
import { getUsage } from '@main/10_Engine/usage'
import { getEngineState } from '@main/10_Engine/engineState'
import { buildBackendStatuses } from '@main/00_App/backendStatus'
import { checkEngineUpdate } from '@main/10_Engine/engineCheckUpdate'
import { getBackend } from '@main/00_App/registry'

export function registerEngineHandlers(): void {

  handle(IPC_CHANNELS.ENGINE_STATE, async (): Promise<EngineState> => {
    return getEngineState()
  })

  handle(IPC_CHANNELS.BACKEND_LIST, async (): Promise<BackendStatus[]> => {
    return buildBackendStatuses()
  })

  handle(IPC_CHANNELS.ENGINE_CHECK_UPDATE, async (): Promise<EngineUpdateInfo> => {
    if (process.env.AGENTDECK_E2E_NO_ENGINE_UPDATE) {
      return { current: null, latest: null, updateAvailable: false }
    }
    const backend = getBackend()
    return checkEngineUpdate(backend)
  })

  handle(IPC_CHANNELS.APP_VERSION, async (): Promise<string> => {
    return app.getVersion()
  })

  handle(IPC_CHANNELS.USAGE_GET, async (): Promise<UsageInfo> => {
    return getUsage()
  })

  handle(IPC_CHANNELS.ENGINE_INSTALL, async (event, req: EngineInstallRequest): Promise<EngineInstallResult> => {
    const version = typeof req?.version === 'string' ? req.version.trim() : ''

    const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.]+)?$/
    if (!SEMVER_RE.test(version)) {
      return { ok: false, error: `invalid version: "${version}" — strict semver(X.Y.Z) 형식만 허용됩니다.` }
    }

    if (process.env.AGENTDECK_E2E_ENGINE_INSTALL) {
      const sender = event.sender
      const sendProgress = (p: EngineInstallProgress): void => {
        if (!sender.isDestroyed()) sendPush(sender, IPC_CHANNELS.ENGINE_INSTALL_PROGRESS, p)
      }
      sendProgress({ version, line: '[e2e stub] 가짜 npm 설치 시작' })
      sendProgress({ version, line: '[e2e stub] npm http fetch GET 200 OK' })
      sendProgress({ version, line: '[e2e stub] 완료' })
      sendProgress({ version, done: true, ok: true })
      return { ok: true }
    }

    const sender = event.sender
    const result = await installVersion(version, (p) => {
      if (!sender.isDestroyed()) sendPush(sender, IPC_CHANNELS.ENGINE_INSTALL_PROGRESS, p)
    })
    return result
  })

  handle(IPC_CHANNELS.ENGINE_SET_ACTIVE, (_e, req: EngineSetActiveRequest): { ok: boolean } => {
    try {
      const version = typeof req?.version === 'string' ? req.version.trim() : null
      setActive(version || null)
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })
}
