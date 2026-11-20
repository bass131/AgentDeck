// M07 G5 — 컨트롤 패널 채널이 설정 묶음의 라우트로 이어진다. 상태는 인자 없는 채널, 토글과 확인은 요청 하나를 받는다.
// 확인이 「사람이 본 꺼진 노드 목록」을 받게 된 것은 G5 검수 중요 2다.
import { describe, it, expect } from 'vitest'
import { API_ROUTES } from '@shared/01_Ipc/apiRoutes'
import type {
  ControlsState,
  ControlSetEnabledReq,
  ControlConfirmReq,
  ReqOf,
  ResOf,
} from '@shared/ipcContract'

describe('컨트롤 패널 라우트 (M07 G5)', () => {
  it('설정 묶음에 상태·토글·확인 셋이 있다', () => {
    expect(API_ROUTES.settings.controlsState).toEqual({ kind: 'call0', channel: 'settings.controlsState' })
    expect(API_ROUTES.settings.setControlEnabled).toEqual({ kind: 'call', channel: 'settings.setControlEnabled' })
    expect(API_ROUTES.settings.confirmControls).toEqual({ kind: 'call', channel: 'settings.confirmControls' })
  })

  it('설정 묶음의 기존 라우트는 그대로다', () => {
    expect(API_ROUTES.settings.setSkillEnabled).toEqual({ kind: 'call', channel: 'settings.setSkillEnabled' })
    expect(API_ROUTES.settings.getProfile).toEqual({ kind: 'call0', channel: 'settings.getProfile' })
  })

  it('요청·응답 타입이 계약 표에 있다', () => {
    const req: ReqOf<'settings.setControlEnabled'> = { id: 'readonly-allow', enabled: false } satisfies ControlSetEnabledReq
    const confirm: ReqOf<'settings.confirmControls'> = { disabled: ['readonly-allow'] } satisfies ControlConfirmReq
    const res: ResOf<'settings.controlsState'> = {
      status: 'error',
      error: 'EISDIR',
      fileReadable: false,
      nodes: [],
      engine: null,
    } satisfies ControlsState
    expect(req.enabled).toBe(false)
    expect(confirm.disabled).toEqual(['readonly-allow'])
    expect(res.status).toBe('error')
  })
})
