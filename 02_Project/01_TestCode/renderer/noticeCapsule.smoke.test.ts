// @vitest-environment node
// 캡슐 경계 스모크 테스트 — notice 기능 캡슐(02_Project/00_Source/renderer/src/features/notice)의
// 공개 표면이 새 경로에서 정상 import되는지만 얕게 확인한다.
// 재편(Step 3) 전에는 이 경로가 존재하지 않으므로 import 자체가 실패해 Red여야 한다.
import { describe, it, expect } from 'vitest'
import {
  AppUpdateGate,
  EngineGate,
  EngineUpdateNotice,
  HookTimeline,
  LoopStatusBanner,
  PermissionCard,
  UpdateNotes,
} from '../../../02_Project/00_Source/renderer/src/features/notice'

describe('notice 캡슐 — 공개 표면 스모크', () => {
  it('AppUpdateGate가 캡슐 경로에서 export된다', () => {
    expect(typeof AppUpdateGate).toBe('function')
  })

  it('EngineGate가 캡슐 경로에서 export된다', () => {
    expect(typeof EngineGate).toBe('function')
  })

  it('EngineUpdateNotice가 캡슐 경로에서 export된다', () => {
    expect(typeof EngineUpdateNotice).toBe('function')
  })

  it('HookTimeline이 캡슐 경로에서 export된다', () => {
    expect(typeof HookTimeline).toBe('function')
  })

  it('LoopStatusBanner가 캡슐 경로에서 export된다', () => {
    expect(typeof LoopStatusBanner).toBe('function')
  })

  it('PermissionCard가 캡슐 경로에서 export된다', () => {
    expect(typeof PermissionCard).toBe('function')
  })

  it('UpdateNotes가 캡슐 경로에서 export된다', () => {
    expect(typeof UpdateNotes).toBe('function')
  })
})
