// 메인 프로세스 도메인 경계 스모크 테스트 — M04 Phase 6 루트 파일 소속 정리의 공개 표면이
// 새 경로(10_Engine·00_App/backendStatus·11_Settings·08_Git/git·06_Sessions/multiStore)에서 정상 import되는지만 얕게 확인한다.
// 재편 전에는 이 경로가 존재하지 않으므로 import 자체가 실패해 Red여야 한다.
// 등재 심볼 = 앱 소비처(01_Ipc handlers·00_App/context·04_Claude 동적 import·08_Git/diff)가 실제로 소비하는 심볼만.
import { describe, it, expect } from 'vitest'
import { getEngineState, ENGINE_STATE_BACKEND_ID } from '@main/10_Engine/engineState'
import { getVersionState, setActive, installVersion, loadActiveQuery } from '@main/10_Engine/engineVersions'
import { buildBackendStatuses } from '@main/00_App/backendStatus'
import { getUsage } from '@main/10_Engine/usage'
import { createPrefsStore } from '@main/11_Settings/prefs'
import { createProfileStore } from '@main/11_Settings/profile'
import { gitHeadContent } from '@main/08_Git/git'
import { getMultiStorePath, readMulti, writeMulti } from '@main/06_Sessions/multiStore'

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

  it('08_Git/git·06_Sessions/multiStore의 실소비 심볼이 새 경로에서 export된다', () => {
    expect(typeof gitHeadContent).toBe('function')
    expect(typeof getMultiStorePath).toBe('function')
    expect(typeof readMulti).toBe('function')
    expect(typeof writeMulti).toBe('function')
  })
})
