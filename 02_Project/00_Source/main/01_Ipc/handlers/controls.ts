import { IPC_CHANNELS } from '@shared/ipcContract'
import type { Ack, ControlSetEnabledReq, ControlsState } from '@shared/ipcContract'
import { handle } from '../handle'
import { getUserDataDir } from '@main/02_Common/userData'
import { getVersionState } from '@main/10_Engine/engineVersions'
import { controlsState, setControlEnabled, confirmControls } from '@main/04_Claude/permission/controlsStore'

// 컨트롤 패널 (M07 G5) — 노드 목록과 켜짐, controls.json 봉인 상태, 엔진 봉인 상태(G4)를 renderer에 준다.
// 엔진 쪽은 읽기만 한다. 다시 고르기는 기존 engine.setActive 경로가 맡는다.
export function registerControlsHandlers(): void {
  handle(IPC_CHANNELS.CONTROLS_STATE, (): ControlsState => {
    const userData = getUserDataDir()
    const engine = getVersionState(userData)
    return { ...controlsState(userData), engine: { seal: engine.seal, active: engine.active } }
  })

  handle(IPC_CHANNELS.CONTROLS_SET_ENABLED, (_e, req: ControlSetEnabledReq): Ack => {
    if (!req || typeof req.id !== 'string' || typeof req.enabled !== 'boolean') {
      return { ok: false, error: 'invalid request: { id: string, enabled: boolean }' }
    }
    return setControlEnabled(getUserDataDir(), req.id, req.enabled)
  })

  handle(IPC_CHANNELS.CONTROLS_CONFIRM, (): Ack => confirmControls(getUserDataDir()))
}
