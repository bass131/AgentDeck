// 등재 심볼은 앱 소비처가 실제로 쓰는 것만이다. 도메인 경로에서 import되는지만 얕게 본다.
import { describe, it, expect } from 'vitest'
import { getEngineState, ENGINE_STATE_BACKEND_ID } from '@main/10_Engine/engineState'
import { getVersionState, setActive, installVersion, loadActiveQuery } from '@main/10_Engine/engineVersions'
import { buildBackendStatuses } from '@main/00_App/backendStatus'
import { getUsage } from '@main/10_Engine/usage'
import { createPrefsStore } from '@main/11_Settings/prefs'
import { createProfileStore } from '@main/11_Settings/profile'
import { gitHeadContent } from '@main/08_Git/git'

describe('메인 도메인 — 루트 파일 소속 정리 스모크', () => {
  it('10_Engine·00_App/backendStatus 4종의 실소비 심볼이 새 경로에서 export된다', () => {
    expect(typeof getEngineState).toBe('function')
    expect(typeof ENGINE_STATE_BACKEND_ID).toBe('string')
    expect(typeof getVersionState).toBe('function')
    expect(typeof setActive).toBe('function')
    expect(typeof installVersion).toBe('function')
    expect(typeof loadActiveQuery).toBe('function')
    expect(typeof buildBackendStatuses).toBe('function')
    expect(typeof getUsage).toBe('function')
  })

  it('11_Settings 2종의 실소비 심볼이 새 경로에서 export된다', () => {
    expect(typeof createPrefsStore).toBe('function')
    expect(typeof createProfileStore).toBe('function')
  })

  it('08_Git/git의 실소비 심볼이 새 경로에서 export된다', () => {
    expect(typeof gitHeadContent).toBe('function')
  })
})
