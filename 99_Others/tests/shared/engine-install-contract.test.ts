import { describe, it, expect } from 'vitest'
import { IPC_CHANNELS } from '../../../02_Source/shared/ipcContract'
import type {
  EngineInstallRequest,
  EngineInstallResult,
  EngineInstallProgress,
  EngineSetActiveRequest,
  EngineVersionState,
} from '../../../02_Source/shared/ipcContract'

describe('ENGINE_INSTALL 채널 상수', () => {
  it('IPC_CHANNELS.ENGINE_INSTALL 가 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.ENGINE_INSTALL).toBe('engine.install')
  })

  it('IPC_CHANNELS.ENGINE_INSTALL_PROGRESS 가 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.ENGINE_INSTALL_PROGRESS).toBe('engine.installProgress')
  })

  it('IPC_CHANNELS.ENGINE_SET_ACTIVE 가 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.ENGINE_SET_ACTIVE).toBe('engine.setActive')
  })

  it('IPC_CHANNELS.ENGINE_VERSION_STATE 가 정확한 문자열로 존재한다', () => {
    expect(IPC_CHANNELS.ENGINE_VERSION_STATE).toBe('engine.versionState')
  })

  it('4개 신규 채널이 모두 전체 채널 목록에 포함된다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(values).toContain('engine.install')
    expect(values).toContain('engine.installProgress')
    expect(values).toContain('engine.setActive')
    expect(values).toContain('engine.versionState')
  })

  it('신규 채널 추가 후에도 전체 채널명이 유니크하다', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('채널명이 dot-namespaced camelCase 규칙을 따른다', () => {
    const pattern = /^[a-z]+\.[a-z][a-zA-Z]*$/
    expect(IPC_CHANNELS.ENGINE_INSTALL).toMatch(pattern)
    expect(IPC_CHANNELS.ENGINE_INSTALL_PROGRESS).toMatch(pattern)
    expect(IPC_CHANNELS.ENGINE_SET_ACTIVE).toMatch(pattern)
    expect(IPC_CHANNELS.ENGINE_VERSION_STATE).toMatch(pattern)
  })
})

describe('EngineInstallRequest 타입 구조', () => {
  it('version(string) 필드를 갖는다', () => {
    const req: EngineInstallRequest = { version: '1.2.3' }
    expect(typeof req.version).toBe('string')
    expect(req.version).toBe('1.2.3')
  })

  it('신뢰경계 — 토큰/키/시크릿 필드가 없다 (version만)', () => {
    const req: EngineInstallRequest = { version: '1.2.3' }
    const keys = Object.keys(req)
    expect(keys).toHaveLength(1)
    expect(keys).toContain('version')
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('apiKey')
    expect(keys).not.toContain('secret')
  })
})

describe('EngineInstallResult 타입 구조', () => {
  it('ok(boolean) 필드를 갖는다 — 성공 케이스', () => {
    const result: EngineInstallResult = { ok: true }
    expect(typeof result.ok).toBe('boolean')
    expect(result.ok).toBe(true)
  })

  it('ok(boolean) + error(string) 필드를 갖는다 — 실패 케이스', () => {
    const result: EngineInstallResult = { ok: false, error: 'npm install failed' }
    expect(result.ok).toBe(false)
    expect(typeof result.error).toBe('string')
  })

  it('성공 케이스 — error 필드는 선택(undefined) 가능하다', () => {
    const result: EngineInstallResult = { ok: true }
    expect(result.error).toBeUndefined()
  })

  it('신뢰경계 — 토큰/키/시크릿 필드가 없다', () => {
    const result: EngineInstallResult = { ok: true }
    const keys = Object.keys(result)
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('apiKey')
    expect(keys).not.toContain('secret')
    expect(keys).not.toContain('accessToken')
  })
})

describe('EngineInstallProgress 타입 구조', () => {
  it('version(string) 필드를 갖는다 — 진행 중 이벤트', () => {
    const progress: EngineInstallProgress = { version: '1.2.3', line: 'npm: fetching...' }
    expect(typeof progress.version).toBe('string')
    expect(progress.version).toBe('1.2.3')
  })

  it('line(string|undefined) 필드를 갖는다 — 마스킹된 npm 출력', () => {
    const progress: EngineInstallProgress = { version: '1.2.3', line: 'added 42 packages' }
    expect(typeof progress.line).toBe('string')
    expect(progress.line).toBe('added 42 packages')
  })

  it('done(boolean) 필드를 갖는다 — 설치 종료 표지', () => {
    const progress: EngineInstallProgress = { version: '1.2.3', done: true, ok: true }
    expect(typeof progress.done).toBe('boolean')
    expect(progress.done).toBe(true)
  })

  it('ok(boolean) 필드를 갖는다 — done 시 성공 여부', () => {
    const progress: EngineInstallProgress = { version: '1.2.3', done: true, ok: true }
    expect(progress.ok).toBe(true)
  })

  it('error(string) 필드를 갖는다 — done 시 오류 메시지', () => {
    const progress: EngineInstallProgress = {
      version: '1.2.3',
      done: true,
      ok: false,
      error: 'ENOENT',
    }
    expect(progress.error).toBe('ENOENT')
  })

  it('진행 중 이벤트 — done/ok/error 는 undefined 가능하다', () => {
    const progress: EngineInstallProgress = { version: '1.2.3', line: 'progress...' }
    expect(progress.done).toBeUndefined()
    expect(progress.ok).toBeUndefined()
    expect(progress.error).toBeUndefined()
  })

  it('신뢰경계 — 토큰/키/시크릿 필드가 없다 (line=마스킹된 출력만)', () => {
    const progress: EngineInstallProgress = { version: '1.2.3', line: 'safe stdout line' }
    const keys = Object.keys(progress)
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('apiKey')
    expect(keys).not.toContain('secret')
    expect(keys).not.toContain('accessToken')
    expect(keys).not.toContain('env')
  })
})

