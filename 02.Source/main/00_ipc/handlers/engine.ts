/**
 * handlers/engine.ts — engine 도메인 핸들러 등록
 *
 * 채널: ENGINE_STATE · BACKEND_LIST · ENGINE_CHECK_UPDATE · APP_VERSION
 *       ENGINE_INSTALL · ENGINE_SET_ACTIVE · ENGINE_VERSION_STATE
 *
 * CRITICAL(신뢰경계 ADR-008 — 절대 규칙):
 *   - 반환값: 버전 문자열·boolean 필드만 — OAuth 토큰·API 키·시크릿 0.
 *   - engine.install: version은 untrusted — strict semver 검증 후만 npm 인자화.
 *   - engine.install progress: event.sender로만 push (요청 창만, 전역 win 아님).
 *   - engine.checkUpdate: 오프라인/탐지불가 → { current:null, latest:null, updateAvailable:false }.
 *   - AGENTDECK_E2E_*: e2e 게이트 하네스만 설정 — 다른 코드에서 설정 금지.
 *
 * ADR-003: 구체 엔진 미인지 — registry 경유 getBackend()만 사용.
 */

import { ipcMain, app } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipc-contract'
import type {
  EngineState,
  BackendStatus,
  EngineUpdateInfo,
  EngineInstallRequest,
  EngineInstallResult,
  EngineInstallProgress,
  EngineSetActiveRequest,
  EngineVersionState,
} from '../../../shared/ipc-contract'
import { getVersionState, setActive, installVersion } from '../../engine-versions'
import { getEngineState } from '../../engine-state'
import { buildBackendStatuses } from '../../backend-status'
import { checkEngineUpdate } from '../engine-check-update'
import { getBackend } from '../../01_agents/registry'

// ── 핸들러 등록 ──────────────────────────────────────────────────────────────

/** engine 도메인 IPC 핸들러를 등록한다. 의존성 없음 (모두 싱글턴/순수 모듈). */
export function registerEngineHandlers(): void {

  // ── engine.state (P3) ─────────────────────────────────────────────────────
  // CRITICAL(ADR-008): authed는 불리언만 — 토큰/키 값 절대 미노출.

  ipcMain.handle(IPC_CHANNELS.ENGINE_STATE, async (): Promise<EngineState> => {
    return getEngineState()
  })

  // ── backend.list (B1) ─────────────────────────────────────────────────────
  // CRITICAL(ADR-003): 구체 엔진 분기는 registry/engine-state 내부에만.

  ipcMain.handle(IPC_CHANNELS.BACKEND_LIST, async (): Promise<BackendStatus[]> => {
    return buildBackendStatuses()
  })

  // ── engine.checkUpdate ────────────────────────────────────────────────────
  // AGENTDECK_E2E_NO_ENGINE_UPDATE: e2e 비결정성 차단 게이트.

  ipcMain.handle(IPC_CHANNELS.ENGINE_CHECK_UPDATE, async (): Promise<EngineUpdateInfo> => {
    if (process.env.AGENTDECK_E2E_NO_ENGINE_UPDATE) {
      return { current: null, latest: null, updateAvailable: false }
    }
    const backend = getBackend()
    return checkEngineUpdate(backend)
  })

  // ── app.getVersion (P4) ───────────────────────────────────────────────────
  // 원본 AgentCodeGUI `ipcMain.handle(IPC.appGetVersion, () => app.getVersion())` 미러.

  ipcMain.handle(IPC_CHANNELS.APP_VERSION, async (): Promise<string> => {
    return app.getVersion()
  })

  // ── engine.install (ADR-018) ──────────────────────────────────────────────
  // CRITICAL: version은 untrusted — strict semver 검증 후만 npm 인자화.
  //   e2e 스텁 게이트: AGENTDECK_E2E_ENGINE_INSTALL 설정 시 가짜 progress + ok:true.
  //   progress: event.sender로만 push (요청 창만 — 전역 _win 대신).

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

  // ── engine.setActive (ADR-018) ────────────────────────────────────────────
  // CRITICAL: version은 untrusted — setActive 내부에서 installed 목록 검증.

  ipcMain.handle(IPC_CHANNELS.ENGINE_SET_ACTIVE, (_e, req: EngineSetActiveRequest): { ok: boolean } => {
    try {
      const version = typeof req?.version === 'string' ? req.version.trim() : null
      setActive(version || null)
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })

  // ── engine.versionState (ADR-018) ─────────────────────────────────────────
  // CRITICAL: 기존 EngineState(authed 전용)와 완전히 별개 — 혼동 금지.

  ipcMain.handle(IPC_CHANNELS.ENGINE_VERSION_STATE, (): EngineVersionState => {
    return getVersionState()
  })
}
