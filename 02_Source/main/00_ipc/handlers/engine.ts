import { ipcMain, app } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipcContract'
import type {
  EngineState,
  BackendStatus,
  EngineUpdateInfo,
  EngineInstallRequest,
  EngineInstallResult,
  EngineInstallProgress,
  EngineSetActiveRequest,
  EngineVersionState,
} from '../../../shared/ipcContract'
import { getVersionState, setActive, installVersion } from '../../07_engine/engineVersions'
import { getEngineState } from '../../07_engine/engineState'
import { buildBackendStatuses } from '../../07_engine/backendStatus'
import { checkEngineUpdate } from '../engineCheckUpdate'
import { getBackend } from '../../01_agents/registry'

export function registerEngineHandlers(): void {

  ipcMain.handle(IPC_CHANNELS.ENGINE_STATE, async (): Promise<EngineState> => {
    return getEngineState()
  })

  ipcMain.handle(IPC_CHANNELS.BACKEND_LIST, async (): Promise<BackendStatus[]> => {
    return buildBackendStatuses()
  })

  ipcMain.handle(IPC_CHANNELS.ENGINE_CHECK_UPDATE, async (): Promise<EngineUpdateInfo> => {
    if (process.env.AGENTDECK_E2E_NO_ENGINE_UPDATE) {
      return { current: null, latest: null, updateAvailable: false }
    }
    const backend = getBackend()
    return checkEngineUpdate(backend)
  })

  ipcMain.handle(IPC_CHANNELS.APP_VERSION, async (): Promise<string> => {
    return app.getVersion()
  })

  ipcMain.handle(IPC_CHANNELS.ENGINE_INSTALL, async (event, req: EngineInstallRequest): Promise<EngineInstallResult> => {
    const version = typeof req?.version === 'string' ? req.version.trim() : ''

    const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.]+)?$/
    if (!SEMVER_RE.test(version)) {
      return { ok: false, error: `invalid version: "${version}" — strict semver(X.Y.Z) 형식만 허용됩니다.` }
    }

    if (process.env.AGENTDECK_E2E_ENGINE_INSTALL) {
      const sender = event.sender
      const sendProgress = (p: EngineInstallProgress): void => {
        if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.ENGINE_INSTALL_PROGRESS, p)
      }
      sendProgress({ version, line: '[e2e stub] 가짜 npm 설치 시작' })
      sendProgress({ version, line: '[e2e stub] npm http fetch GET 200 OK' })
      sendProgress({ version, line: '[e2e stub] 완료' })
      sendProgress({ version, done: true, ok: true })
      return { ok: true }
    }

    const sender = event.sender
    const result = await installVersion(version, (p) => {
      if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.ENGINE_INSTALL_PROGRESS, p)
    })
    return result
  })

  ipcMain.handle(IPC_CHANNELS.ENGINE_SET_ACTIVE, (_e, req: EngineSetActiveRequest): { ok: boolean } => {
    try {
      const version = typeof req?.version === 'string' ? req.version.trim() : null
      setActive(version || null)
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })

  ipcMain.handle(IPC_CHANNELS.ENGINE_VERSION_STATE, (): EngineVersionState => {
    return getVersionState()
  })
}