describe('EngineSetActiveRequest 타입 구조', () => {
  it('version(string) 필드를 갖는다', () => {
    const req: EngineSetActiveRequest = { version: '1.2.3' }
    expect(typeof req.version).toBe('string')
    expect(req.version).toBe('1.2.3')
  })

  it('신뢰경계 — version(string) 1개 필드만 존재한다', () => {
    const req: EngineSetActiveRequest = { version: '1.2.3' }
    const keys = Object.keys(req)
    expect(keys).toHaveLength(1)
    expect(keys).toContain('version')
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('apiKey')
    expect(keys).not.toContain('secret')
  })
})

describe('EngineVersionState 타입 구조', () => {
  it('package(string) 필드를 갖는다 — 엔진 npm 패키지명', () => {
    const state: EngineVersionState = {
      package: '@anthropic-ai/claude-agent-sdk',
      bundled: '1.0.0',
      active: null,
      installed: [],
    }
    expect(typeof state.package).toBe('string')
    expect(state.package).toBe('@anthropic-ai/claude-agent-sdk')
  })

  it('bundled(string|null) 필드를 갖는다 — 번들 버전 존재 케이스', () => {
    const state: EngineVersionState = {
      package: '@anthropic-ai/claude-agent-sdk',
      bundled: '1.0.0',
      active: null,
      installed: [],
    }
    expect(state.bundled).toBe('1.0.0')
  })

  it('bundled(string|null) 필드를 갖는다 — 번들 없음 케이스(null)', () => {
    const state: EngineVersionState = {
      package: '@anthropic-ai/claude-agent-sdk',
      bundled: null,
      active: null,
      installed: [],
    }
    expect(state.bundled).toBeNull()
  })

  it('active(string|null) 필드를 갖는다 — 활성 설치 버전 존재 케이스', () => {
    const state: EngineVersionState = {
      package: '@anthropic-ai/claude-agent-sdk',
      bundled: '1.0.0',
      active: '1.2.0',
      installed: ['1.2.0', '1.1.0'],
    }
    expect(state.active).toBe('1.2.0')
  })

  it('active(string|null) 필드를 갖는다 — 번들 사용 중(null)', () => {
    const state: EngineVersionState = {
      package: '@anthropic-ai/claude-agent-sdk',
      bundled: '1.0.0',
      active: null,
      installed: [],
    }
    expect(state.active).toBeNull()
  })

  it('installed(string[]) 필드를 갖는다 — 설치된 버전 목록', () => {
    const state: EngineVersionState = {
      package: '@anthropic-ai/claude-agent-sdk',
      bundled: '1.0.0',
      active: '1.2.0',
      installed: ['1.2.0', '1.1.0', '1.0.5'],
    }
    expect(Array.isArray(state.installed)).toBe(true)
    expect(state.installed).toHaveLength(3)
    expect(state.installed[0]).toBe('1.2.0')
  })

  it('installed(string[]) 필드를 갖는다 — 빈 목록(설치 없음)', () => {
    const state: EngineVersionState = {
      package: '@anthropic-ai/claude-agent-sdk',
      bundled: '1.0.0',
      active: null,
      installed: [],
    }
    expect(state.installed).toHaveLength(0)
  })

  it('신뢰경계 — 토큰/키/시크릿 필드가 없다 (버전 문자열/목록만)', () => {
    const state: EngineVersionState = {
      package: '@anthropic-ai/claude-agent-sdk',
      bundled: '1.0.0',
      active: '1.2.0',
      installed: ['1.2.0'],
    }
    const keys = Object.keys(state)
    expect(keys).toHaveLength(4)
    expect(keys).toContain('package')
    expect(keys).toContain('bundled')
    expect(keys).toContain('active')
    expect(keys).toContain('installed')
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('apiKey')
    expect(keys).not.toContain('secret')
    expect(keys).not.toContain('accessToken')
    expect(keys).not.toContain('credentials')
  })

  it('신뢰경계 — EngineState(authed 전용)와 구조가 다르다 (별개 개념)', () => {
    const state: EngineVersionState = {
      package: '@anthropic-ai/claude-agent-sdk',
      bundled: '1.0.0',
      active: null,
      installed: [],
    }
    const keys = Object.keys(state)
    expect(keys).not.toContain('authed')
    expect(keys).not.toContain('available')
  })
})
