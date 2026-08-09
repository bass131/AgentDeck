// 메인 프로세스 도메인 경계 스모크 테스트 — M04 Phase 6 루트 파일 소속 정리의 공개 표면이
// 새 경로(07_engine·08_personalization·02_fs/git·04_persistence/multiStore)에서 정상 import되는지만 얕게 확인한다.
// 재편 전에는 이 경로가 존재하지 않으므로 import 자체가 실패해 Red여야 한다.
// 등재 심볼 = 앱 소비처(00_ipc handlers·context·01_agents 동적 import·02_fs/diff)가 실제로 소비하는 심볼만.
import { describe, it, expect } from 'vitest'
import { getEngineState, ENGINE_STATE_BACKEND_ID } from '../../../02_Source/main/07_engine/engineState'
import { getVersionState, setActive, installVersion, loadActiveQuery } from '../../../02_Source/main/07_engine/engineVersions'
import { buildBackendStatuses } from '../../../02_Source/main/07_engine/backendStatus'
import { getUsage } from '../../../02_Source/main/07_engine/usage'
import { createPrefsStore } from '../../../02_Source/main/08_personalization/prefs'
import { createProfileStore } from '../../../02_Source/main/08_personalization/profile'
import { gitHeadContent } from '../../../02_Source/main/02_fs/git'
import { getMultiStorePath, readMulti, writeMulti } from '../../../02_Source/main/04_persistence/multiStore'

describe('메인 도메인 — 루트 파일 소속 정리 스모크', () => {
  it('07_engine 4종의 실소비 심볼이 새 경로에서 export된다', () => {
    expect(typeof getEngineState).toBe('function')
    expect(typeof ENGINE_STATE_BACKEND_ID).toBe('string')
    expect(typeof getVersionState).toBe('function')
    expect(typeof setActive).toBe('function')
    expect(typeof installVersion).toBe('function')
    expect(typeof loadActiveQuery).toBe('function')
    expect(typeof buildBackendStatuses).toBe('function')
    expect(typeof getUsage).toBe('function')
  })

  it('08_personalization 2종의 실소비 심볼이 새 경로에서 export된다', () => {
    expect(typeof createPrefsStore).toBe('function')
    expect(typeof createProfileStore).toBe('function')
  })

  it('02_fs/git·04_persistence/multiStore의 실소비 심볼이 새 경로에서 export된다', () => {
    expect(typeof gitHeadContent).toBe('function')
    expect(typeof getMultiStorePath).toBe('function')
    expect(typeof readMulti).toBe('function')
    expect(typeof writeMulti).toBe('function')
  })
})
