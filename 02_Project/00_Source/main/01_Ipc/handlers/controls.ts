import { IPC_CHANNELS } from '@shared/ipcContract'
import type { Ack, ControlConfirmReq, ControlSetEnabledReq, ControlsState } from '@shared/ipcContract'
import { handle } from '../handle'
import { getUserDataDir } from '@main/02_Common/userData'
import { getVersionState } from '@main/10_Engine/engineVersions'
import { controlsState, setControlEnabled, confirmControls } from '@main/04_Claude/permission/controlsStore'

// 컨트롤 패널 (M07 G5) — 노드 목록과 켜짐, controls.json 봉인 상태, 엔진 봉인 상태(G4)를 renderer에 준다.
// 엔진 쪽은 읽기만 한다. 다시 고르기는 기존 engine.setActive 경로가 맡는다.
// 두 쪽은 따로 읽는다 — 한쪽 오류가 패널 전체를 막으면, 실행 거절이 가리키는 패널에서 할 일이 없어진다(G5 검수 사소 4).
export function registerControlsHandlers(): void {
  handle(IPC_CHANNELS.CONTROLS_STATE, (): ControlsState => {
    const userData = getUserDataDir()
    let engine: ControlsState['engine'] = null
    try {
      const v = getVersionState(userData)
      engine = { seal: v.seal, active: v.active }
    } catch (err) {
      console.error('[controls] 엔진 상태를 읽지 못했다:', err)
    }
    return { ...controlsState(userData), engine }
  })

  handle(IPC_CHANNELS.CONTROLS_SET_ENABLED, (_e, req: ControlSetEnabledReq): Ack => {
    if (!req || typeof req.id !== 'string' || typeof req.enabled !== 'boolean') {
      return { ok: false, error: 'invalid request: { id: string, enabled: boolean }' }
    }
    return setControlEnabled(getUserDataDir(), req.id, req.enabled)
  })

  handle(IPC_CHANNELS.CONTROLS_CONFIRM, (_e, req: ControlConfirmReq): Ack => {
    if (!req || !Array.isArray(req.disabled) || !req.disabled.every((x) => typeof x === 'string')) {
      return { ok: false, error: 'invalid request: { disabled: string[] }' }
    }
    return confirmControls(getUserDataDir(), req.disabled)
  })
}
